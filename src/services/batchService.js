// src/services/batchService.jsx
import { ethers } from 'ethers'
import axios from 'axios'
import walletService from './walletService'
import { DEPLOYMENTS } from '../config/deployments'

// Normalize any input into a wei string
const toWeiStr = (amount, decimals = 18) => {
  const s = String(amount ?? '0')
  return s.includes('.') ? ethers.parseUnits(s, decimals).toString() : s
}

const isHexAddress = (a) => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a)
const isNonZeroAddress = (a) => isHexAddress(a) && a.toLowerCase() !== ethers.ZeroAddress

/**
 * 0x Swap API v2 (Allowance Holder) via Netlify function (POST)
 * Netlify returns a normalized v2 shape:
 * {
 * spender,
 * transaction: { to, data, gas, value },
 * raw: {...}
 * }
 */
async function get0xAllowanceHolderQuote({
  chainId,
  sellToken,
  buyToken,
  sellAmountWei,
  taker,
  txOrigin,
  recipient,
  slippageBps
}) {
  const payload = {
    chainId: Number(chainId),
    sellToken,
    buyToken,
    sellAmount: String(sellAmountWei),
    taker,
    txOrigin,
    recipient,
    slippageBps: Number(slippageBps)
  }

  console.log('[batchService] /.netlify/functions/0x-quote payload:', payload)

  const res = await axios.post('/.netlify/functions/0x-quote', payload, {
    headers: { 'content-type': 'application/json' }
  })

  const q = res?.data
  console.log('[batchService] 0x-quote spender:', q?.spender || null)
  console.log('[batchService] 0x-quote tx.to:', q?.transaction?.to || null)
  console.log('[batchService] 0x-quote tx.data len:', q?.transaction?.data?.length || 0)

  return q
}

async function getTxOriginFallback(optionsTxOrigin) {
  if (optionsTxOrigin) return optionsTxOrigin

  const from =
    (await walletService.getAddress?.()) ||
    (await (async () => {
      const accs = await walletService.getAccounts?.()
      return accs?.[0] || null
    })())

  return from || null
}

// Convert slippage settings to BPS (basis points)
// - prefer options.slippageBps if present
// - else accept options.slippagePct (1 = 1% => 100 bps)
function resolveSlippageBps(options = {}) {
  const bpsRaw = options?.slippageBps
  if (bpsRaw !== undefined && bpsRaw !== null && Number.isFinite(Number(bpsRaw))) {
    const bps = Math.max(0, Math.floor(Number(bpsRaw)))
    return bps
  }

  const pctRaw = options?.slippagePct
  const pct = Number.isFinite(Number(pctRaw)) ? Number(pctRaw) : 1
  return Math.max(0, Math.floor(pct * 100))
}

// Execution eligibility for 0x + DustClaimV3 swap flow
function canSwapVia0x(chainId) {
  const dep = DEPLOYMENTS?.[Number(chainId)]
  return !!(
    dep?.directSwap0x &&
    dep?.dustClaimV3 &&
    isNonZeroAddress(dep.dustClaimV3) &&
    dep?.weth &&
    isNonZeroAddress(dep.weth)
  )
}

class BatchService {
  /**
   * claims = [{ chainId, tokenAddress, amount, decimals, recipient }]
   * options = { txOrigin, slippageBps, slippagePct, outTokenByChain }
   */
  async buildClaimPlan(claims = [], options = {}) {
    if (!Array.isArray(claims) || claims.length === 0) return []

    const slippageBps = resolveSlippageBps(options)
    const txOrigin = await getTxOriginFallback(options.txOrigin)

    if (!txOrigin) {
      throw new Error('txOrigin (user EOA) is required to build 0x v2 quotes')
    }

    // group by chain
    const byChain = new Map()
    for (const c of claims) {
      const cid = Number(c.chainId)
      if (!Number.isFinite(cid) || cid <= 0) continue
      if (!byChain.has(cid)) byChain.set(cid, [])
      byChain.get(cid).push(c)
    }

    const plan = []

    for (const [chainId, items] of byChain.entries()) {
      // CRITICAL: Only build steps for chains that can actually execute the 0x swap path
      if (!canSwapVia0x(chainId)) {
        console.warn('[batchService] skipping chain (not 0x-executable):', chainId, DEPLOYMENTS?.[Number(chainId)] || null)
        continue
      }

      const dep = DEPLOYMENTS?.[Number(chainId)]
      const steps = []

      for (const it of items) {
        const tokenIn = it.tokenAddress
        if (!isNonZeroAddress(tokenIn)) continue

        // Skip WETH -> WETH
        if (String(tokenIn).toLowerCase() === String(dep.weth).toLowerCase()) continue

        const decimals = Number(it.decimals ?? 18)
        const sellAmountWei = toWeiStr(it.amount, decimals)

        try {
          if (BigInt(sellAmountWei) <= 0n) continue
        } catch {
          continue
        }

        let q
        try {
          q = await get0xAllowanceHolderQuote({
            chainId,
            sellToken: tokenIn,
            buyToken: dep.weth, // IMPORTANT: DustClaimV3 expects wrapped-native output (WETH/WBNB/etc.)
            sellAmountWei,
            taker: dep.dustClaimV3, // DustClaimV3 is taker (smart contract caller)
            recipient: dep.dustClaimV3, // DustClaimV3 receives WETH
            txOrigin, // user EOA origin
            slippageBps
          })
        } catch (e) {
          console.warn(
            '[buildClaimPlan] 0x quote failed:',
            { chainId, tokenIn },
            e?.response?.data || e?.message
          )
          continue
        }

        // Netlify normalized response
        const routerSpender = q?.spender || null
        const callTarget = q?.transaction?.to || null
        const calldata = q?.transaction?.data || null
        const gasFromQuote = q?.transaction?.gas ?? null

        if (
          !isNonZeroAddress(routerSpender) ||
          !isNonZeroAddress(callTarget) ||
          typeof calldata !== 'string' ||
          calldata.length < 10
        ) {
          console.warn('[0x] invalid quote, missing executable fields', {
            chainId,
            tokenIn,
            routerSpender,
            callTarget,
            calldataLen: calldata?.length || 0
          })
          continue
        }

        // DustClaimV3: approve(routerSpender), then routerSpender.call(calldata)
        // So routerSpender MUST match tx.to
        if (String(callTarget).toLowerCase() !== String(routerSpender).toLowerCase()) {
          console.warn('[0x] incompatible allowance-holder quote (spender != tx.to)', {
            chainId,
            tokenIn,
            callTarget,
            routerSpender
          })
          continue
        }

        steps.push({
          aggregator: '0x',

          // claimExecutor derives approvalsNeeded from these flags
          needsApproval: true,
          usePermit: false,

          tokenIn,
          tokenOut: dep.weth,
          amount: String(sellAmountWei),

          // DustClaimV3 will approve+call this internally
          routerSpender,
          swapCalldata: calldata,
          gasFromQuote,

          // claimExecutor reads step.slippageBps when it needs to re-quote
          slippageBps
        })
      }

      if (steps.length) plan.push({ chainId, steps })
    }

    return plan
  }
}

export default new BatchService()