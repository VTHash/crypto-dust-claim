// src/services/claimExecutor.js
import axios from 'axios'
import { ethers } from 'ethers'
import walletService from './walletService'
import { encodeFunctionData, erc20Abi } from 'viem'
import { DEPLOYMENTS, DUSTCLAIM_V3_ABI } from '../config/deployments'

/**
 * DEVICE-AWARE UX (Desktop vs Mobile)
 * ----------------------------------
 * Goal: Make MetaMask Mobile reliable by NEVER sending approval + swap back-to-back automatically.
 *
 * - Desktop: default can do "one click" (approval -> swap) sequentially.
 * - Mobile: MUST split into 2 user actions:
 * 1) Approve required tokens
 * 2) Claim Dust (swap) for prepared routes
 *
 * This file exposes a 2-step API while keeping backwards compatibility:
 * - prepareChainPlanWithFlow(chainPlan, fromAddress)
 * - executeApprovalsWithFlow(preparedCtx)
 * - executeSwapsWithFlow(preparedCtx)
 * - executeChainPlanWithFlow(chainPlan, fromAddress, opts) // wrapper
 * - executeChainPlan(chainPlan, fromAddress) // receipts[] wrapper
 *
 * NOTE:
 * - Swaps ALWAYS call DustClaimV3.claimDustUsingAggregator (per your requirement)
 * - txOrigin for 0x quote is ALWAYS the user (from)
 */

// ----------------------------------
// utils
// ----------------------------------
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

function isProbablyMobile() {
  if (typeof navigator === 'undefined') return false
  const ua = (navigator.userAgent || '').toLowerCase()
  if (/android|iphone|ipad|ipod|iemobile|windows phone|mobile/.test(ua)) return true
  if (/metamaskmobile/.test(ua)) return true
  return false
}

// ----------------------------------
// internal mutex: prevent overlapping wallet prompts (critical on mobile)
// ----------------------------------
let _txQueue = Promise.resolve()
function runExclusive(fn) {
  _txQueue = _txQueue.then(fn, fn)
  return _txQueue
}

// ----------------------------------
// 0x quote helper (strict route validation)
// ----------------------------------
async function get0xQuoteStrict({
  chainId,
  sellToken,
  buyToken,
  sellAmount,
  taker,
  recipient,
  txOrigin,
  slippageBps
}) {
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

// ----------------------------------
// allowance check (spender MUST be DustClaimV3, since it pulls user tokens)
// ----------------------------------
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

// ----------------------------------
// STEP A: Prepare plan (NO wallet prompts)
// ----------------------------------
export async function prepareChainPlanWithFlow(chainPlan, fromAddress) {
  return runExclusive(async () => {
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

    // Prefetch quotes for all steps FIRST (no wallet prompts).
    const prepared = []
    for (const step of chainPlan.steps || []) {
      const tokenIn = step.tokenIn
      const tokenOut = step.tokenOut
      const amountWei = normalizeBigInt(step.amount || 0)

      if (!isNonZeroAddress(tokenIn) || !isNonZeroAddress(tokenOut) || amountWei <= 0n) {
        prepared.push({ step, ok: false, skipReason: 'invalid token/amount' })
        continue
      }

      if (step.aggregator && step.aggregator !== '0x') {
        prepared.push({ step, ok: false, skipReason: `unsupported aggregator: ${step.aggregator}` })
        continue
      }

      // allow pre-provided quote
      if (
        isNonZeroAddress(step.routerSpender) &&
        typeof step.swapCalldata === 'string' &&
        step.swapCalldata.length >= 10
      ) {
        prepared.push({
          step,
          ok: true,
          routerSpender: step.routerSpender,
          swapCalldata: step.swapCalldata,
          gasFromQuote: step.gasFromQuote ?? null
        })
        continue
      }

      try {
        const q = await get0xQuoteStrict({
          chainId: planChainId,
          sellToken: tokenIn,
          buyToken: tokenOut,
          sellAmount: String(amountWei),
          taker: dep.dustClaimV3,
          recipient: dep.dustClaimV3,
          txOrigin: from, // CRITICAL FIX: user is txOrigin
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

    // Summaries for UI
    const approvalSet = new Map() // tokenIn -> needed amount (max)
    let swappableCount = 0

    for (const p of prepared) {
      const step = p.step
      const tokenIn = step?.tokenIn
      const amountWei = normalizeBigInt(step?.amount || 0)

      if (!p.ok) continue
      if (!isNonZeroAddress(p.routerSpender) || typeof p.swapCalldata !== 'string' || p.swapCalldata.length < 10) {
        continue
      }

      swappableCount += 1

      if (step?.needsApproval && !step?.usePermit && isNonZeroAddress(tokenIn) && amountWei > 0n) {
        const prev = approvalSet.get(tokenIn) || 0n
        if (amountWei > prev) approvalSet.set(tokenIn, amountWei)
      }
    }

    const approvalsNeeded = Array.from(approvalSet.entries()).map(([tokenAddress, amountWei]) => ({
      tokenAddress,
      amountWei
    }))

    return {
      flowId,
      chainId: planChainId,
      from,
      dustClaimV3: dep.dustClaimV3,
      prepared,
      approvalsNeeded,
      swappableCount,
      isMobile: isProbablyMobile()
    }
  })
}

// ----------------------------------
// STEP B: Execute approvals ONLY
// ----------------------------------
export async function executeApprovalsWithFlow(preparedCtx) {
  return runExclusive(async () => {
    const receipts = []

    const flowId = preparedCtx?.flowId || newFlowId()
    const planChainId = normalizeChainId(preparedCtx?.chainId)
    const from = preparedCtx?.from || (await walletService.getAddress?.())
    const dustClaimV3 = preparedCtx?.dustClaimV3

    if (!from) throw new Error('No wallet address')
    if (!planChainId) throw new Error('Missing chainId in prepared context')
    if (!isNonZeroAddress(dustClaimV3)) throw new Error('Missing DustClaimV3 in prepared context')

    // Ensure still on correct chain
    const currentChainHex = await walletService.getChainId?.()
    const currentChainId = normalizeChainId(currentChainHex)
    if (currentChainId !== planChainId) {
      const sw = await walletService.switchChain(planChainId)
      if (!sw?.success) throw new Error(sw?.error || 'Chain switch failed')
      await sleep(150)
    }

    const provider = await walletService.getBrowserProvider?.()
    if (!provider) throw new Error('Provider unavailable')

    const approvalsNeeded = Array.isArray(preparedCtx?.approvalsNeeded) ? preparedCtx.approvalsNeeded : []

    for (const a of approvalsNeeded) {
      const tokenIn = a?.tokenAddress
      const amountWei = normalizeBigInt(a?.amountWei)

      if (!isNonZeroAddress(tokenIn) || amountWei <= 0n) {
        receipts.push({
          flowId,
          type: 'approval',
          ok: true,
          skipped: true,
          reason: 'invalid token/amount',
          chainId: planChainId,
          tokenIn,
          spender: dustClaimV3,
          amount: String(amountWei)
        })
        continue
      }

      try {
        const okAllowance = await hasSufficientAllowanceToDustClaim(provider, tokenIn, from, dustClaimV3, amountWei)
        if (okAllowance) {
          receipts.push({
            flowId,
            type: 'approval',
            ok: true,
            skipped: true,
            reason: 'allowance already sufficient',
            chainId: planChainId,
            tokenIn,
            spender: dustClaimV3,
            amount: String(amountWei)
          })
          continue
        }

        const approvalData = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [dustClaimV3, amountWei]
        })

        const approvalRes = await walletService.sendTransactionWithReceipt(
          { from, to: tokenIn, data: approvalData, value: 0n },
          {
            flowId,
            kind: 'approval',
            title: 'Approve token',
            step: 'approval',
            tokenAddress: tokenIn,
            spender: dustClaimV3,
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
          spender: dustClaimV3,
          amount: String(amountWei),
          blockNumber: approvalRes?.receipt?.blockNumber ?? null,
          error: approvalRes?.error || null,
          warning: approvalRes?.warning || null
        })

        // Mobile-safe default: stop on first failure
        if (!approvalRes?.success) break
      } catch (err) {
        receipts.push({
          flowId,
          type: 'approval',
          ok: false,
          chainId: planChainId,
          tokenIn,
          spender: dustClaimV3,
          amount: String(amountWei),
          error: err?.shortMessage || err?.reason || err?.message || 'Approval failed'
        })
        break
      }

      await sleep(150)
    }

    return { flowId, receipts }
  })
}

// ----------------------------------
// STEP C: Execute swaps ONLY (DustClaimV3.claimDustUsingAggregator)
// ----------------------------------
export async function executeSwapsWithFlow(preparedCtx) {
  return runExclusive(async () => {
    const receipts = []

    const flowId = preparedCtx?.flowId || newFlowId()
    const planChainId = normalizeChainId(preparedCtx?.chainId)
    const from = preparedCtx?.from || (await walletService.getAddress?.())
    const dustClaimV3 = preparedCtx?.dustClaimV3

    if (!from) throw new Error('No wallet address')
    if (!planChainId) throw new Error('Missing chainId in prepared context')
    if (!isNonZeroAddress(dustClaimV3)) throw new Error('Missing DustClaimV3 in prepared context')

    // Ensure still on correct chain
    const currentChainHex = await walletService.getChainId?.()
    const currentChainId = normalizeChainId(currentChainHex)
    if (currentChainId !== planChainId) {
      const sw = await walletService.switchChain(planChainId)
      if (!sw?.success) throw new Error(sw?.error || 'Chain switch failed')
      await sleep(150)
    }

    const prepared = Array.isArray(preparedCtx?.prepared) ? preparedCtx.prepared : []

    for (const p of prepared) {
      const step = p.step
      const tokenIn = step?.tokenIn
      const tokenOut = step?.tokenOut
      const amountWei = normalizeBigInt(step?.amount || 0)

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

      await sleep(150)

      try {
        const claimData = encodeFunctionData({
          abi: DUSTCLAIM_V3_ABI,
          functionName: 'claimDustUsingAggregator',
          args: [tokenIn, amountWei, routerSpender, swapCalldata]
        })

        let gasLimit = gasFromQuote ? BigInt(gasFromQuote) + 120_000n : 950_000n

        try {
          const signer = await walletService.getSigner?.()
          if (signer) {
            const contract = new ethers.Contract(dustClaimV3, DUSTCLAIM_V3_ABI, signer)
            const est = await contract.claimDustUsingAggregator.estimateGas(
              tokenIn,
              amountWei,
              routerSpender,
              swapCalldata
            )
            const bumped = (BigInt(est) * 135n) / 100n
            if (bumped > gasLimit) gasLimit = bumped
          }
        } catch {
          // keep fallback
        }

        const swapRes = await walletService.sendTransactionWithReceipt(
          {
            from,
            to: dustClaimV3,
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
          dustClaimV3,
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

      await sleep(150)
    }

    return { flowId, receipts }
  })
}

// ----------------------------------
// DEVICE-AWARE WRAPPER
// ----------------------------------
export async function executeChainPlanWithFlow(chainPlan, fromAddress, opts = {}) {
  return runExclusive(async () => {
    // mode: 'auto' | 'approveOnly' | 'swapOnly' | 'all'
    const mode = String(opts?.mode || 'auto')
    const preparedCtx = opts?.preparedCtx || (await prepareChainPlanWithFlow(chainPlan, fromAddress))

    // Explicit modes (for your two-button UX)
    if (mode === 'approveOnly') {
      const approvals = await executeApprovalsWithFlow(preparedCtx)
      return { flowId: preparedCtx.flowId, receipts: approvals?.receipts || [], preparedCtx, nextAction: 'swap' }
    }
    if (mode === 'swapOnly') {
      const swaps = await executeSwapsWithFlow(preparedCtx)
      return { flowId: preparedCtx.flowId, receipts: swaps?.receipts || [], preparedCtx, nextAction: null }
    }
    if (mode === 'all') {
      const approvals = await executeApprovalsWithFlow(preparedCtx)
      const swaps = await executeSwapsWithFlow(preparedCtx)
      return {
        flowId: preparedCtx.flowId,
        receipts: [...(approvals?.receipts || []), ...(swaps?.receipts || [])],
        preparedCtx,
        nextAction: null
      }
    }

    // AUTO: mobile splits, desktop one-click
    const approvals = await executeApprovalsWithFlow(preparedCtx)

    if (preparedCtx.isMobile) {
      const receipts = [...(approvals?.receipts || [])]
      receipts.push({
        flowId: preparedCtx.flowId,
        type: 'ux',
        ok: true,
        chainId: preparedCtx.chainId,
        nextAction: 'swap',
        message: 'Approvals complete. On mobile, proceed with Claim Dust as a separate action.'
      })
      return { flowId: preparedCtx.flowId, receipts, preparedCtx, nextAction: 'swap' }
    }

    const swaps = await executeSwapsWithFlow(preparedCtx)
    return {
      flowId: preparedCtx.flowId,
      receipts: [...(approvals?.receipts || []), ...(swaps?.receipts || [])],
      preparedCtx,
      nextAction: null
    }
  })
}

// Backwards-compatible version (returns receipts[])
export async function executeChainPlan(chainPlan, fromAddress) {
  const { receipts } = await executeChainPlanWithFlow(chainPlan, fromAddress)
  return receipts
}