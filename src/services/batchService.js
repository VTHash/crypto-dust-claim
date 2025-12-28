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

/**
 * 0x Swap API v2 via Netlify function (POST)
 * This is the ONLY place we request quotes to build the plan.
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

  console.log('[batchService] 0x-quote tx.to:', res?.data?.transaction?.to)
  console.log('[batchService] 0x-quote tx.data len:', res?.data?.transaction?.data?.length || 0)
  console.log(
    '[batchService] 0x-quote allowance spender:',
    res?.data?.issues?.allowance?.spender || res?.data?.allowanceTarget || null
  )

  return res.data
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

class BatchService {
  /**
   * claims = [{ chainId, tokenAddress, amount, decimals, recipient }]
   * options = { txOrigin, slippagePct }
   */
  async buildClaimPlan(claims = [], options = {}) {
    if (!Array.isArray(claims) || claims.length === 0) return []

    const slippagePct = Number(options.slippagePct ?? 1)
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
      const dep = DEPLOYMENTS?.[Number(chainId)]
      if (!dep?.dustClaimV3 || !dep?.weth) continue

      const steps = []

      for (const it of items) {
        const tokenIn = it.tokenAddress
        if (!tokenIn) continue

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
            buyToken: dep.weth,
            sellAmountWei,
            taker: dep.dustClaimV3, // contract is taker
            recipient: dep.dustClaimV3, // contract must receive WETH
            txOrigin, // user EOA
            slippageBps: Math.round(slippagePct * 100)
          })
        } catch (e) {
          console.warn(
            '[buildClaimPlan] 0x quote failed:',
            { chainId, tokenIn },
            e?.response?.data || e?.message
          )
          continue
        }

        const callTarget = q?.transaction?.to || null
        const calldata = q?.transaction?.data || null
        const allowanceSpender =
          q?.issues?.allowance?.spender || q?.allowanceTarget || null

        if (!callTarget || !calldata || !allowanceSpender) {
          console.warn('[0x] invalid quote, missing fields', {
            chainId,
            tokenIn,
            callTarget,
            allowanceSpender,
            calldataLen: calldata?.length || 0
          })
          continue
        }

        // DustClaimV3 calls: spender.call(calldata)
        // So spender MUST be callable. With allowance-holder quotes, spender is typically tx.to.
        // Your strict requirement is reasonable; keep it to avoid incompatible quotes.
        if (String(callTarget).toLowerCase() !== String(allowanceSpender).toLowerCase()) {
          console.warn('[0x] incompatible allowance-holder quote (tx.to != allowance spender)', {
            chainId,
            tokenIn,
            callTarget,
            allowanceSpender
          })
          continue
        }

        steps.push({
          aggregator: '0x',

          needsApproval: true,
          usePermit: false,

          // ✅ FIX: user must approve DustClaimV3 (it pulls tokens via transferFrom)
          spender: dep.dustClaimV3,

          tokenIn,
          tokenOut: dep.weth,
          amount: sellAmountWei,

          // ✅ DustClaimV3 will approve+call this spender internally
          routerSpender: allowanceSpender,
          swapCalldata: calldata,

          // optional debug
          callTarget,

          slippage: slippagePct
        })
      }

      if (steps.length) plan.push({ chainId, steps })
    }

    return plan
  }
}

export default new BatchService()