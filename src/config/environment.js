import { 
  ALCHEMY_ETH_MAINNET_API_KEY,
  WALLETCONNECT_PROJECT_ID,
  ONEINCH_API_KEY,
  COINGECKO_API_KEY,
  APP_ENVIRONMENT 
} from '@env';

export const ENV = {
  IS_PRODUCTION: APP_ENVIRONMENT === 'production',
  IS_DEVELOPMENT: APP_ENVIRONMENT === 'development',
};

export const CHAIN_CONFIGS = {
  1: {
    name: 'Ethereum',
    symbol: 'ETH',
    rpcUrls: [
      `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_ETH_MAINNET_API_KEY}`,
      `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
    ],
    explorer: 'https://etherscan.io',
    logo: '🟦'
  },
  137: {
    name: 'Polygon',
    symbol: 'MATIC', 
    rpcUrls: [
      `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_POLYGON_MAINNET_API_KEY}`,
      `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
    ],
    explorer: 'https://polygonscan.com',
    logo: '🟣'
  },
  // ... other chains with similar structure
};

export const DEX_CONFIG = {
  ONEINCH: {
    baseURLs: {
      1: 'https://api.1inch.io/v5.0/1',
      137: 'https://api.1inch.io/v5.0/137',
    },
    apiKey: ONEINCH_API_KEY
  },
  PARASWAP: {
    baseURL: 'https://api.paraswap.io/v2',
    apiKey: process.env.PARASWAP_API_KEY
  }
};

export const PRICE_FEED_CONFIG = {
  COINGECKO: {
    baseURL: 'https://api.coingecko.com/api/v3',
    apiKey: COINGECKO_API_KEY
  }
};