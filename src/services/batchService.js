// src/services/batchService.jsx
import { ethers } from 'ethers'
import web3Service from './web3Service'
import dexAggregatorService from './dexAggregatorService' // kept to avoid breaking imports
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

  const { data } = await axios.post('/.netlify/functions/0x-quote', payload, {
    headers: { 'content-type': 'application/json' }
  })

  return data
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
        const decimals = Number(it.decimals ?? 18)
        const sellAmountWei = toWeiStr(it.amount, decimals)

        // Skip nonsense amounts
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
            taker: dep.dustClaimV3,      // contract is taker
            recipient: dep.dustClaimV3,  // contract must receive WETH
            txOrigin,                   // user EOA
            slippageBps: Math.round(slippagePct * 100) // 1% => 100
          })
        } catch (e) {
          console.warn(
            '[buildClaimPlan] 0x quote failed:',
            { chainId, tokenIn },
            e?.response?.data || e?.message
          )
          continue
        }

        const callTarget = q?.transaction?.to
        const swapCalldata = q?.transaction?.data

        // spender location (v2 allowance-holder)
        const spender =
          q?.issues?.allowance?.spender ||
          q?.allowanceTarget ||
          q?.allowance?.spender ||
          null

        if (!callTarget || !swapCalldata || !spender) {
          console.warn('[buildClaimPlan] missing required quote fields', {
            chainId,
            hasTx: !!q?.transaction,
            callTarget,
            hasData: !!swapCalldata,
            spender
          })
          continue
        }

        // CRITICAL for your V3:
        // spender.call(swapCalldata) must be valid -> spender must equal tx.to
        if (String(callTarget).toLowerCase() !== String(spender).toLowerCase()) {
          console.warn('[buildClaimPlan] callTarget != spender (V3 incompatible), skipping', {
            chainId,
            callTarget,
            spender
          })
          continue
        }

        steps.push({
          aggregator: '0x',

          // user approves DustClaimV3 (contract pulls tokens)
          needsApproval: true,
          usePermit: false,
          spender: dep.dustClaimV3,

          tokenIn,
          tokenOut: dep.weth,
          amount: sellAmountWei,

          // used by claimExecutor to call DustClaimV3
          routerSpender: spender,
          swapCalldata,

          slippage: slippagePct
        })
      }

      if (steps.length) plan.push({ chainId, steps })
    }

    return plan
  }
}

export default new BatchService()
