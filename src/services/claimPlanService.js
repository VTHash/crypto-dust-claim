import { checkAllowance, supportsPermit2612 } from './allowanceService'
import { bestQuote } from './quoteService'
import { parseUnits } from 'viem'

/**
 * items: [{ chainId, address: tokenAddress, symbol, decimals, value (float), usd }]
 * wallet: user address
 * toToken: where to consolidate (e.g., WETH or USDC address per chain)
 */
export async function buildClaimPlan({ itemsByChain, wallet, toTokenByChain, routerSpenders }) {
  // routerSpenders: { oneInch: { [chainId]: spenderAddr }, paraswap: { [chainId]: spenderAddr } }
  const plan = []

  for (const chainId of Object.keys(itemsByChain)) {
    const items = itemsByChain[chainId]
    if (!items?.length) continue

    const chainPlan = { chainId: Number(chainId), steps: [], approvalsNeeded: 0, swaps: 0 }

    for (const item of items) {
      // convert float value -> raw amount
      const rawAmount = parseUnits(item.value.toString(), item.decimals)

      // probe 1inch vs paraswap quotes (could add routing preference)
      const q = await bestQuote({
        chainId: Number(chainId),
        fromToken: item.address,
        toToken: toTokenByChain[chainId],
        amount: rawAmount.toString(),
      })

      const spender = routerSpenders[q.aggregator]?.[chainId]
      if (!spender) continue

      // decide permit vs approval
      const hasPermit = await supportsPermit2612({ chainId: Number(chainId), token: { address: item.address } })
      let needsApproval = false

      if (!hasPermit) {
        const allowance = await checkAllowance({ chainId: Number(chainId), token: { address: item.address }, owner: wallet, spender })
        needsApproval = allowance < rawAmount
      }

      chainPlan.steps.push({
        type: 'swap',
        aggregator: q.aggregator,
        tokenIn: item.address,
        tokenOut: toTokenByChain[chainId],
        amount: rawAmount.toString(),
        needsApproval,
        usePermit: hasPermit,
        quote: q,
        spender,
      })

      chainPlan.approvalsNeeded += needsApproval ? 1 : 0
      chainPlan.swaps += 1
    }

    plan.push(chainPlan)
  }

  return plan
}