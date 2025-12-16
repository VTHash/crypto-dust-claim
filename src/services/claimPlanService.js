import { checkAllowance, supportsPermit2612 } from './allowanceService'
import { bestQuote } from './quoteService'
import { parseUnits } from 'viem'

/**
 * items: [{ chainId, address, symbol, decimals, value (float), usd }]
 * wallet: user address
 * toTokenByChain: { [chainId]: tokenAddress } (e.g. WETH)
 */
export async function buildClaimPlan({ itemsByChain, wallet, toTokenByChain }) {
  const plan = []

  for (const chainId of Object.keys(itemsByChain)) {
    const items = itemsByChain[chainId]
    if (!items?.length) continue

    const chainPlan = { chainId: Number(chainId), steps: [], approvalsNeeded: 0, swaps: 0 }

    for (const item of items) {
      const rawAmount = parseUnits(item.value.toString(), item.decimals)

      // 0x quote
      const q = await bestQuote({
        chainId: Number(chainId),
        fromToken: item.address,
        toToken: toTokenByChain[chainId],
        amount: rawAmount.toString(),
        taker: wallet,
      })

      // 0x spender (AllowanceHolder / Permit2) comes from quote issues.allowance.spender

      const hasPermit = await supportsPermit2612({ chainId: Number(chainId), token: { address: item.address } })

      let needsApproval = false
      if (!hasPermit) {
        const allowance = await checkAllowance({
          chainId: Number(chainId),
          token: { address: item.address },
          owner: wallet,
        })
        needsApproval = allowance < rawAmount
      }

      chainPlan.steps.push({
        type: 'swap',
        aggregator: '0x',
        tokenIn: item.address,
        tokenOut: toTokenByChain[chainId],
        amount: rawAmount.toString(),
        needsApproval,
        usePermit: hasPermit,
        quote: q,
        slippageBps: 100, // 1% default
      })

      chainPlan.approvalsNeeded += needsApproval ? 1 : 0
      chainPlan.swaps += 1
    }

    plan.push(chainPlan)
  }

  return plan
}
