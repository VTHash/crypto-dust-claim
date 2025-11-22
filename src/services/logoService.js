// ✅ Base URLs for official logo sources
const TRUSTWALLET_ASSETS = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains'
const GENERIC_ICON = '/logos/tokens/generic-token.png' // optional local fallback

// ✅ Native token logos (used when address is null)
export const NATIVE_LOGOS = {
  1: '/logo/ethereum.png', // Ethereum
  10: '/logo/optimism.png', // Optimism
  56: '/logo/bnb.png', // BNB Smart Chain
  137: '/logo/polygon.png', // Polygon
  42161: '/logo/arbitrum.png', // Arbitrum
  43114: '/logo/avalanche.png', // Avalanche
  8453: '/logo/base.png', // Base
  324: '/logo/zksync.png', // zkSync
  5000: '/logo/mantle.png', // Mantle
  59144: '/logo/linea.png', // Linea
  81457: '/logo/blast.png', // Blast
  250: '/logo/fantom.png', // Fantom
  32456: '/logo/scroll.png', // Scroll
  80085: '/logo/bera.png', // Berachain (example)
}

// ✅ Chain name mapping for TrustWallet repo folder paths
const CHAIN_PATHS = {
  1: 'ethereum',
  56: 'smartchain',
  137: 'polygon',
  43114: 'avalanchec',
  42161: 'arbitrum',
  250: 'fantom',
  10: 'optimism',
  8453: 'base',
  324: 'zksync',
  59144: 'linea',
  5000: 'mantle',
  204: 'opbnb',
  81457: 'blast',
  32456: 'scroll',
  80085: 'berachain'
}

/**
 * ✅ Build a URL for a token logo.
 * Supports ERC-20 tokens and native coins.
 * Example:
 * getTokenLogo('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'USDC')
 */
export function getTokenLogo(address, symbol, chainId = 1) {
  if (!address || address === 'native') {
    return NATIVE_LOGOS[chainId] || GENERIC_ICON
  }

  try {
    const lowerAddr = address.toLowerCase()
    const path = CHAIN_PATHS[chainId] || 'ethereum'
    return `${TRUSTWALLET_ASSETS}/${path}/assets/${lowerAddr}/logo.png`
  } catch {
    return GENERIC_ICON
  }
}

/**
 * ✅ Try fetching and caching logos dynamically (optional enhancement).
 * You can extend this to check CoinGecko API for non-TrustWallet tokens.
 */
export async function preloadLogo(address, chainId = 1) {
  const url = getTokenLogo(address, null, chainId)
  try {
    const res = await fetch(url, { method: 'HEAD' })
    if (!res.ok) throw new Error('Missing logo')
    return url
  } catch {
    return GENERIC_ICON
  }
}