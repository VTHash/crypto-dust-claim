const cache = new Map()

// Trusted logo sources
const SOURCES = [
  (addr) => `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${addr}/logo.png`,
  (addr) => `https://tokens.1inch.io/${addr}.png`,
  (addr) => `https://assets.coingecko.com/coins/images/${addr}/large.png`
]

/**
 * Try to find a real logo for a token contract.
 * @param {string} address Token contract address (0x...)
 * @param {string} chainId Chain ID for context
 * @returns URL string (or null if none found)
 */
export const NATIVE_LOGOS = {
  1: '/logos/eth.png',
  10: '/logos/op.png',
  56: '/logos/bnb.png',
  100: '/logos/gnosis.png',
  137: '/logos/matic.png',
  42161: '/logos/arb.png',
  8453: '/logos/base.png',
  250: '/logos/ftm.png',
  34443: '/logos/mode.png',
  59144: '/logos/linea.png',
  7777777: '/logos/zora.png',
  80094: '/logos/bera.png',
  195: '/logos/x1.png',
  1329: '/logos/sei.png',
  43114: '/logos/avax.png'
}

export async function getTokenLogo(address, chainId) {
  const addr = address?.toLowerCase()
  if (!addr || !addr.startsWith('0x')) return null

  if (cache.has(addr)) return cache.get(addr)

  for (const buildUrl of SOURCES) {
    const url = buildUrl(addr)
    try {
      const res = await fetch(url, { method: 'HEAD' })
      if (res.ok) {
        cache.set(addr, url)
        return url
      }
    } catch {
      // continue
    }
  }

  cache.set(addr, null)
  return null
}