import axios from 'axios'
import { parseUnits } from 'viem'
import { DEPLOYMENTS } from '../config/deployments'
import { bestQuote } from './quoteService'
/**
 * itemsByChain: {
 *   [chainId]: [{ address, symbol, decimals, value (float/string), usd, ... }]
 * }
 * wallet: user EOA address
 * toTokenByChain: optional override (ignored for V3; we use DEPLOYMENTS[chainId].weth)
 *
 * Returns:
 * [
 *   {
 *     chainId,
 *     steps: [
 *       {
 *         aggregator: '0x',
 *         needsApproval: true,
 *         usePermit: false,
 *         spender: <DustClaimV3>,
 *         tokenIn,
 *         tokenOut: <WETH>,
 *         amount: <wei string>,
 *         routerSpender: <0x tx.to>,
 *         swapCalldata: <0x tx.data>,
 *         slippage: 1
 *       }
 *     ]
 *   }
 * ]
 */
export async function buildClaimPlan({ itemsByChain, wallet, toTokenByChain }) {
  const plan = []
  const txOrigin = wallet

  if (!txOrigin) throw new Error('Missing wallet (txOrigin)')

  for (const chainIdKey of Object.keys(itemsByChain || {})) {
    const chainId = Number(chainIdKey)
    const items = itemsByChain?.[chainIdKey]
    if (!Number.isFinite(chainId) || chainId <= 0) continue
    if (!items?.length) continue

    const dep = DEPLOYMENTS?.[chainId]
    if (!dep?.dustClaimV3 || !dep?.weth) {
      console.warn('[buildClaimPlan] Missing deployment config for chain', chainId, dep)
      continue
    }

    const chainPlan = { chainId, steps: [] }

    for (const item of items) {
      try {
        const tokenIn = item.address
        const decimals = Number(item.decimals ?? 18)

        // Skip WETH -> WETH nonsense
        if (String(tokenIn).toLowerCase() === String(dep.weth).toLowerCase()) continue

        // Convert "value" to wei string
        const rawAmount = parseUnits(String(item.value ?? '0'), decimals)
        if (rawAmount <= 0n) continue

        const sellAmount = rawAmount.toString()

        // DustClaimV3 must be the taker+recipient, wallet is txOrigin
        const payload = {
          chainId,
          sellToken: tokenIn,
          buyToken: dep.weth,
          sellAmount, // wei string
          taker: dep.dustClaimV3,
          recipient: dep.dustClaimV3,
          txOrigin,
          slippageBps: 100 // 1%
        }

        console.log('[buildClaimPlan] requesting 0x v2 quote:', {
          chainId,
          tokenIn,
          sellAmount,
          dustClaimV3: dep.dustClaimV3,
          weth: dep.weth,
          txOrigin
        })

        const { data: q } = await axios.post('/.netlify/functions/0x-quote', payload, {
          headers: { 'content-type': 'application/json' }
        })

        const callTarget = q?.transaction?.to
        const swapCalldata = q?.transaction?.data

        // v2 spender usually appears here:
        const allowanceSpender =
          q?.issues?.allowance?.spender ||
          q?.allowanceTarget ||
          q?.allowance?.spender ||
          null

        if (!callTarget || !swapCalldata || !allowanceSpender) {
          console.warn('[buildClaimPlan] quote missing fields, skipping:', {
            chainId,
            tokenIn,
            hasTx: !!q?.transaction,
            callTarget,
            hasData: !!swapCalldata,
            allowanceSpender
          })
          continue
        }

        // CRITICAL DustClaimV3 requirement:
        // your contract calls spender.call(calldata), so spender MUST equal tx.to
        if (String(callTarget).toLowerCase() !== String(allowanceSpender).toLowerCase()) {
          console.warn('[buildClaimPlan] V3 incompatible quote (tx.to != allowance spender), skipping:', {
            chainId,
            tokenIn,
            callTarget,
            allowanceSpender
          })
          continue
        }

        chainPlan.steps.push({
          aggregator: '0x',

          // USER approves DustClaimV3 (NOT 0x spender)
          needsApproval: true,
          usePermit: false,
          spender: dep.dustClaimV3,

          tokenIn,
          tokenOut: dep.weth,
          amount: sellAmount,

          // DustClaimV3 will approve+call this
          routerSpender: allowanceSpender,
          swapCalldata,

          // keep same style as your other files
          slippage: 1
        })
      } catch (e) {
        console.warn(
          '[buildClaimPlan] step failed:',
          { chainId, token: item?.address },
          e?.response?.data || e?.message
        )
        continue
      }
    }

    if (chainPlan.steps.length) plan.push(chainPlan)
  }

  return plan
}
