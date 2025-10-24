import axios from 'axios';

/**
 * Lightweight CoinGecko client for crypto dust aggregator
 * - Uses Pro header if VITE_COINGECKO_API_KEY is present
 * - Falls back to public endpoints if not
 * - Includes caching and rate limiting protection
 */

const COINGECKO_API_KEY = import.meta.env.VITE_COINGECKO_API_KEY;

const cg = axios.create({
  baseURL: 'https://api.coingecko.com/api/v3',
  timeout: 15000,
  headers: {
    'User-Agent': 'CryptoDustClaim/1.0'
  }
});

// Simple in-memory cache to reduce API calls
const priceCache = new Map();
const CACHE_DURATION = 60000; // 1 minute cache

// Attach API key header if provided
cg.interceptors.request.use((config) => {
  if (COINGECKO_API_KEY) {
    config.headers['x-cg-pro-api-key'] = COINGECKO_API_KEY;
  }
  return config;
});

// Add response caching
cg.interceptors.response.use((response) => {
  if (response.config.url) {
    const cacheKey = response.config.url;
    priceCache.set(cacheKey, {
      data: response.data,
      timestamp: Date.now()
    });
  }
  return response;
});

/**
 * Map EVM chainId -> CoinGecko "platform" slug for token price lookups
 */
const PLATFORM_BY_CHAIN = {
  1: 'ethereum',
  10: 'optimistic-ethereum',
  137: 'polygon-pos',
  42161: 'arbitrum-one',
  43114: 'avalanche',
  250: 'fantom',
  56: 'binance-smart-chain',
  8453: 'base',
  59144: 'linea',
  100: 'xdai',
  1313161554: 'aurora',
  42220: 'celo',
  1284: 'moonbeam',
  1285: 'moonriver',
  1666600000: 'harmony-shard-0'
};

/**
 * Map EVM chainId -> Coin ID for native coin price
 */
const NATIVE_ID_BY_CHAIN = {
  1: 'ethereum', // ETH
  10: 'ethereum', // ETH on OP
  8453: 'ethereum', // ETH on Base
  42161: 'ethereum', // ETH on Arbitrum
  137: 'matic-network', // MATIC
  56: 'binancecoin', // BNB
  43114: 'avalanche-2', // AVAX
  250: 'fantom', // FTM
  59144: 'ethereum', // ETH on Linea
  100: 'dai', // xDAI (using DAI price)
  1313161554: 'ethereum', // ETH on Aurora
  42220: 'celo', // CELO
  1284: 'moonbeam', // GLMR
  1285: 'moonriver', // MOVR
  1666600000: 'harmony' // ONE
};

/**
 * Get USD price for a native asset on a given chainId with caching
 */
export async function getNativeUsdPrice(chainId) {
  const id = NATIVE_ID_BY_CHAIN[chainId];
  if (!id) {
    console.warn(`No native price mapping for chainId: ${chainId}`);
    return 0;
  }

  const cacheKey = `native_${chainId}`;
  const cached = priceCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const { data } = await cg.get('/simple/price', {
      params: { 
        ids: id, 
        vs_currencies: 'usd',
        include_last_updated_at: true
      }
    });

    const price = Number(data?.[id]?.usd || 0);
    
    // Cache the result
    priceCache.set(cacheKey, {
      data: price,
      timestamp: Date.now()
    });

    return price;
  } catch (error) {
    console.error(`Error fetching native price for chain ${chainId}:`, error.message);
    return 0;
  }
}

/**
 * Get USD prices for a list of ERC-20 contract addresses on a given chain
 * Returns: { [lowercasedAddress]: priceUsd }
 */
export async function getTokenUsdPrices(chainId, addresses = []) {
  const platform = PLATFORM_BY_CHAIN[chainId];
  if (!platform || !addresses.length) {
    console.warn(`No platform mapping for chainId: ${chainId} or no addresses provided`);
    return {};
  }

  // Create cache key
  const cacheKey = `tokens_${chainId}_${addresses.sort().join('_')}`;
  const cached = priceCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.data;
  }

  // CoinGecko expects lowercase hex addresses
  const addrs = addresses.map((a) => String(a).toLowerCase()).join(',');
  
  try {
    const { data } = await cg.get(`/simple/token_price/${platform}`, {
      params: {
        contract_addresses: addrs,
        vs_currencies: 'usd',
        include_last_updated_at: true
      }
    });

    // data is keyed by address; normalize to numbers
    const prices = {};
    for (const [addr, obj] of Object.entries(data || {})) {
      prices[addr.toLowerCase()] = Number(obj?.usd || 0);
    }

    // Cache the results
    priceCache.set(cacheKey, {
      data: prices,
      timestamp: Date.now()
    });

    return prices;
  } catch (error) {
    console.error(`Error fetching token prices for chain ${chainId}:`, error.message);
    return {};
  }
}

/**
 * Get multiple native prices in one call (optimized for multi-chain apps)
 */
export async function getMultipleNativePrices(chainIds = []) {
  const uniqueIds = [...new Set(chainIds.map(id => NATIVE_ID_BY_CHAIN[id]).filter(Boolean))];
  
  if (!uniqueIds.length) return {};

  const cacheKey = `multi_native_${uniqueIds.sort().join('_')}`;
  const cached = priceCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const { data } = await cg.get('/simple/price', {
      params: { 
        ids: uniqueIds.join(','), 
        vs_currencies: 'usd'
      }
    });

    const prices = {};
    chainIds.forEach(chainId => {
      const coinId = NATIVE_ID_BY_CHAIN[chainId];
      prices[chainId] = Number(data?.[coinId]?.usd || 0);
    });

    // Cache the results
    priceCache.set(cacheKey, {
      data: prices,
      timestamp: Date.now()
    });

    return prices;
  } catch (error) {
    console.error('Error fetching multiple native prices:', error.message);
    
    // Return fallback prices
    const fallbackPrices = {};
    chainIds.forEach(chainId => {
      fallbackPrices[chainId] = 0;
    });
    return fallbackPrices;
  }
}

/**
 * Get historical price for a token (useful for dust valuation over time)
 */
export async function getHistoricalPrice(chainId, address, days = 7) {
  const platform = PLATFORM_BY_CHAIN[chainId];
  if (!platform) return null;

  const cacheKey = `historical_${chainId}_${address}_${days}`;
  const cached = priceCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const { data } = await cg.get(`/coins/${platform}/contract/${address}/market_chart`, {
      params: {
        vs_currency: 'usd',
        days: days
      }
    });

    const historicalData = data?.prices || [];
    
    // Cache the result
    priceCache.set(cacheKey, {
      data: historicalData,
      timestamp: Date.now()
    });

    return historicalData;
  } catch (error) {
    console.error(`Error fetching historical price for ${address}:`, error.message);
    return null;
  }
}

/**
 * Get token metadata (name, symbol, decimals) along with price
 */
export async function getTokenMetadataAndPrice(chainId, address) {
  const platform = PLATFORM_BY_CHAIN[chainId];
  if (!platform) return null;

  const cacheKey = `metadata_${chainId}_${address}`;
  const cached = priceCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.data;
  }

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
    });

    const metadata = {
      name: data?.name,
      symbol: data?.symbol?.toUpperCase(),
      decimals: data?.detail_platforms?.[platform]?.decimal_place || 18,
      price: data?.market_data?.current_price?.usd || 0,
      priceChange24h: data?.market_data?.price_change_percentage_24h || 0,
      logo: data?.image?.small
    };

    // Cache the result
    priceCache.set(cacheKey, {
      data: metadata,
      timestamp: Date.now()
    });

    return metadata;
  } catch (error) {
    console.error(`Error fetching token metadata for ${address}:`, error.message);
    return null;
  }
}

/**
 * Calculate total USD value of dust for a wallet
 */
export async function calculateTotalDustValue(dustResults) {
  if (!dustResults.length) return 0;

  try {
    // Get all native prices in one call
    const chainIds = [...new Set(dustResults.map(result => result.chainId))];
    const nativePrices = await getMultipleNativePrices(chainIds);

    let totalValue = 0;

    for (const result of dustResults) {
      const nativePrice = nativePrices[result.chainId] || 0;
      const nativeValue = parseFloat(result.nativeBalance) * nativePrice;
      
      // Calculate token values if we have tokens
      let tokenValue = 0;
      if (result.tokenDust.length > 0) {
        const tokenAddresses = result.tokenDust.map(token => token.address);
        const tokenPrices = await getTokenUsdPrices(result.chainId, tokenAddresses);
        
        for (const token of result.tokenDust) {
          const tokenPrice = tokenPrices[token.address.toLowerCase()] || 0;
          tokenValue += parseFloat(token.balance) * tokenPrice;
        }
      }
      
      totalValue += nativeValue + tokenValue;
    }

    return totalValue;
  } catch (error) {
    console.error('Error calculating total dust value:', error);
    return 0;
  }
}

/**
 * Clear price cache (useful for manual refresh)
 */
export function clearPriceCache() {
  priceCache.clear();
}

/**
 * Get cache statistics (useful for debugging)
 */
export function getCacheStats() {
  return {
    size: priceCache.size,
    entries: Array.from(priceCache.entries()).map(([key, value]) => ({
      key,
      age: Date.now() - value.timestamp
    }))
  };
}

export default {
  getNativeUsdPrice,
  getTokenUsdPrices,
  getMultipleNativePrices,
  getHistoricalPrice,
  getTokenMetadataAndPrice,
  calculateTotalDustValue,
  clearPriceCache,
  getCacheStats
};