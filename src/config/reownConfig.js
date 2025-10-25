export const appKitConfig = {
  projectId: process.env.VITE_PROJECT_ID, // set in .env or app.json
  metadata: {
    name: 'DustClaim',
    description: 'Claim your crypto dust across chains',
    url: 'https://dustclaim.xyz/',
    icons: ['https://dustclaim.xyz/icon.png']
  },
  methods: [
    'eth_sendTransaction',
    'eth_signTransaction',
    'eth_sign',
    'personal_sign',
    'eth_signTypedData'
  ],
  events: ['chainChanged', 'accountsChanged']
};

export const SUPPORTED_CHAINS = {
  // Ethereum and Major L2s
  1: {
    name: 'Ethereum',
    symbol: 'ETH',
    rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY',
    explorer: 'https://etherscan.io',
    logo: '/public/logo/ethereum.png'
  },
  10: {
    name: 'OP Mainnet',
    symbol: 'ETH',
    rpcUrl: 'https://opt-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY',
    explorer: 'https://optimistic.etherscan.io',
    logo: '/logo/optimism.png'
  },
  8453: {
    name: 'Base',
    symbol: 'ETH',
    rpcUrl: 'https://mainnet.base.org', // Public RPC; use Alchemy for production:cite[10]
    explorer: 'https://basescan.org',
    logo: '/logo/base.png'
  },
  42161: {
    name: 'Arbitrum One',
    symbol: 'ETH',
    rpcUrl: 'https://arb-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY',
    explorer: 'https://arbiscan.io',
    logo: '/logo/arbitrum.png'
  },
  137: {
    name: 'Polygon PoS',
    symbol: 'MATIC',
    rpcUrl: 'https://polygon-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY',
    explorer: 'https://polygonscan.com',
    logo: '/logo/polygon.png'
  },

  // Other EVM Chains
  56: {
    name: 'BNB Smart Chain',
    symbol: 'BNB',
    rpcUrl: 'https://bsc-dataseed.binance.org/',
    explorer: 'https://bscscan.com',
    logo: '/logo/bnb.png'
  },
  43114: {
    name: 'Avalanche C-Chain',
    symbol: 'AVAX',
    rpcUrl: 'https://avalanche-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY',
    explorer: 'https://snowtrace.io',
    logo: '/logo/avalanche.png'
  },
  100: {
    name: 'Gnosis',
    symbol: 'xDAI',
    rpcUrl: 'https://rpc.gnosischain.com',
    explorer: 'https://gnosisscan.io',
    logo: '/logo/gnosis.png'
  },
  250: {
    name: 'Fantom',
    symbol: 'FTM',
    rpcUrl: 'https://fantom-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY',
    explorer: 'https://ftmscan.com',
    logo: '/logo/fantom.png'
  },
  59144: {
    name: 'Linea',
    symbol: 'ETH',
    rpcUrl: 'https://linea-mainnet.infura.io/v3/YOUR_INFURA_KEY',
    explorer: 'https://lineascan.build',
    logo: '/logo/linea.png'
  },

  // Emerging and Specialized Chains
  7777777: {
    name: 'Zora',
    symbol: 'ETH',
    rpcUrl: 'https://rpc.zora.energy',
    explorer: 'https://explorer.zora.energy',
    logo: '/logo/zora.jpg'
  },
  34443: {
    name: 'Mode',
    symbol: 'ETH',
    rpcUrl: 'https://mainnet.mode.network',
    explorer: 'https://modescan.io',
    logo: '/logo/routescan.jpg'
  },
  1329: {
    name: 'Sei Network', // V2 is EVM-compatible:cite[3]
    symbol: 'SEI',
    rpcUrl: 'https://evm-rpc.sei-apis.com/', // Confirm the latest RPC
    explorer: 'https://seitrace.com',
    logo: '/logo/sei.png'
  },
  80094: {
    name: 'Berachain', // EVM-compatible L1:cite[3]
    symbol: 'BERA',
    rpcUrl: 'https://rpc.berachain.com/', // Confirm the latest RPC
    explorer: 'https://berascan.com',
    logo: '/logo/bera.png'
  },
  195: {
    name: 'X1', // Previously Astar zkEVM
    symbol: 'OKB',
    rpcUrl: 'https://rpc.x1.xyz',
    explorer: 'https://www.oklink.com/x1',
    logo: '/logo/okb.png'
  }
};

