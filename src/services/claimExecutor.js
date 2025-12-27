import axios from 'axios'
import { ethers } from 'ethers'
import walletService from './walletService'
import { encodeFunctionData, erc20Abi } from 'viem'
import { DEPLOYMENTS, DUSTCLAIM_V3_ABI } from '../config/deployments'

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
    if (typeof v === 'string') return BigInt(v)
    return 0n
  } catch {
    return 0n
  }
}

// ------------------------------
// NEW: Flow-aware version (returns { flowId, receipts })
// ------------------------------
export async function executeChainPlanWithFlow(chainPlan, fromAddress) {
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

    await sleep(500)
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

  // Allowance check: MUST be for DustClaimV3 (it pulls user tokens)
  async function hasSufficientAllowanceToDustClaim(token, owner, needed) {
    try {
      const allowanceData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'allowance',
        args: [owner, dep.dustClaimV3]
      })

      const raw = await provider.call({ to: token, data: allowanceData })
      const [current] = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], raw)
      return BigInt(current.toString()) >= BigInt(needed)
    } catch {
      return false
    }
  }

  // Quote helper with strict “route exists” validation
  async function get0xQuote({ chainId, sellToken, buyToken, sellAmount }) {
    const { data: q } = await axios.post(
      '/.netlify/functions/0x-quote',
      {
        chainId,
        sellToken,
        buyToken,
        sellAmount: String(sellAmount),
        taker: dep.dustClaimV3,
        recipient: dep.dustClaimV3,
        txOrigin: from,
        slippageBps: Math.round(Number(1) * 100) // keep 1% default unless step overrides below
      },
      { headers: { 'content-type': 'application/json' } }
    )

    // Hard requirement: transaction.to + transaction.data must exist
    const to = q?.transaction?.to
    const data = q?.transaction?.data

    if (!isNonZeroAddress(to) || typeof data !== 'string' || data.length < 10) {
      return { ok: false, reason: q?.message || 'No route / quote missing transaction', quote: q }
    }

    // allowance holder spender (used INSIDE DustClaimV3)
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

  // Process steps sequentially (mobile-safe)
  for (const step of chainPlan.steps || []) {
    const tokenIn = step.tokenIn
    const tokenOut = step.tokenOut

    // Basic validation / skip
    if (!isNonZeroAddress(tokenIn) || !isNonZeroAddress(tokenOut)) {
      receipts.push({
        flowId,
        type: 'skip',
        ok: true,
        skipped: true,
        reason: 'invalid token address',
        tokenIn,
        tokenOut
      })
      continue
    }

    const amountWei = normalizeBigInt(step.amount || 0)
    if (amountWei <= 0n) {
      receipts.push({
        flowId,
        type: 'skip',
        ok: true,
        skipped: true,
        reason: 'zero amount',
        tokenIn,
        tokenOut
      })
      continue
    }

    // Only support 0x in this executor
    if (step.aggregator && step.aggregator !== '0x') {
      receipts.push({
        flowId,
        type: 'skip',
        ok: true,
        skipped: true,
        reason: `unsupported aggregator: ${step.aggregator}`,
        tokenIn,
        tokenOut
      })
      continue
    }

    // 1) APPROVE (ALWAYS approve DustClaimV3, never the 0x allowanceTarget)
    if (step.needsApproval && !step.usePermit) {
      try {
        const okAllowance = await hasSufficientAllowanceToDustClaim(tokenIn, from, amountWei)
        if (okAllowance) {
          receipts.push({
            flowId,
            type: 'approval',
            ok: true,
            skipped: true,
            reason: 'allowance already sufficient',
            tokenIn,
            spender: dep.dustClaimV3,
            amount: String(amountWei)
          })
        } else {
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
              waitTimeoutMs: 180000
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
            // If approval fails, skip swap and continue
            await sleep(600)
            continue
          }

          await sleep(900) // MetaMask mobile pacing
        }
      } catch (err) {
        receipts.push({
          flowId,
          type: 'approval',
          ok: false,
          error: err?.shortMessage || err?.reason || err?.message || 'Approval failed',
          tokenIn,
          spender: dep.dustClaimV3,
          amount: String(amountWei)
        })
        await sleep(600)
        continue
      }
    }

    // 2) QUOTE (skip safely if no route)
    let routerSpender = null
    let swapCalldata = null
    let gasFromQuote = null

    try {
      // If step already provided a quote, still validate it
      if (isNonZeroAddress(step.routerSpender) && typeof step.swapCalldata === 'string') {
        routerSpender = step.routerSpender
        swapCalldata = step.swapCalldata
      } else {
        const q = await get0xQuote({
          chainId: planChainId,
          sellToken: tokenIn,
          buyToken: tokenOut,
          sellAmount: String(step.amount)
        })

        if (!q.ok) {
          receipts.push({
            flowId,
            type: 'swap',
            ok: true,
            skipped: true,
            reason: q.reason || 'no route',
            tokenIn,
            tokenOut
          })
          await sleep(250)
          continue
        }

        routerSpender = q.spender
        swapCalldata = q.calldata
        gasFromQuote = q.gas
      }
    } catch (err) {
      receipts.push({
        flowId,
        type: 'swap',
        ok: true,
        skipped: true,
        reason:
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'quote failed',
        tokenIn,
        tokenOut
      })
      await sleep(250)
      continue
    }

    if (!isNonZeroAddress(routerSpender) || typeof swapCalldata !== 'string' || swapCalldata.length < 10) {
      receipts.push({
        flowId,
        type: 'swap',
        ok: true,
        skipped: true,
        reason: 'missing spender/calldata (no route)',
        tokenIn,
        tokenOut
      })
      await sleep(250)
      continue
    }

    // 3) SWAP via DustClaimV3
    try {
      const data = encodeFunctionData({
        abi: DUSTCLAIM_V3_ABI,
        functionName: 'claimDustUsingAggregator',
        args: [tokenIn, amountWei, routerSpender, swapCalldata]
      })

      let gasLimit = gasFromQuote ? BigInt(gasFromQuote) + 80_000n : 950_000n

      // Optional gas estimate bump
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
        { from, to: dep.dustClaimV3, data, value: 0n, gasLimit },
        {
          flowId,
          kind: 'swap',
          title: 'Swap via 0x',
          step: 'swap',
          tokenAddress: tokenIn,
          spender: routerSpender,
          amount: String(amountWei),
          waitConfirms: 1,
          waitTimeoutMs: 240000
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
        blockNumber: swapRes?.receipt?.blockNumber ?? null,
        error: swapRes?.error || null,
        warning: swapRes?.warning || null
      })

      await sleep(900) // MetaMask mobile pacing
    } catch (err) {
      receipts.push({
        flowId,
        type: 'swap',
        ok: false,
        error:
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.shortMessage ||
          err?.reason ||
          err?.message ||
          'Swap failed',
        tokenIn,
        tokenOut
      })
      await sleep(600)
    }
  }

  return { flowId, receipts }
}

// ------------------------------
// Backwards-compatible version (returns receipts[])
// ------------------------------
export async function executeChainPlan(chainPlan, fromAddress) {
  const { receipts } = await executeChainPlanWithFlow(chainPlan, fromAddress)
  return receipts
  }
