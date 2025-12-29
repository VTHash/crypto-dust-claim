// src/services/claimExecutor.js
import axios from 'axios'
import { ethers } from 'ethers'
import walletService from './walletService'
import { encodeFunctionData, erc20Abi } from 'viem'
import { DEPLOYMENTS, DUSTCLAIM_V3_ABI } from '../config/deployments'

/**
 * MetaMask + 0x + Multichain Execution (UX-safe)
<<<<<<< HEAD
 * ---------------------------------------------
 * UPDATED: 0x Swap API v2 (Allowance Holder Quote)
 *
 * Primary goals:
 * 1) MetaMask Mobile reliability: never parallelize wallet prompts; never back-to-back auto approve+swap on mobile.
 * 2) Chain correctness: only approve/swap on currently-selected chain; enforce/verify chain switch.
 * 3) Token approval correctness: spender is ALWAYS DustClaimV3 (user approves DustClaimV3, not 0x).
 * 4) 0x v2 allowance-holder routes: DustClaimV3 calls `routerSpender.call(calldata)` so:
 *    - routerSpender MUST equal quote.transaction.to
 *    - calldata MUST equal quote.transaction.data
 * 5) Better UX hooks: optional progress callbacks for UI, plus safe dedup and USDT-like approval handling.
=======
>>>>>>> a3da296ab (Refactor 0x-quote, claimExecutor, ClaimScreen)
 *
 * This version assumes 0x Swap API v2 is used server-side (Netlify function),
 * and the function returns a normalized payload including:
 * - transaction: { to, data, value?, gas? }
 * - issues.allowance.spender (or allowanceTarget)
 *
 * DustClaimV3 compatibility rule:
 * - DustClaimV3 does: approve(spender) then spender.call(calldata)
 * - therefore spender MUST equal transaction.to
 */

// ----------------------------------
// utils
// ----------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const newFlowId = () => `flow_${Math.random().toString(16).slice(2)}_${Date.now()}`

const isHexAddress = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a)
const isNonZeroAddress = (a) => isHexAddress(a) && a.toLowerCase() !== ethers.ZeroAddress.toLowerCase()

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
  if (/metamaskmobile/.test(ua)) return true
  if (/android|iphone|ipad|ipod|iemobile|windows phone|mobile/.test(ua)) return true
  return false
}

function normalizeAddr(a) {
  return String(a || '').toLowerCase()
}

const MAX_UINT256 = (2n ** 256n) - 1n

function isUserRejected(err) {
  const msg = String(err?.shortMessage || err?.reason || err?.message || '').toLowerCase()
  const code = err?.code
  if (code === 4001) return true
  if (msg.includes('user rejected')) return true
  if (msg.includes('user denied')) return true
  if (msg.includes('rejected the request')) return true
  if (msg.includes('request rejected')) return true
  return false
}

function isPendingRequest(err) {
  const msg = String(err?.shortMessage || err?.reason || err?.message || '').toLowerCase()
  return msg.includes('already processing') || msg.includes('request already pending') || msg.includes('pending request')
}

function isMustZeroFirstApprove(err) {
  const msg = String(err?.shortMessage || err?.reason || err?.message || '').toLowerCase()
  return (
    msg.includes('approve from non-zero to non-zero allowance') ||
    msg.includes('must set allowance to 0') ||
    msg.includes('must approve 0') ||
    msg.includes('non-zero allowance') ||
    msg.includes('set allowance to 0')
  )
}

// ----------------------------------
// internal mutex: prevent overlapping wallet prompts
// ----------------------------------
let _txQueue = Promise.resolve()
function runExclusive(fn) {
  _txQueue = _txQueue.then(fn, fn)
  return _txQueue
}

// ----------------------------------
// UI progress helpers (optional)
// ----------------------------------
function safeCall(cb, payload) {
  try {
    cb?.(payload)
  } catch {
    // ignore
  }
}

// ----------------------------------
// 0x v2 quote helper (strict route validation)
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
<<<<<<< HEAD
  // Netlify function calls 0x v2 /swap/allowance-holder/quote
=======
  // Netlify returns normalized v2 response including transaction {to,data}
>>>>>>> a3da296ab (Refactor 0x-quote, claimExecutor, ClaimScreen)
  const { data: q } = await axios.post(
    '/.netlify/functions/0x-quote',
    {
      chainId,
      sellToken,
      buyToken,
      sellAmount: String(sellAmount),
      taker,      // DustClaimV3
      recipient,  // DustClaimV3
      txOrigin,   // USER EOA (required when taker is contract)
      slippageBps: Number(slippageBps ?? 100)
    },
    { headers: { 'content-type': 'application/json' } }
  )

<<<<<<< HEAD
  // v2 response: transaction.to + transaction.data
  const to = q?.transaction?.to
  const data = q?.transaction?.data

=======
  // If function returns an error wrapper, surface it clearly
  if (q?.error && !q?.transaction?.to) {
    const msg =
      q?.data?.message ||
      q?.data?.reason ||
      q?.message ||
      q?.error ||
      '0x quote error'
    return { ok: false, reason: msg, quote: q }
  }

  const to = q?.transaction?.to || q?.to
  const data = q?.transaction?.data || q?.data
>>>>>>> a3da296ab (Refactor 0x-quote, claimExecutor, ClaimScreen)
  if (!isNonZeroAddress(to) || typeof data !== 'string' || data.length < 10) {
    return { ok: false, reason: q?.message || 'No route / quote missing transaction', quote: q }
  }

<<<<<<< HEAD
  // Allowance-holder spender is provided on v2 as issues.allowance.spender (defensive fallbacks kept)
=======
  // allowance-holder spender used inside DustClaimV3
>>>>>>> a3da296ab (Refactor 0x-quote, claimExecutor, ClaimScreen)
  const spender =
    q?.issues?.allowance?.spender ||
    q?.allowanceTarget ||
    q?.allowance?.spender ||
    null

  if (!isNonZeroAddress(spender)) {
    return { ok: false, reason: '0x quote missing allowance spender', quote: q }
  }

  // CRITICAL for DustClaimV3: it calls spender.call(calldata) so spender MUST equal tx.to
  if (normalizeAddr(spender) !== normalizeAddr(to)) {
    return { ok: false, reason: 'V3 incompatible route (tx.to != allowance spender)', quote: q }
  }

  return {
    ok: true,
    spender,
    calldata: data,
    gas: q?.transaction?.gas ?? q?.gas ?? null,
    quote: q
  }
}

// ----------------------------------
// allowance check (spender MUST be DustClaimV3)
// ----------------------------------
async function getAllowanceToDustClaim(provider, token, owner, dustClaimV3) {
  const allowanceData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, dustClaimV3]
  })

  const raw = await provider.call({ to: token, data: allowanceData })
  const [current] = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], raw)
  return BigInt(current.toString())
}

async function hasSufficientAllowanceToDustClaim(provider, token, owner, dustClaimV3, needed) {
  try {
    const allowance = await getAllowanceToDustClaim(provider, token, owner, dustClaimV3)
    return allowance >= BigInt(needed)
  } catch {
    return false
  }
}

// ----------------------------------
// STEP A: Prepare plan (NO wallet prompts)
// ----------------------------------
export async function prepareChainPlanWithFlow(chainPlan, fromAddress, opts = {}) {
  return runExclusive(async () => {
    const flowId = newFlowId()
    const onProgress = opts?.onProgress || chainPlan?.onProgress || null

    const connected = await walletService.isConnected?.()
    if (!connected) {
      safeCall(onProgress, { flowId, stage: 'wallet', status: 'connecting' })
      const res = await walletService.connect?.()
      if (!res?.success) throw new Error(res?.error || 'Wallet connection failed')
    }

    const planChainId = normalizeChainId(chainPlan.chainId)
    const currentChainHex = await walletService.getChainId?.()
    const currentChainId = normalizeChainId(currentChainHex)

<<<<<<< HEAD
=======
    // Switch chain if needed
>>>>>>> a3da296ab (Refactor 0x-quote, claimExecutor, ClaimScreen)
    if (planChainId !== currentChainId) {
      safeCall(onProgress, { flowId, stage: 'chain', status: 'switching', from: currentChainId, to: planChainId })

      const sw = await walletService.switchChain(planChainId)
      if (!sw?.success) throw new Error(sw?.error || 'Chain switch failed')

      const afterHex = await walletService.getChainId?.()
      const afterId = normalizeChainId(afterHex)
      if (afterId !== planChainId) {
        throw new Error(`Chain switch did not complete (expected ${planChainId}, got ${afterId})`)
      }

      await sleep(isProbablyMobile() ? 450 : 150)
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
    } catch {}

    const prepared = []
    const steps = Array.isArray(chainPlan.steps) ? chainPlan.steps : []

    safeCall(onProgress, { flowId, stage: 'quote', status: 'starting', total: steps.length })

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      const tokenIn = step.tokenIn
      const tokenOut = step.tokenOut
      const amountWei = normalizeBigInt(step.amount || 0)

      safeCall(onProgress, { flowId, stage: 'quote', status: 'progress', index: i, total: steps.length, tokenIn, amount: String(amountWei) })

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
<<<<<<< HEAD
          taker: dep.dustClaimV3,      // contract taker
          recipient: dep.dustClaimV3,  // output goes to contract
          txOrigin: from,              // USER EOA (required by v2 when taker is contract)
=======
          // allowance-holder rules:
          // taker/recipient are DustClaimV3, txOrigin is the user
          taker: dep.dustClaimV3,
          recipient: dep.dustClaimV3,
          txOrigin: from,
>>>>>>> a3da296ab (Refactor 0x-quote, claimExecutor, ClaimScreen)
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

      await sleep(isProbablyMobile() ? 30 : 0)
    }

<<<<<<< HEAD
=======
    // approvalsNeeded: dedupe by tokenIn and SUM amounts
>>>>>>> a3da296ab (Refactor 0x-quote, claimExecutor, ClaimScreen)
    const approvalMap = new Map()
    let swappableCount = 0

    for (const p of prepared) {
      const step = p.step
      const tokenIn = step?.tokenIn
      const amountWei = normalizeBigInt(step?.amount || 0)

      if (!p.ok) continue
      if (!isNonZeroAddress(p.routerSpender) || typeof p.swapCalldata !== 'string' || p.swapCalldata.length < 10) continue

      swappableCount += 1

      if (step?.needsApproval && !step?.usePermit && isNonZeroAddress(tokenIn) && amountWei > 0n) {
        const prev = approvalMap.get(tokenIn) || 0n
        approvalMap.set(tokenIn, prev + amountWei)
      }
    }

    const approvalsNeeded = Array.from(approvalMap.entries()).map(([tokenAddress, amountWei]) => ({
      tokenAddress,
      amountWei: amountWei.toString()
    }))

    safeCall(onProgress, { flowId, stage: 'quote', status: 'done', swappableCount, approvalsCount: approvalsNeeded.length })

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
// Internal: send an approval tx (handles USDT-style zero-first)
// ----------------------------------
async function sendApprovalTx({
  from,
  token,
  spender,
  amountWei,
  flowId,
  waitConfirms = 1,
  waitTimeoutMs = 240000,
  onProgress
}) {
  const tryApprove = async (amt) => {
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender, BigInt(amt)]
    })

    return walletService.sendTransactionWithReceipt(
      { from, to: token, data, value: 0n },
      {
        flowId,
        kind: 'approval',
        title: 'Approve token',
        step: 'approval',
        tokenAddress: token,
        spender,
        amount: String(amt),
        waitConfirms,
        waitTimeoutMs
      }
    )
  }

  try {
    safeCall(onProgress, { flowId, stage: 'approval', status: 'prompt', token, spender, amount: String(amountWei) })

    const r = await tryApprove(amountWei)
    if (r?.success) return r

    if (isMustZeroFirstApprove(r?.error || r)) {
      safeCall(onProgress, { flowId, stage: 'approval', status: 'zero_first', token, spender })
      const z = await tryApprove(0n)
      if (!z?.success) return z
      await sleep(isProbablyMobile() ? 800 : 250)
      return await tryApprove(amountWei)
    }

    return r
  } catch (err) {
    if (isMustZeroFirstApprove(err)) {
      safeCall(onProgress, { flowId, stage: 'approval', status: 'zero_first', token, spender })
      const z = await tryApprove(0n)
      if (!z?.success) return z
      await sleep(isProbablyMobile() ? 800 : 250)
      return await tryApprove(amountWei)
    }
    throw err
  }
}

// ----------------------------------
// STEP B: Execute approvals ONLY
// ----------------------------------
export async function executeApprovalsWithFlow(preparedCtx, opts = {}) {
  return runExclusive(async () => {
    const receipts = []
    const flowId = preparedCtx?.flowId || newFlowId()
    const planChainId = normalizeChainId(preparedCtx?.chainId)
    const from = preparedCtx?.from || (await walletService.getAddress?.())
    const dustClaimV3 = preparedCtx?.dustClaimV3
    const onProgress = opts?.onProgress || preparedCtx?.onProgress || null

    const approveMax = !!opts?.approveMax
    const waitConfirms = Number.isFinite(opts?.waitConfirms) ? Number(opts.waitConfirms) : 1
    const waitTimeoutMs = Number.isFinite(opts?.waitTimeoutMs) ? Number(opts.waitTimeoutMs) : 240000

    if (!from) throw new Error('No wallet address')
    if (!planChainId) throw new Error('Missing chainId in prepared context')
    if (!isNonZeroAddress(dustClaimV3)) throw new Error('Missing DustClaimV3 in prepared context')

    const currentChainHex = await walletService.getChainId?.()
    const currentChainId = normalizeChainId(currentChainHex)
    if (currentChainId !== planChainId) {
      safeCall(onProgress, { flowId, stage: 'chain', status: 'switching', from: currentChainId, to: planChainId })
      const sw = await walletService.switchChain(planChainId)
      if (!sw?.success) throw new Error(sw?.error || 'Chain switch failed')
      await sleep(isProbablyMobile() ? 450 : 150)
    }

    const provider = await walletService.getBrowserProvider?.()
    if (!provider) throw new Error('Provider unavailable')

    const rawApprovals = Array.isArray(preparedCtx?.approvalsNeeded) ? preparedCtx.approvalsNeeded : []
    const approvalMap = new Map()
    for (const a of rawApprovals) {
      const token = a?.tokenAddress
      const amt = normalizeBigInt(a?.amountWei)
      if (!isNonZeroAddress(token) || amt <= 0n) continue
      approvalMap.set(token, (approvalMap.get(token) || 0n) + amt)
    }

    const approvals = Array.from(approvalMap.entries()).map(([tokenAddress, amountWei]) => ({ tokenAddress, amountWei }))

    safeCall(onProgress, { flowId, stage: 'approval', status: 'starting', chainId: planChainId, total: approvals.length })

    for (let i = 0; i < approvals.length; i++) {
      const { tokenAddress: tokenIn, amountWei } = approvals[i]

      safeCall(onProgress, { flowId, stage: 'approval', status: 'checking', index: i, total: approvals.length, token: tokenIn, spender: dustClaimV3, amount: String(amountWei) })

      try {
<<<<<<< HEAD
        const okAllowance = await (async () => {
          try {
            const allowanceData = encodeFunctionData({
              abi: erc20Abi,
              functionName: 'allowance',
              args: [from, dustClaimV3]
            })
            const raw = await provider.call({ to: tokenIn, data: allowanceData })
            const [current] = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], raw)
            return BigInt(current.toString()) >= BigInt(amountWei)
          } catch {
            return false
          }
        })()

        if (okAllowance) {
          receipts.push({ flowId, type: 'approval', ok: true, skipped: true, reason: 'allowance already sufficient', chainId: planChainId, tokenIn, spender: dustClaimV3, amount: String(amountWei) })
=======
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
>>>>>>> a3da296ab (Refactor 0x-quote, claimExecutor, ClaimScreen)
          safeCall(onProgress, { flowId, stage: 'approval', status: 'skipped', index: i, total: approvals.length, token: tokenIn })
          continue
        }

        const approveAmount = approveMax ? MAX_UINT256 : amountWei

        const approvalRes = await sendApprovalTx({
          from,
          token: tokenIn,
          spender: dustClaimV3,
          amountWei: approveAmount,
          flowId,
          waitConfirms,
          waitTimeoutMs,
          onProgress
        })

        const ok = !!approvalRes?.success

        receipts.push({
          flowId,
          type: 'approval',
          ok,
          txHash: approvalRes?.txHash || null,
          status: approvalRes?.status || null,
          chainId: planChainId,
          tokenIn,
          spender: dustClaimV3,
          amount: String(approveAmount),
          blockNumber: approvalRes?.receipt?.blockNumber ?? null,
          error: approvalRes?.error || null,
          warning: approvalRes?.warning || null
        })

        safeCall(onProgress, { flowId, stage: 'approval', status: ok ? 'confirmed' : 'failed', index: i, total: approvals.length, token: tokenIn, txHash: approvalRes?.txHash || null, error: approvalRes?.error || null })

        if (!ok) {
          if (isUserRejected(approvalRes) || isUserRejected(approvalRes?.error)) break
          if (isPendingRequest(approvalRes) || isPendingRequest(approvalRes?.error)) break
          break
        }
      } catch (err) {
        receipts.push({ flowId, type: 'approval', ok: false, chainId: planChainId, tokenIn, spender: dustClaimV3, amount: String(amountWei), error: err?.shortMessage || err?.reason || err?.message || 'Approval failed' })
        safeCall(onProgress, { flowId, stage: 'approval', status: 'failed', index: i, total: approvals.length, token: tokenIn, error: err?.shortMessage || err?.reason || err?.message || 'Approval failed' })
        break
      }

      await sleep(isProbablyMobile() ? 900 : 200)
    }

    safeCall(onProgress, { flowId, stage: 'approval', status: 'done', receipts })
    return { flowId, receipts }
  })
}

// ----------------------------------
// STEP C: Execute swaps ONLY (DustClaimV3.claimDustUsingAggregator)
// ----------------------------------
export async function executeSwapsWithFlow(preparedCtx, opts = {}) {
  return runExclusive(async () => {
    const receipts = []
    const flowId = preparedCtx?.flowId || newFlowId()
    const planChainId = normalizeChainId(preparedCtx?.chainId)
    const from = preparedCtx?.from || (await walletService.getAddress?.())
    const dustClaimV3 = preparedCtx?.dustClaimV3
    const onProgress = opts?.onProgress || preparedCtx?.onProgress || null

    const waitConfirms = Number.isFinite(opts?.waitConfirms) ? Number(opts.waitConfirms) : 1
    const waitTimeoutMs = Number.isFinite(opts?.waitTimeoutMs) ? Number(opts.waitTimeoutMs) : 360000

    if (!from) throw new Error('No wallet address')
    if (!planChainId) throw new Error('Missing chainId in prepared context')
    if (!isNonZeroAddress(dustClaimV3)) throw new Error('Missing DustClaimV3 in prepared context')

    const currentChainHex = await walletService.getChainId?.()
    const currentChainId = normalizeChainId(currentChainHex)
    if (currentChainId !== planChainId) {
      safeCall(onProgress, { flowId, stage: 'chain', status: 'switching', from: currentChainId, to: planChainId })
      const sw = await walletService.switchChain(planChainId)
      if (!sw?.success) throw new Error(sw?.error || 'Chain switch failed')
      await sleep(isProbablyMobile() ? 450 : 150)
    }

    const prepared = Array.isArray(preparedCtx?.prepared) ? preparedCtx.prepared : []

    safeCall(onProgress, { flowId, stage: 'swap', status: 'starting', chainId: planChainId, total: prepared.length })

    for (let i = 0; i < prepared.length; i++) {
      const p = prepared[i]
      const step = p.step
      const tokenIn = step?.tokenIn
      const tokenOut = step?.tokenOut
      const amountWei = normalizeBigInt(step?.amount || 0)

      safeCall(onProgress, { flowId, stage: 'swap', status: 'progress', index: i, total: prepared.length, tokenIn, amount: String(amountWei) })

      if (!p.ok) {
        receipts.push({ flowId, type: 'swap', ok: true, skipped: true, reason: p.skipReason || 'skipped', chainId: planChainId, tokenIn, tokenOut })
        continue
      }

      const routerSpender = p.routerSpender
      const swapCalldata = p.swapCalldata
      const gasFromQuote = p.gasFromQuote

      if (!isNonZeroAddress(routerSpender) || typeof swapCalldata !== 'string' || swapCalldata.length < 10) {
        receipts.push({ flowId, type: 'swap', ok: true, skipped: true, reason: 'missing spender/calldata (no route)', chainId: planChainId, tokenIn, tokenOut })
        continue
      }

      await sleep(isProbablyMobile() ? 650 : 200)

      try {
        const claimData = encodeFunctionData({
          abi: DUSTCLAIM_V3_ABI,
          functionName: 'claimDustUsingAggregator',
          args: [tokenIn, amountWei, routerSpender, swapCalldata]
        })

        let gasLimit = gasFromQuote ? BigInt(gasFromQuote) + 160_000n : 1_050_000n

        try {
          const signer = await walletService.getSigner?.()
          if (signer) {
            const contract = new ethers.Contract(dustClaimV3, DUSTCLAIM_V3_ABI, signer)
            const est = await contract.claimDustUsingAggregator.estimateGas(tokenIn, amountWei, routerSpender, swapCalldata)
            const bumped = (BigInt(est) * 140n) / 100n
            if (bumped > gasLimit) gasLimit = bumped
          }
        } catch {}

        safeCall(onProgress, { flowId, stage: 'swap', status: 'prompt', index: i, total: prepared.length, tokenIn, dustClaimV3 })

        const swapRes = await walletService.sendTransactionWithReceipt(
          { from, to: dustClaimV3, data: claimData, value: 0n, gasLimit },
          {
            flowId,
            kind: 'swap',
            title: 'Claim Dust (DustClaimV3)',
            step: 'swap',
            tokenAddress: tokenIn,
            spender: routerSpender,
            amount: String(amountWei),
            waitConfirms,
            waitTimeoutMs
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

        safeCall(onProgress, { flowId, stage: 'swap', status: swapRes?.success ? 'confirmed' : 'failed', index: i, total: prepared.length, tokenIn, txHash: swapRes?.txHash || null, error: swapRes?.error || null })

        if (!swapRes?.success) break
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

        safeCall(onProgress, { flowId, stage: 'swap', status: 'failed', index: i, total: prepared.length, tokenIn, error: err?.shortMessage || err?.reason || err?.message || err?.response?.data?.message || 'Swap failed' })
        break
      }

      await sleep(isProbablyMobile() ? 700 : 250)
    }

    safeCall(onProgress, { flowId, stage: 'swap', status: 'done', receipts })
    return { flowId, receipts }
  })
}

// ----------------------------------
// DEVICE-AWARE WRAPPER
// ----------------------------------
export async function executeChainPlanWithFlow(chainPlan, fromAddress, opts = {}) {
  return runExclusive(async () => {
    const mode = String(opts?.mode || 'auto')
    const onProgress = opts?.onProgress || chainPlan?.onProgress || null

    const preparedCtx = opts?.preparedCtx || (await prepareChainPlanWithFlow(chainPlan, fromAddress, { onProgress }))

    if (mode === 'approveOnly') {
      const approvals = await executeApprovalsWithFlow(preparedCtx, {
        onProgress,
        approveMax: opts?.approveMax,
        waitConfirms: opts?.waitConfirms,
        waitTimeoutMs: opts?.waitTimeoutMs
      })
      return { flowId: preparedCtx.flowId, receipts: approvals?.receipts || [], preparedCtx, nextAction: 'swap' }
    }

    if (mode === 'swapOnly') {
      const swaps = await executeSwapsWithFlow(preparedCtx, { onProgress, waitConfirms: opts?.waitConfirms, waitTimeoutMs: opts?.waitTimeoutMs })
      return { flowId: preparedCtx.flowId, receipts: swaps?.receipts || [], preparedCtx, nextAction: null }
    }

    if (mode === 'all') {
      const approvals = await executeApprovalsWithFlow(preparedCtx, {
        onProgress,
        approveMax: opts?.approveMax,
        waitConfirms: opts?.waitConfirms,
        waitTimeoutMs: opts?.waitTimeoutMs
      })
      const approvalsOk = (approvals?.receipts || []).every((r) => r.ok !== false)
      if (!approvalsOk) return { flowId: preparedCtx.flowId, receipts: approvals?.receipts || [], preparedCtx, nextAction: 'swap' }

<<<<<<< HEAD
      const swaps = await executeSwapsWithFlow(preparedCtx, { onProgress, waitConfirms: opts?.waitConfirms, waitTimeoutMs: opts?.waitTimeoutMs })
=======
      const swaps = await executeSwapsWithFlow(preparedCtx, {
        onProgress,
        waitConfirms: opts?.waitConfirms,
        waitTimeoutMs: opts?.waitTimeoutMs
      })
>>>>>>> a3da296ab (Refactor 0x-quote, claimExecutor, ClaimScreen)
      return { flowId: preparedCtx.flowId, receipts: [...(approvals?.receipts || []), ...(swaps?.receipts || [])], preparedCtx, nextAction: null }
    }

    const approvals = await executeApprovalsWithFlow(preparedCtx, {
      onProgress,
      approveMax: opts?.approveMax,
      waitConfirms: opts?.waitConfirms,
      waitTimeoutMs: opts?.waitTimeoutMs
    })

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

    const approvalsOk = (approvals?.receipts || []).every((r) => r.ok !== false)
    if (!approvalsOk) return { flowId: preparedCtx.flowId, receipts: approvals?.receipts || [], preparedCtx, nextAction: 'swap' }

<<<<<<< HEAD
    const swaps = await executeSwapsWithFlow(preparedCtx, { onProgress, waitConfirms: opts?.waitConfirms, waitTimeoutMs: opts?.waitTimeoutMs })
=======
    const swaps = await executeSwapsWithFlow(preparedCtx, {
      onProgress,
      waitConfirms: opts?.waitConfirms,
      waitTimeoutMs: opts?.waitTimeoutMs
    })

>>>>>>> a3da296ab (Refactor 0x-quote, claimExecutor, ClaimScreen)
    return { flowId: preparedCtx.flowId, receipts: [...(approvals?.receipts || []), ...(swaps?.receipts || [])], preparedCtx, nextAction: null }
  })
}

export async function executeChainPlan(chainPlan, fromAddress) {
  const { receipts } = await executeChainPlanWithFlow(chainPlan, fromAddress)
  return receipts
}
