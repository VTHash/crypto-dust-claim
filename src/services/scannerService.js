import { createPublicClient, http, parseAbi, erc20Abi, formatUnits, getContract, multicall } from 'viem'
import { mainnet, polygon, arbitrum, base, optimism } from '@reown/appkit/networks'
import priceService from './priceService'

const CHAINS = [mainnet, polygon, arbitrum, base, optimism]

/**
 * tokensByChain: { [chainId]: [{ address, symbol, decimals }] }
 * address: user EOA
 * returns per-chain dust items with USD valuation
 */
export async function scanDust({ address, tokensByChain, thresholdsUSD = { default: 0.5 } }) {
  const results = []

  for (const chain of CHAINS) {
    const publicClient = createPublicClient({ chain, transport: http() })
    const tokens = tokensByChain[chain.id] || []
    if (!tokens.length) continue

    // Build multicall of balanceOf
    const calls = tokens.map(t => ({
      address: t.address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    }))

    const balances = await multicall(publicClient, { contracts: calls })
    const items = []

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      const res = balances[i]
      if (res.status !== 'success') continue
      const raw = res.result
      if (!raw) continue

      const value = Number(formatUnits(raw, token.decimals))
      if (value <= 0) continue

      items.push({ ...token, chainId: chain.id, value })
    }

    // Price them in batch
    const priced = await priceService.priceTokensUSD(chain.id, items)
    const dust = []
    const threshold = thresholdsUSD[chain.id] ?? thresholdsUSD.default

    for (const p of priced) {
      const usd = p.usd ?? 0
      if (usd > 0 && usd <= threshold) {
        dust.push({ ...p, usd })
      }
    }

    if (dust.length) {
      results.push({
        chainId: chain.id,
        chainName: chain.name,
        items: dust,
        totalUSD: dust.reduce((s, d) => s + d.usd, 0),
      })
    }
  }

  return results
}