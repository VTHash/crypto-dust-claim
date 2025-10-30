// ✅ Base URLs for official logo sources
const TRUSTWALLET_ASSETS = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains'
const GENERIC_ICON = '/logos/tokens/generic-token.png' // optional local fallback

// ✅ Native token logos (used when address is null)
export const NATIVE_LOGOS = {
  1: 'https://cryptologos.cc/logos/ethereum-eth-logo.png', // Ethereum
  10: 'https://cryptologos.cc/logos/optimism-ethereum-op-logo.png', // Optimism
  56: 'https://cryptologos.cc/logos/bnb-bnb-logo.png', // BNB Smart Chain
  137: 'https://cryptologos.cc/logos/polygon-matic-logo.png', // Polygon
  42161: 'https://cryptologos.cc/logos/arbitrum-arb-logo.png', // Arbitrum
  43114: 'https://cryptologos.cc/logos/avalanche-avax-logo.png', // Avalanche
  8453: 'https://cryptologos.cc/logos/base-base-logo.png', // Base
  324: 'https://cryptologos.cc/logos/zksync-zk-logo.png', // zkSync
  5000: 'https://cryptologos.cc/logos/mantle-mnt-logo.png', // Mantle
  59144: 'https://cryptologos.cc/logos/linea-linea-logo.png', // Linea
  81457: 'https://cryptologos.cc/logos/blast-blast-logo.png', // Blast
  204: 'https://cryptologos.cc/logos/opbnb-bnb-logo.png', // opBNB
  250: 'https://cryptologos.cc/logos/fantom-ftm-logo.png', // Fantom
  32456: 'https://cryptologos.cc/logos/scroll-scroll-logo.png', // Scroll
  80085: 'https://cryptologos.cc/logos/berachain-bera-logo.png', // Berachain (example)
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