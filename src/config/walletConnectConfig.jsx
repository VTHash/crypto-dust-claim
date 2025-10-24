import {
  mainnet as rcMainnet,
  polygon as rcPolygon,
  arbitrum as rcArbitrum,
  base as rcBase,
  optimism as rcOptimism,
} from '@reown/appkit/networks'

// -------------------------------
// 1) Environment-based variables
// -------------------------------
export const projectId = import.meta.env.VITE_PROJECT_ID || import.meta.env.VITE_REOWN_PROJECT_ID
const ALCHEMY_KEY = import.meta.env.VITE_ALCHEMY_API_KEY
const INFURA_KEY = import.meta.env.VITE_INFURA_PROJECT_ID

// -------------------------------
// 2) App metadata
// -------------------------------
export const metadata = {
  name: 'DustClaim',
  description: 'Claim your crypto dust across chains',
  url: 'https://dustclaim.xyz',
  icons: ['https://dustclaim.xyz/icon.png'],
}

// -------------------------------
// 3) Supported Chains (UI + RPC)
// -------------------------------
export const SUPPORTED_CHAINS = {
  1: { name: 'Ethereum', symbol: 'ETH', rpcUrl: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`, explorer: 'https://etherscan.io', logo: '/logo/ethereum.png' },
  10: { name: 'OP Mainnet', symbol: 'ETH', rpcUrl: `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`, explorer: 'https://optimistic.etherscan.io', logo: '/logo/optimism.png' },
  8453: { name: 'Base', symbol: 'ETH', rpcUrl: 'https://mainnet.base.org', explorer: 'https://basescan.org', logo: '/logo/base.png' },
  42161:{ name: 'Arbitrum One', symbol: 'ETH', rpcUrl: `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`, explorer: 'https://arbiscan.io', logo: '/logo/arbitrum.png' },
  137: { name: 'Polygon PoS', symbol: 'MATIC', rpcUrl: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`, explorer: 'https://polygonscan.com', logo: '/logo/polygon.png' },

  // Other networks (non-Reown defaults)
  56: { name: 'BNB Smart Chain', symbol: 'BNB', rpcUrl: 'https://bsc-dataseed.binance.org/', explorer: 'https://bscscan.com', logo: '/logo/bnb.png' },
  43114:{ name: 'Avalanche C', symbol: 'AVAX', rpcUrl: `https://avalanche-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`, explorer: 'https://snowtrace.io', logo: '/logo/avalanche.png' },
  100: { name: 'Gnosis', symbol: 'xDAI', rpcUrl: 'https://rpc.gnosischain.com', explorer: 'https://gnosisscan.io', logo: '/logo/gnosis.png' },
  250: { name: 'Fantom', symbol: 'FTM', rpcUrl: `https://fantom-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`, explorer: 'https://explorer.fantom.network/', logo: '/logo/fantom.png' },
  59144:{ name: 'Linea', symbol: 'ETH', rpcUrl: `https://linea-mainnet.infura.io/v3/${INFURA_KEY}`, explorer: 'https://lineascan.build', logo: '/logo/linea.png' },
  7777777:{name: 'Zora', symbol: 'ETH', rpcUrl: 'https://rpc.zora.energy', explorer: 'https://explorer.zora.energy', logo: '/logo/zora.jpg' },
  34443:{ name: 'Mode', symbol: 'ETH', rpcUrl: 'https://mainnet.mode.network', explorer: 'https://modescan.io', logo: '/logo/routescan.jpg' },
  1329: { name: 'Sei Network', symbol: 'SEI', rpcUrl: 'https://evm-rpc.sei-apis.com/', explorer: 'https://seitrace.com', logo: '/logo/sei.png' },
  80094:{ name: 'Berachain', symbol: 'BERA', rpcUrl: 'https://rpc.berachain.com/', explorer: 'https://berascan.com', logo: '/logo/bera.png' },
  195: { name: 'X1', symbol: 'OKB', rpcUrl: 'https://rpc.x1.xyz', explorer: 'https://www.oklink.com/x1', logo: '/logo/okb.png' },
}

// -------------------------------
// 4) Convert to Reown CAIP networks
// -------------------------------
function toReownNetwork(id, meta) {
  return {
    id: Number(id),
    chainNamespace: 'eip155',
    name: meta.name,
    nativeCurrency: {
      name: meta.symbol,
      symbol: meta.symbol,
      decimals: 18,
    },
    rpcUrls: {
      default: { http: [meta.rpcUrl] },
      public: { http: [meta.rpcUrl] },
    },
    blockExplorers: meta.explorer
      ? { default: { name: 'explorer', url: meta.explorer } }
      : undefined,
  }
}

// Include Reown built-ins + your expanded list
const builtinIds = new Set([1, 137, 42161, 8453, 10])

export const reownNetworks = [
  rcMainnet,
  rcPolygon,
  rcArbitrum,
  rcBase,
  rcOptimism,
  ...Object.entries(SUPPORTED_CHAINS)
    .filter(([id]) => !builtinIds.has(Number(id)))
    .map(([id, meta]) => toReownNetwork(id, meta)),
]

// Handy list of numeric chainIds if you need them
export const chainIds = reownNetworks.map(n => Number(n.id))