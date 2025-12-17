// src/services/priceService.js
import axios from 'axios'

/**
 * CoinGecko client (FREE / DEMO tier)
 * - Base URL: https://api.coingecko.com/api/v3
 * - Auth header: x-cg-demo-api-key: <your-key>
 * - Simple in-memory cache + in-flight dedupe
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

// In-flight request dedupe (prevents stampedes)
const inFlight = new Map() // key -> Promise

// Attach API key header if provided
cg.interceptors.request.use((config) => {
  if (COINGECKO_API_KEY) {
    // Demo / free tier uses this header
    config.headers['x-cg-demo-api-key'] = COINGECKO_API_KEY
  }
  return config
})

// Cache successful responses by URL+params (generic cache)
cg.interceptors.response.use(
  (response) => {
    if (response.config?.url) {
      const cacheKey = response.config.url + JSON.stringify(response.config.params || {})
      priceCache.set(cacheKey, {
        data: response.data,
        timestamp: Date.now()
      })
    }
    return response
  },
  (error) => Promise.reject(error)
)

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

function setCache(key, data) {
  priceCache.set(key, { data, timestamp: Date.now() })
}

function axiosErrToString(e) {
  const status = e?.response?.status
  const msg =
    e?.response?.data?.error ||
    e?.response?.data?.message ||
    e?.message ||
    String(e)
  return status ? `HTTP ${status}: ${msg}` : msg
}

// Wrapper: cached + in-flight de-dupe for expensive calls
async function withDedupe(cacheKey, fn) {
  const cached = getFromCache(cacheKey)
  if (cached != null) return cached

  const existing = inFlight.get(cacheKey)
  if (existing) return existing

  const p = (async () => {
    try {
      const val = await fn()
      setCache(cacheKey, val)
      return val
    } finally {
      inFlight.delete(cacheKey)
    }
  })()

  inFlight.set(cacheKey, p)
  return p
}

// ----------------- chain → platform / coin mappings -----------------

/**
 * EVM chainId → CoinGecko "platform" for ERC-20 token prices
 * Only chains listed here will get ERC-20 USD values.
 */
const PLATFORM_BY_CHAIN = {
  1: 'ethereum',
  10: 'optimistic-ethereum',
  56: 'binance-smart-chain',
  100: 'xdai',
  137: 'polygon-pos',
  250: 'fantom',
  8453: 'base',
  59144: 'linea',
  34443: 'mode',
  42161: 'arbitrum-one',
  43114: 'avalanche',
  1329: 'sei-network',
  1313161554: 'aurora',
  42220: 'celo',
  1284: 'moonbeam',
  1285: 'moonriver',
  1666600000: 'harmony-shard-0',
  170: 'unichain',
  7777777: 'zora',
  5000: 'mantle',
  14: 'flare',
  40: 'telos',
  50: 'xdc',
  57: 'syscoin',
  61: 'ethereum-classic',
  57073: 'inkonchain',
  122: 'fuse',
  60808: 'bob',
  81457: 'blast',
  1868: 'soneium',
  480: 'worldcoin',
  1135: 'lisk',
  1923: 'swellchain',
  2741: 'abstract',
  747474: 'katana',
  146: 'sonic',
  534352: 'scroll',
  324: 'zksync',
  167000: 'taiko',
  42170: 'arbitrum-nova',

  // ✅ Morph (you had a likely typo earlier; support both)
  28105: 'morph',
  28185: 'morph'
}

/**
 * EVM chainId → CoinGecko "coin id" for native gas token
 */
const NATIVE_ID_BY_CHAIN = {
  1: 'ethereum',
  10: 'ethereum',
  56: 'binancecoin',
  100: 'xdai',
  137: 'matic-network',
  250: 'fantom',
  8453: 'ethereum',
  59144: 'ethereum',
  34443: 'ethereum',
  42161: 'ethereum',
  43114: 'avalanche-2',
  1329: 'sei-network',
  1313161554: 'ethereum',
  42220: 'celo',
  1284: 'moonbeam',
  1285: 'moonriver',
  1666600000: 'harmony',
  170: 'ethereum',
  7777777: 'ethereum',
  5000: 'mantle',
  14: 'flare-networks',
  40: 'telos',
  50: 'xdce-crowd-sale',
  57: 'syscoin',
  61: 'ethereum-classic',
  57073: 'inkonchain',
  122: 'fuse',
  60808: 'bob',
  81457: 'blast',
  1868: 'soneium',
  480: 'worldcoin',
  1135: 'lisk',
  1923: 'swellchain',
  2741: 'abstract',
  747474: 'katana',
  146: 'sonic'
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
    result.message = axiosErrToString(e)
  }

  return result
}

/**
 * Get USD price for a native asset on a chain
 */
export async function getNativeUsdPrice(chainId) {
  const coinId = NATIVE_ID_BY_CHAIN[chainId]
  if (!coinId) {
    // mapping missing is not fatal
    return 0
  }

  const cacheKey = `native_${coinId}`

  return withDedupe(cacheKey, async () => {
    try {
      const { data } = await cg.get('/simple/price', {
        params: {
          ids: coinId,
          vs_currencies: 'usd',
          include_last_updated_at: true
        }
      })
      return Number(data?.[coinId]?.usd || 0)
    } catch (e) {
      // Rate limit: return cached if we had one, else 0
      const cached = getFromCache(cacheKey)
      if (cached != null) return cached
      console.warn(`CoinGecko native price error (chain ${chainId}):`, axiosErrToString(e))
      return 0
    }
  })
}

/**
 * Get USD prices for a list of ERC-20 contract addresses on a given chain
 * Returns: { [lowercasedAddress]: priceUsd }
 */
export async function getTokenUsdPrices(chainId, addresses = []) {
  const platform = PLATFORM_BY_CHAIN[chainId]
  if (!platform || !addresses.length) {
    return {}
  }

  const normalized = addresses.map((a) => String(a).toLowerCase())

  // Keep cache key stable (order-insensitive)
  const cacheKey = `tokens_${chainId}_${[...normalized].sort().join('_')}`

  return withDedupe(cacheKey, async () => {
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
      return out
    } catch (e) {
      const cached = getFromCache(cacheKey)
      if (cached != null) return cached
      console.warn(`CoinGecko token price error (chain ${chainId}):`, axiosErrToString(e))
      return {}
    }
  })
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

  return withDedupe(cacheKey, async () => {
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
      return prices
    } catch (e) {
      const cached = getFromCache(cacheKey)
      if (cached != null) return cached
      console.warn('CoinGecko multi-native error:', axiosErrToString(e))
      const fallback = {}
      chainIds.forEach((cid) => {
        fallback[cid] = 0
      })
      return fallback
    }
  })
}

/**
 * Historical price for an ERC-20 (optional)
 */
export async function getHistoricalPrice(chainId, address, days = 7) {
  const platform = PLATFORM_BY_CHAIN[chainId]
  if (!platform) return null

  const cacheKey = `hist_${chainId}_${address}_${days}`

  return withDedupe(cacheKey, async () => {
    try {
      const { data } = await cg.get(`/coins/${platform}/contract/${address}/market_chart`, {
        params: {
          vs_currency: 'usd',
          days
        }
      })
      return data?.prices || []
    } catch (e) {
      const cached = getFromCache(cacheKey)
      if (cached != null) return cached
      console.warn(`CoinGecko hist error (${chainId} ${address}):`, axiosErrToString(e))
      return null
    }
  })
}

/**
 * Token metadata + current price (optional)
 */
export async function getTokenMetadataAndPrice(chainId, address) {
  const platform = PLATFORM_BY_CHAIN[chainId]
  if (!platform) return null

  const cacheKey = `meta_${chainId}_${address}`

  return withDedupe(cacheKey, async () => {
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

      return {
        name: data?.name,
        symbol: data?.symbol?.toUpperCase(),
        decimals: data?.detail_platforms?.[platform]?.decimal_place || 18,
        price: data?.market_data?.current_price?.usd || 0,
        priceChange24h: data?.market_data?.price_change_percentage_24h || 0,
        logo: data?.image?.small
      }
    } catch (e) {
      const cached = getFromCache(cacheKey)
      if (cached != null) return cached
      console.warn(`CoinGecko meta error (${chainId} ${address}):`, axiosErrToString(e))
      return null
    }
  })
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
          const p = tokenPrices[String(t.address).toLowerCase()] || 0
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
  inFlight.clear()
}

export function getCacheStats() {
  return {
    size: priceCache.size,
    inflight: inFlight.size,
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