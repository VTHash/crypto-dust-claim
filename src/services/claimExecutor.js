// src/services/claimExecutor.js
import axios from 'axios'
import { ethers } from 'ethers'
import walletService from './walletService'
import { encodeFunctionData, erc20Abi } from 'viem'
import { DEPLOYMENTS, DUSTCLAIM_V3_ABI } from '../config/deployments'

/**
 * Mobile-safe behavior goals:
 * - Always send SWAP as a tx to DustClaimV3 (so tx hash = DustClaimV3 interaction)
 * - Prefetch quote BEFORE approval prompt (no wasted time between prompts)
 * - Strictly serialize wallet prompts (MetaMask Mobile will break if overlapping)
 * - Skip tokens with no route safely
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const newFlowId = () => `flow_${Math.random().toString(16).slice(2)}_${Date.now()}`

const isHexAddress = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a)
const isNonZeroAddress = (a) => isHexAddress(a) && a.toLowerCase() !== '0x0000000000000000000000000000000000000000'

function normalizeChainId(chainIdLike) {
  if (typeof chainIdLike === 'string') {
    if (chainIdLike.startsWith('0x')) return parseInt(chainIdLike, 16)
    return Number(chainIdLike)
  }
  return Number(chainIdLike || 0)
}

function normalizeBigInt(v) {
  try {
    if (typeof v === 'bigint') return v
    if (typeof v === 'number') return BigInt(Math.trunc(v))
    if (typeof v === 'string') {
      if (!v.trim()) return 0n
      return BigInt(v)
    }
    return 0n
  } catch {
    return 0n
  }
}

// ------------------------------
// NEW: internal mutex to prevent overlapping MetaMask prompts
// ------------------------------
let _txQueue = Promise.resolve()
function runExclusive(fn) {
  _txQueue = _txQueue.then(fn, fn)
  return _txQueue
}

// ------------------------------
// NEW: quote helper (strict “route exists” validation)
// ------------------------------
async function get0xQuoteStrict({ chainId, sellToken, buyToken, sellAmount, taker, recipient, txOrigin, slippageBps }) {
  const { data: q } = await axios.post(
    '/.netlify/functions/0x-quote',
    {
      chainId,
      sellToken,
      buyToken,
      sellAmount: String(sellAmount),
      taker,
      recipient,
      txOrigin,
      slippageBps: Number(slippageBps ?? 100)
    },
    { headers: { 'content-type': 'application/json' } }
  )

  const to = q?.transaction?.to
  const data = q?.transaction?.data

  // Must have transaction fields to proceed
  if (!isNonZeroAddress(to) || typeof data !== 'string' || data.length < 10) {
    return { ok: false, reason: q?.message || 'No route / quote missing transaction', quote: q }
  }

  // allowance-holder spender used inside DustClaimV3
  const spender = q?.issues?.allowance?.spender || q?.allowanceTarget || null
  if (!isNonZeroAddress(spender)) {
    return { ok: false, reason: '0x quote missing allowance spender', quote: q }
  }

  return {
    ok: true,
    spender,
    calldata: data,
    gas: q?.transaction?.gas ?? null,
    quote: q
  }
}

// ------------------------------
// NEW: allowance check (MUST be for DustClaimV3, since it pulls user tokens)
// ------------------------------
async function hasSufficientAllowanceToDustClaim(provider, token, owner, dustClaimV3, needed) {
  try {
    const allowanceData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'allowance',
      args: [owner, dustClaimV3]
    })

    const raw = await provider.call({ to: token, data: allowanceData })
    const [current] = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], raw)
    return BigInt(current.toString()) >= BigInt(needed)
  } catch {
    return false
  }
}

// ------------------------------
// Flow-aware version (returns { flowId, receipts })
// ------------------------------
export async function executeChainPlanWithFlow(chainPlan, fromAddress) {
  return runExclusive(async () => {
    const receipts = []
    const flowId = newFlowId()

    // Ensure wallet connection
    const connected = await walletService.isConnected?.()
    if (!connected) {
      const res = await walletService.connect?.()
      if (!res?.success) throw new Error(res?.error || 'Wallet connection failed')
    }

    const planChainId = normalizeChainId(chainPlan.chainId)
    const currentChainHex = await walletService.getChainId?.()
    const currentChainId = normalizeChainId(currentChainHex)

    // Switch chain if needed
    if (planChainId !== currentChainId) {
      const sw = await walletService.switchChain(planChainId)
      if (!sw?.success) throw new Error(sw?.error || 'Chain switch failed')

      const afterHex = await walletService.getChainId?.()
      const afterId = normalizeChainId(afterHex)
      if (afterId !== planChainId) {
        throw new Error(`Chain switch did not complete (expected ${planChainId}, got ${afterId})`)
      }

      // tiny yield only
      await sleep(150)
    }

    const from =
      fromAddress ||
      (await walletService.getAddress?.()) ||
      (await (async () => {
        const accs = await walletService.getAccounts?.()
        return accs?.[0] || null
      })())

    if (!from) throw new Error('No wallet address')

    const dep = DEPLOYMENTS?.[planChainId]
    if (!dep?.dustClaimV3 || !isNonZeroAddress(dep.dustClaimV3)) {
      throw new Error(`Missing DustClaimV3 deployment for chain ${planChainId}`)
    }

    const provider = await walletService.getBrowserProvider?.()
    if (!provider) throw new Error('Provider unavailable')

    try {
      walletService.startTxReconciler?.()
    } catch {
      // ignore
    }

    /**
     * STEP 0: Prefetch quotes for all steps FIRST (no wallet prompts).
     * This removes wasted time between approval -> swap on mobile.
     */
    const prepared = []
    for (const step of chainPlan.steps || []) {
      const tokenIn = step.tokenIn
      const tokenOut = step.tokenOut
      const amountWei = normalizeBigInt(step.amount || 0)

      // basic skip rules
      if (!isNonZeroAddress(tokenIn) || !isNonZeroAddress(tokenOut) || amountWei <= 0n) {
        prepared.push({ step, ok: false, skipReason: 'invalid token/amount' })
        continue
      }

      if (step.aggregator && step.aggregator !== '0x') {
        prepared.push({ step, ok: false, skipReason: `unsupported aggregator: ${step.aggregator}` })
        continue
      }

      // allow pre-provided quote
      if (isNonZeroAddress(step.routerSpender) && typeof step.swapCalldata === 'string' && step.swapCalldata.length >= 10) {
        prepared.push({
          step,
          ok: true,
          routerSpender: step.routerSpender,
          swapCalldata: step.swapCalldata,
          gasFromQuote: step.gasFromQuote ?? null
        })
        continue
      }

      // fetch quote now (no wallet prompts here)
      try {
        const q = await get0xQuoteStrict({
          chainId: planChainId,
          sellToken: tokenIn,
          buyToken: tokenOut,
          sellAmount: String(step.amount),
          taker: dep.dustClaimV3,
          recipient: dep.dustClaimV3,
          txOrigin: from,
          slippageBps: step.slippageBps ?? 100
        })

        if (!q.ok) {
          prepared.push({ step, ok: false, skipReason: q.reason || 'no route' })
        } else {
          prepared.push({
            step,
            ok: true,
            routerSpender: q.spender,
            swapCalldata: q.calldata,
            gasFromQuote: q.gas
          })
        }
      } catch (err) {
        prepared.push({
          step,
          ok: false,
          skipReason:
            err?.response?.data?.message ||
            err?.response?.data?.error ||
            err?.message ||
            'quote failed'
        })
      }
    }

    /**
     * STEP LOOP: now do wallet prompts strictly sequentially.
     * For each prepared item:
     * - If no route, skip cleanly
     * - Approve DustClaimV3 (if needed)
     * - Immediately call DustClaimV3.claimDustUsingAggregator(...)
     */
    for (const p of prepared) {
      const step = p.step
      const tokenIn = step.tokenIn
      const tokenOut = step.tokenOut
      const amountWei = normalizeBigInt(step.amount || 0)

      if (!p.ok) {
        receipts.push({
          flowId,
          type: 'swap',
          ok: true,
          skipped: true,
          reason: p.skipReason || 'skipped',
          chainId: planChainId,
          tokenIn,
          tokenOut
        })
        continue
      }

      const routerSpender = p.routerSpender
      const swapCalldata = p.swapCalldata
      const gasFromQuote = p.gasFromQuote

      if (!isNonZeroAddress(routerSpender) || typeof swapCalldata !== 'string' || swapCalldata.length < 10) {
        receipts.push({
          flowId,
          type: 'swap',
          ok: true,
          skipped: true,
          reason: 'missing spender/calldata (no route)',
          chainId: planChainId,
          tokenIn,
          tokenOut
        })
        continue
      }

      // 1) APPROVE (spender = DustClaimV3)
      if (step.needsApproval && !step.usePermit) {
        try {
          const okAllowance = await hasSufficientAllowanceToDustClaim(provider, tokenIn, from, dep.dustClaimV3, amountWei)
          if (!okAllowance) {
            const approvalData = encodeFunctionData({
              abi: erc20Abi,
              functionName: 'approve',
              args: [dep.dustClaimV3, amountWei]
            })

            const approvalRes = await walletService.sendTransactionWithReceipt(
              { from, to: tokenIn, data: approvalData, value: 0n },
              {
                flowId,
                kind: 'approval',
                title: 'Approve token',
                step: 'approval',
                tokenAddress: tokenIn,
                spender: dep.dustClaimV3,
                amount: String(amountWei),
                waitConfirms: 1,
                waitTimeoutMs: 240000
              }
            )

            receipts.push({
              flowId,
              type: 'approval',
              ok: !!approvalRes?.success,
              txHash: approvalRes?.txHash || null,
              status: approvalRes?.status || null,
              chainId: planChainId,
              tokenIn,
              spender: dep.dustClaimV3,
              amount: String(amountWei),
              blockNumber: approvalRes?.receipt?.blockNumber ?? null,
              error: approvalRes?.error || null,
              warning: approvalRes?.warning || null
            })

            if (!approvalRes?.success) {
              // approval failed: skip swap, proceed to next
              continue
            }
          } else {
            receipts.push({
              flowId,
              type: 'approval',
              ok: true,
              skipped: true,
              reason: 'allowance already sufficient',
              chainId: planChainId,
              tokenIn,
              spender: dep.dustClaimV3,
              amount: String(amountWei)
            })
          }
        } catch (err) {
          receipts.push({
            flowId,
            type: 'approval',
            ok: false,
            chainId: planChainId,
            tokenIn,
            spender: dep.dustClaimV3,
            amount: String(amountWei),
            error: err?.shortMessage || err?.reason || err?.message || 'Approval failed'
          })
          continue
        }
      }

      // tiny yield between prompts (NOT long pacing)
      await sleep(120)

      // 2) SWAP via DustClaimV3 (THIS is the tx hash you want to show)
      try {
        const claimData = encodeFunctionData({
          abi: DUSTCLAIM_V3_ABI,
          functionName: 'claimDustUsingAggregator',
          args: [tokenIn, amountWei, routerSpender, swapCalldata]
        })

        // gasLimit strategy
        let gasLimit = gasFromQuote ? BigInt(gasFromQuote) + 120_000n : 950_000n

        // Try estimateGas via signer (best), but do not block if it fails
        try {
          const signer = await walletService.getSigner?.()
          if (signer) {
            const contract = new ethers.Contract(dep.dustClaimV3, DUSTCLAIM_V3_ABI, signer)
            const est = await contract.claimDustUsingAggregator.estimateGas(tokenIn, amountWei, routerSpender, swapCalldata)
            const bumped = (BigInt(est) * 135n) / 100n
            if (bumped > gasLimit) gasLimit = bumped
          }
        } catch {
          // keep fallback
        }

        const swapRes = await walletService.sendTransactionWithReceipt(
          {
            from,
            to: dep.dustClaimV3, // IMPORTANT: interaction hash will be DustClaimV3
            data: claimData,
            value: 0n,
            gasLimit
          },
          {
            flowId,
            kind: 'swap',
            title: 'Claim Dust (DustClaimV3)',
            step: 'swap',
            tokenAddress: tokenIn,
            spender: routerSpender,
            amount: String(amountWei),
            waitConfirms: 1,
            waitTimeoutMs: 360000
          }
        )

        receipts.push({
          flowId,
          type: 'swap',
          ok: !!swapRes?.success,
          txHash: swapRes?.txHash || null,
          status: swapRes?.status || null,
          chainId: planChainId,
          tokenIn,
          tokenOut,
          routerSpender,
          dustClaimV3: dep.dustClaimV3,
          blockNumber: swapRes?.receipt?.blockNumber ?? null,
          error: swapRes?.error || null,
          warning: swapRes?.warning || null
        })
      } catch (err) {
        receipts.push({
          flowId,
          type: 'swap',
          ok: false,
          chainId: planChainId,
          tokenIn,
          tokenOut,
          error:
            err?.response?.data?.error ||
            err?.response?.data?.message ||
            err?.shortMessage ||
            err?.reason ||
            err?.message ||
            'Swap failed'
        })
      }

      // tiny yield; do not “pace” heavily
      await sleep(120)
    }

    return { flowId, receipts }
  })
}

// ------------------------------
// Backwards-compatible version (returns receipts[])
// ------------------------------
export async function executeChainPlan(chainPlan, fromAddress) {
  const { receipts } = await executeChainPlanWithFlow(chainPlan, fromAddress)
  return receipts
}
