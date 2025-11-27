import axios from 'axios'

/**
 * CoinGecko client (FREE / DEMO tier)
 * - Base URL: https://api.coingecko.com/api/v3
 * - Auth header: x-cg-demo-api-key: <your-key>
 * - Simple in-memory cache
 */

const COINGECKO_API_KEY = import.meta.env.VITE_COINGECKO_API_KEY || ''

// Use the PUBLIC (non-pro) base URL for demo / free tier
const cg = axios.create({
  baseURL: 'https://api.coingecko.com/api/v3',
  timeout: 15000,
  headers: {
    'User-Agent': 'CryptoDustClaim/1.0'
  }
})

// Simple in-memory cache to reduce API calls
const priceCache = new Map()
const CACHE_DURATION = 60_000 // 1 minute cache

// Attach API key header if provided
cg.interceptors.request.use((config) => {
  if (COINGECKO_API_KEY) {
    // IMPORTANT: demo / free tier uses *this* header
    config.headers['x-cg-demo-api-key'] = COINGECKO_API_KEY
  }
  return config
})

// Cache responses by URL
cg.interceptors.response.use((response) => {
  if (response.config?.url) {
    const cacheKey = response.config.url + JSON.stringify(response.config.params || {})
    priceCache.set(cacheKey, {
      data: response.data,
      timestamp: Date.now()
    })
  }
  return response
})

// helper to read cache
function getFromCache(key) {
  const entry = priceCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_DURATION) {
    priceCache.delete(key)
    return null
  }
  return entry.data
}

// ----------------- chain → platform / coin mappings -----------------

/**
 * EVM chainId → CoinGecko "platform" for ERC-20 token prices
 * Only chains listed here will get ERC-20 USD values.
 * (These are platform slugs used by /simple/token_price/{platform})
 */
const PLATFORM_BY_CHAIN = {
  1: 'ethereum', // Ethereum Mainnet
  10: 'optimistic-ethereum', // Optimism
  56: 'binance-smart-chain', // BNB Smart Chain
  100: 'xdai', // Gnosis (xDAI)
  137: 'polygon-pos', // ✅ Polygon PoS (correct platform)
  250: 'fantom', // Fantom Opera
  8453: 'base', // Base
  59144: 'linea', // Linea
  34443: 'mode', // Mode (assuming this slug; if CG differs, prices will be 0)
  42161: 'arbitrum-one', // Arbitrum One
  43114: 'avalanche', // Avalanche C
  1329: 'sei-network', // Sei
  1313161554: 'aurora', // Aurora
  42220: 'celo', // Celo
  1284: 'moonbeam', // Moonbeam
  1285: 'moonriver', // Moonriver
  1666600000: 'harmony-shard-0', // Harmony shard 0
  170: 'unichain', // Unichain (when listed)
  7777777: 'zora', // Zora
  5000: 'mantle', // Mantle
  14: 'flare', // Flare
  40: 'telos', // Telos
  50: 'xdc', // XDC
  57: 'syscoin', // Syscoin
  61: 'ethereum-classic', // Ethereum Classic
  57073: 'inkonchain', // Inkonchain (if/when listed)
  122: 'fuse', // Fuse
  60808: 'bob', // BOB
  81457: 'blast', // Blast
  1868: 'soneium', // Soneium
  480: 'worldcoin', // World Chain (Worldcoin)
  1135: 'lisk', // Lisk
  1923: 'swellchain', // Swellchain
  2741: 'abstract', // Abstract
  747474: 'katana', // Katana
  146: 'sonic' // Sonic
  // 80094: 'berachain', // add when officially on CG
}

/**
 * EVM chainId → CoinGecko "coin id" for native gas token
 * These are coin IDs used with /simple/price?ids=<coinId>&vs_currencies=usd
 */
const NATIVE_ID_BY_CHAIN = {
  1: 'ethereum', // ETH
  10: 'ethereum', // Optimism uses ETH
  56: 'binancecoin', // BNB
  100: 'xdai', // xDAI / Gnosis
  137: 'matic-network', // MATIC
  250: 'fantom', // FTM
  8453: 'ethereum', // Base uses ETH
  59144: 'ethereum', // Linea uses ETH
  34443: 'ethereum', // Mode uses ETH
  42161: 'ethereum', // Arbitrum uses ETH
  43114: 'avalanche-2', // AVAX
  1329: 'sei-network', // SEI
  1313161554: 'ethereum', // Aurora uses ETH
  42220: 'celo', // CELO
  1284: 'moonbeam', // GLMR
  1285: 'moonriver', // MOVR
  1666600000: 'harmony', // ONE
  170: 'ethereum', // Unichain uses ETH
  7777777: 'ethereum', // Zora uses ETH
  5000: 'mantle', // MNT
  14: 'flare-networks', // Flare (if this slug differs, native will be 0)
  40: 'telos', // TLOS
  50: 'xdce-crowd-sale', // XDC (coin id used by CG)
  57: 'syscoin', // SYS
  61: 'ethereum-classic', // ETC
  57073: 'inkonchain', // if listed
  122: 'fuse', // FUSE
  60808: 'bob', // if listed
  81457: 'blast', // if listed
  1868: 'soneium', // if listed
  480: 'worldcoin', // WLD / Worldchain
  1135: 'lisk', // LSK
  1923: 'swellchain', // if listed
  2741: 'abstract', // if listed
  747474: 'katana', // if listed
  146: 'sonic' // if listed
  // 80094: 'berachain', // add when officially on CG
}

// ----------------- exported helpers -----------------

export async function ping() {
  const result = {
    ok: false,
    message: '',
    apiKeyLoaded: !!COINGECKO_API_KEY
  }

  try {
    const { data } = await cg.get('/ping')
    result.ok = true
    result.message = data?.gecko_says || '(v3 ping ok)'
  } catch (e) {
    result.ok = false
    result.message = e?.message || String(e)
  }

  return result
}

/**
 * Get USD price for a *native* asset on a chain
 */
export async function getNativeUsdPrice(chainId) {
  const coinId = NATIVE_ID_BY_CHAIN[chainId]
  if (!coinId) {
    console.warn(`getNativeUsdPrice: no mapping for chainId=${chainId}`)
    return 0
  }

  const cacheKey = `native_${coinId}`
  const cached = getFromCache(cacheKey)
  if (cached != null) return cached

  try {
    const { data } = await cg.get('/simple/price', {
      params: {
        ids: coinId,
        vs_currencies: 'usd',
        include_last_updated_at: true
      }
    })
    const price = Number(data?.[coinId]?.usd || 0)
    priceCache.set(cacheKey, { data: price, timestamp: Date.now() })
    return price
  } catch (e) {
    console.error(`Error fetching native price for chain ${chainId}:`, e.message)
    return 0
  }
}

/**
 * Get USD prices for a list of ERC-20 contract addresses on a given chain
 * Returns: { [lowercasedAddress]: priceUsd }
 */
export async function getTokenUsdPrices(chainId, addresses = []) {
  const platform = PLATFORM_BY_CHAIN[chainId]
  if (!platform || !addresses.length) {
    if (!platform) {
      console.warn(`getTokenUsdPrices: no platform mapping for chainId=${chainId}`)
    }
    return {}
  }

  const normalized = addresses.map((a) => String(a).toLowerCase())
  const cacheKey = `tokens_${chainId}_${normalized.sort().join('_')}`
  const cached = getFromCache(cacheKey)
  if (cached) return cached

  try {
    const { data } = await cg.get(`/simple/token_price/${platform}`, {
      params: {
        contract_addresses: normalized.join(','),
        vs_currencies: 'usd',
        include_last_updated_at: true
      }
    })

    const out = {}
    for (const [addr, obj] of Object.entries(data || {})) {
      out[addr.toLowerCase()] = Number(obj?.usd || 0)
    }

    priceCache.set(cacheKey, { data: out, timestamp: Date.now() })
    return out
  } catch (e) {
    console.error(`Error fetching token prices for chain ${chainId}:`, e.message)
    return {}
  }
}

/**
 * Get multiple native prices in one call (used for dashboard totals)
 */
export async function getMultipleNativePrices(chainIds = []) {
  const coinIds = [
    ...new Set(
      chainIds
        .map((id) => NATIVE_ID_BY_CHAIN[id])
        .filter(Boolean)
    )
  ]
  if (!coinIds.length) return {}

  const cacheKey = `multi_native_${coinIds.sort().join('_')}`
  const cached = getFromCache(cacheKey)
  if (cached) return cached

  try {
    const { data } = await cg.get('/simple/price', {
      params: {
        ids: coinIds.join(','),
        vs_currencies: 'usd'
      }
    })

    const prices = {}
    chainIds.forEach((cid) => {
      const coinId = NATIVE_ID_BY_CHAIN[cid]
      prices[cid] = Number(data?.[coinId]?.usd || 0)
    })

    priceCache.set(cacheKey, { data: prices, timestamp: Date.now() })
    return prices
  } catch (e) {
    console.error('Error fetching multiple native prices:', e.message)
    const fallback = {}
    chainIds.forEach((cid) => {
      fallback[cid] = 0
    })
    return fallback
  }
}

/**
 * Historical price for an ERC-20 (not required for basic dust valuation)
 */
export async function getHistoricalPrice(chainId, address, days = 7) {
  const platform = PLATFORM_BY_CHAIN[chainId]
  if (!platform) return null

  const cacheKey = `hist_${chainId}_${address}_${days}`
  const cached = getFromCache(cacheKey)
  if (cached) return cached

  try {
    const { data } = await cg.get(
      `/coins/${platform}/contract/${address}/market_chart`,
      {
        params: {
          vs_currency: 'usd',
          days
        }
      }
    )

    const prices = data?.prices || []
    priceCache.set(cacheKey, { data: prices, timestamp: Date.now() })
    return prices
  } catch (e) {
    console.error(`Error fetching historical price for ${address}:`, e.message)
    return null
  }
}

/**
 * Token metadata + current price (optional)
 */
export async function getTokenMetadataAndPrice(chainId, address) {
  const platform = PLATFORM_BY_CHAIN[chainId]
  if (!platform) return null

  const cacheKey = `meta_${chainId}_${address}`
  const cached = getFromCache(cacheKey)
  if (cached) return cached

  try {
    const { data } = await cg.get(`/coins/${platform}/contract/${address}`, {
      params: {
        localization: false,
        tickers: false,
        market_data: true,
        community_data: false,
        developer_data: false,
        sparkline: false
      }
    })

    const meta = {
      name: data?.name,
      symbol: data?.symbol?.toUpperCase(),
      decimals: data?.detail_platforms?.[platform]?.decimal_place || 18,
      price: data?.market_data?.current_price?.usd || 0,
      priceChange24h: data?.market_data?.price_change_percentage_24h || 0,
      logo: data?.image?.small
    }

    priceCache.set(cacheKey, { data: meta, timestamp: Date.now() })
    return meta
  } catch (e) {
    console.error(`Error fetching token metadata for ${address}:`, e.message)
    return null
  }
}

/**
 * Calculate total USD value of "dust results"
 * Accepts either:
 * - result.tokenDust (old shape)
 * - result.claimableTokens (new shape from web3Service)
 */
export async function calculateTotalDustValue(dustResults) {
  if (!dustResults || !dustResults.length) return 0

  try {
    const chainIds = [...new Set(dustResults.map((r) => r.chainId))]
    const nativePrices = await getMultipleNativePrices(chainIds)

    let total = 0

    for (const r of dustResults) {
      const nativePrice = nativePrices[r.chainId] || 0
      const nativeBal = parseFloat(r.nativeBalance || '0')
      const nativeValue = nativeBal * nativePrice

      const tokens = r.tokenDust || r.claimableTokens || []
      let tokenValue = 0

      if (tokens.length) {
        const addrs = tokens.map((t) => t.address)
        const tokenPrices = await getTokenUsdPrices(r.chainId, addrs)

        for (const t of tokens) {
          const p = tokenPrices[t.address.toLowerCase()] || 0
          tokenValue += parseFloat(t.balance || '0') * p
        }
      }

      total += nativeValue + tokenValue
    }

    return total
  } catch (e) {
    console.error('Error calculating total dust value:', e)
    return 0
  }
}

/**
 * Cache helpers
 */
export function clearPriceCache() {
  priceCache.clear()
}

export function getCacheStats() {
  return {
    size: priceCache.size,
    entries: Array.from(priceCache.entries()).map(([key, v]) => ({
      key,
      ageMs: Date.now() - v.timestamp
    }))
  }
}

// default export so you can `import priceService from './priceService'`
const priceService = {
  ping,
  getNativeUsdPrice,
  getTokenUsdPrices,
  getMultipleNativePrices,
  getHistoricalPrice,
  getTokenMetadataAndPrice,
  calculateTotalDustValue,
  clearPriceCache,
  getCacheStats
}

export default priceService