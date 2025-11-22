// ✅ Base URLs for official logo sources
const TRUSTWALLET_ASSETS =
  'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains'
const GENERIC_ICON = '/logos/tokens/generic-token.png' // optional local fallback

// ✅ Native token logos (used when address is null or "native")
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
  80085: '/logo/bera.png' // Berachain (example)
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

// ✅ Chain → CoinGecko platform ids
// (only for chains you actually use; fallback to ethereum otherwise)
const COINGECKO_PLATFORMS = {
  1: 'ethereum',
  10: 'optimistic-ethereum',
  56: 'binance-smart-chain',
  137: 'polygon-pos',
  250: 'fantom',
  42161: 'arbitrum-one',
  43114: 'avalanche',
  8453: 'base',
  324: 'zksync',
  5000: 'mantle',
  59144: 'linea',
  81457: 'blast',
  32456: 'scroll'
}

// Simple in-memory cache so we don’t refetch the same logo
const TOKEN_LOGO_CACHE = new Map()

/**
 * Build a TrustWallet logo URL (no network call).
 * This is the "best guess" we can use synchronously.
 */
function getTrustWalletLogoUrl(address, chainId = 1) {
  const lowerAddr = address.toLowerCase()
  const path = CHAIN_PATHS[chainId] || 'ethereum'
  return `${TRUSTWALLET_ASSETS}/${path}/assets/${lowerAddr}/logo.png`
}

/**
 * ✅ Synchronous helper used by existing UI.
 * Returns:
 * - native logo (if address is null/"native")
 * - a TrustWallet URL guess
 * - or the generic icon
 *
 * NOTE: This does **not** check if the URL actually exists.
 * The async resolver below will refine it.
 */
export function getTokenLogo(address, symbol, chainId = 1) {
  if (!address || address === 'native') {
    return NATIVE_LOGOS[chainId] || GENERIC_ICON
  }

  try {
    return getTrustWalletLogoUrl(address, chainId)
  } catch {
    return GENERIC_ICON
  }
}

/**
 * Small helper to check if a URL exists (HEAD request).
 */
async function urlExists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    return res.ok
  } catch {
    return false
  }
}

/**
 * ✅ Async logo resolver with full fallback:
 *
 * 1) Native → NATIVE_LOGOS
 * 2) Cache (if previously resolved)
 * 3) TrustWallet raw GitHub logo (per chain)
 * 4) CoinGecko token info (per chain platform)
 * 5) GENERIC_ICON as final fallback
 */
export async function resolveTokenLogo(address, symbol, chainId = 1) {
  // Native coin → shortcut
  if (!address || address === 'native') {
    return NATIVE_LOGOS[chainId] || GENERIC_ICON
  }

  const lowerAddr = address.toLowerCase()
  const cacheKey = `${chainId}:${lowerAddr}`

  if (TOKEN_LOGO_CACHE.has(cacheKey)) {
    return TOKEN_LOGO_CACHE.get(cacheKey)
  }

  // 1) Try TrustWallet
  const twUrl = getTrustWalletLogoUrl(lowerAddr, chainId)
  if (await urlExists(twUrl)) {
    TOKEN_LOGO_CACHE.set(cacheKey, twUrl)
    return twUrl
  }

  // 2) Try CoinGecko (if we have a known platform)
  try {
    const platform = COINGECKO_PLATFORMS[chainId] || 'ethereum'
    const cgUrl = `https://api.coingecko.com/api/v3/coins/${platform}/contract/${lowerAddr}`

    const res = await fetch(cgUrl)
    if (res.ok) {
      const json = await res.json()
      const img =
        json?.image?.small || json?.image?.thumb || json?.image?.large || null

      if (img) {
        TOKEN_LOGO_CACHE.set(cacheKey, img)
        return img
      }
    }
  } catch {
    // ignore, fall through to generic
  }

  // 3) Final fallback
  TOKEN_LOGO_CACHE.set(cacheKey, GENERIC_ICON)
  return GENERIC_ICON
}

/**
 * Older helper kept for compatibility (if you want it somewhere else).
 * It simply calls the async resolver.
 */
export async function preloadLogo(address, chainId = 1) {
  return resolveTokenLogo(address, null, chainId)
}