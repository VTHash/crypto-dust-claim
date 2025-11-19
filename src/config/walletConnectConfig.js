import {
  mainnet as rcMainnet,
  polygon as rcPolygon,
  arbitrum as rcArbitrum,
  base as rcBase,
  optimism as rcOptimism,
} from "@reown/appkit/networks";

// -------------------------------
// 1) Environment-based variables
// -------------------------------
export const projectId =
  import.meta.env.VITE_PROJECT_ID || import.meta.env.VITE_REOWN_PROJECT_ID;
const ALCHEMY_KEY = import.meta.env.VITE_ALCHEMY_API_KEY;
const INFURA_KEY = import.meta.env.VITE_INFURA_PROJECT_ID;

// -------------------------------
// 2) App metadata
// -------------------------------

export function getReownMetadata() {
  const url =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://dustclaim.xyz/"; // fallback for SSR/build
  return {
    name: "DustClaim",
    description: "Claim your crypto dust across multiple blockchains",
    url, // MUST match the page origin
    icons: ["https://dustclaim.xyz/icon.png"],
  };
}
// -------------------------------
// 3) Supported Chains (UI + RPC)
// -------------------------------

export const SUPPORTED_CHAINS = {
  1: {
    name: "Ethereum",
    symbol: "ETH",
    rpcUrl: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    explorer: "https://etherscan.io",
    logo: "/logo/ethereum.png",
  },

  10: {
    name: "Optimism",
    symbol: "ETH",
    rpcUrl: `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    explorer: "https://optimistic.etherscan.io",
    logo: "/logo/optimism.png",
  },

  8453: {
    name: "Base",
    symbol: "ETH",
    rpcUrl: "https://mainnet.base.org",
    explorer: "https://basescan.org",
    logo: "/logo/base.png",
  },

  42161: {
    name: "Arbitrum One",
    symbol: "ETH",
    rpcUrl: `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    explorer: "https://arbiscan.io",
    logo: "/logo/arbitrum.png",
  },

  137: {
    name: "Polygon PoS",
    symbol: "MATIC",
    rpcUrl: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    explorer: "https://polygonscan.com",
    logo: "/logo/polygon.png",
  },

  56: {
    name: "BNB Smart Chain",
    symbol: "BNB",
    rpcUrl: "https://bsc-dataseed.binance.org/",
    explorer: "https://bscscan.com",
    logo: "/logo/bnb.png",
  },

  43114: {
    name: "Avalanche C-Chain",
    symbol: "AVAX",
    rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    explorer: "https://snowscan.xyz/",
    logo: "/logo/avalanche.png",
  },

  100: {
    name: "Gnosis Chain",
    symbol: "xDAI",
    rpcUrl: "https://rpc.gnosischain.com",
    explorer: "https://gnosisscan.io",
    logo: "/logo/gnosis.png",
  },

  250: {
    name: "Fantom Opera",
    symbol: "FTM",
    rpcUrl: "https://1rpc.io/ftm",
    explorer: "https://ftmscan.com",
    logo: "/logo/fantom.png",
  },

  59144: {
    name: "Linea",
    symbol: "ETH",
    rpcUrl: "https://rpc.linea.build", // safer public endpoint than Infura
    explorer: "https://lineascan.build",
    logo: "/logo/linea.png",
  },

  7777777: {
    name: "Zora",
    symbol: "ETH",
    rpcUrl: "https://rpc.zora.energy",
    explorer: "https://explorer.zora.energy",
    logo: "/logo/zora.jpg",
  },

  34443: {
    name: "Mode",
    symbol: "ETH",
    rpcUrl: "https://mainnet.mode.network",
    explorer: "https://modescan.io",
    logo: "/logo/routescan.jpg",
  },

  1329: {
    name: "Sei Network",
    symbol: "SEI",
    rpcUrl: "https://evm-rpc.sei-apis.com/",
    explorer: "https://seitrace.com",
    logo: "/logo/sei.png",
  },

  80094: {
    name: "Berachain bArtio",
    symbol: "BERA",
    rpcUrl: "https://rpc.berachain.com/",
    explorer: "https://berascan.com",
    logo: "/logo/bera.png",
  },

 

  42220: {
    name: "Celo Mainnet",
    symbol: "CELO",
    rpcUrl: "https://rpc.ankr.com/celo",
    explorer: "https://celoscan.io",
    logo: "/logo/celo.png",
  },

  1313161554: {
    name: "Aurora Mainnet",
    symbol: "ETH",
    rpcUrl: "https://mainnet.aurora.dev",
    explorer: "https://aurorascan.dev",
    logo: "/logo/aurora.png",
  },

  1284: {
    name: "Moonbeam",
    symbol: "GLMR",
    rpcUrl: "https://moonbeam.drpc.org",
    explorer: "https://moonscan.io",
    logo: "/logo/moonbeam.png",
  },

  1285: {
    name: "Moonriver",
    symbol: "MOVR",
    rpcUrl: "https://moonriver.drpc.org",
    explorer: "https://moonriver.moonscan.io",
    logo: "/logo/moonriver.png",
  },

 
  324: {
  name: "zkSync Mainnet",
  symbol: "ETH",
  rpcUrl: "https://rpc.ankr.com/zksync_era",
  explorer: "https://explorer.zksync.io",
  logo: "/logo/zksync.jpg",
},

9745: {
  name: "Plasma Mainnet",
  symbol: "XPL",
  rpcUrl: "https://plasma.drpc.org",
  explorer: "https://plasmascan.to/",
  logo: "/logo/plasma.png",
},

130: {
  name: "Unichain",
  symbol: "ETH",
  rpcUrl: "https://unichain.drpc.org",
  explorer: "https://uniscan.xyz",
  logo: "/logo/unichain.png",
},

5000: {
  name: "Mantle",
  symbol: "MNT",
  rpcUrl: "https://mantle.drpc.org",
  explorer: "https://explorer.mantlenetwork.io",
  logo: "/logo/mantle.png",
},

14: {
    name: "Flare",
    symbol: "FLR",
    rpcUrl: "https://flare-api.flare.network/ext/C/rpc",
    explorer: "https://flare-explorer.flare.network",
    // or: "https://mainnet.flarescan.com"
    logo: "/logo/flare.png"
  },

40: {
  name: "Telos",
  symbol: "TLOS",
  rpcUrl: "https://1rpc.io/telos/evm",
  explorer: "https://teloscan.io",
  logo: "/logo/telos.png"
},

57: {
  name: "Syscoin",
  symbol: "SYS",
  rpcUrl: "https://rpc.syscoin.org",
  explorer: "https://explorer.syscoin.org",
  logo: "/logo/sys.jpg"
},

50: {
  name: "XDC Network",
  symbol: "XDC",
  rpcUrl: "https://rpc.xinfin.network",
  explorer: "https://explorer.xinfin.network",
  logo: "/logo/xdc.png"
},

61: {
  name: "Ethereum Classic",
  symbol: "ETC",
  rpcUrl: "https://etc.rivet.link", // reliable public RPC
  explorer: "https://blockscout.com/etc/mainnet",
  logo: "/logo/ethereum-classic.png"
},

57073: {
  name: "Inkonchain",
  symbol: "ETH",
  rpcUrl: "https://ink.drpc.org", // adjust if you use a different RPC endpoint
  explorer: "https://explorer.inkonchain.com", // or your preferred explorer URL
  logo: "/logo/ink.png" 
},

122: {
  name: "Fuse Network",
  symbol: "FUSE",
  rpcUrl: "https://rpc.fuse.io",
  explorer: "https://explorer.fuse.io",
  logo: "/logo/fuse.png"
},

60808: {
  name: "BOB Mainnet",
  symbol: "ETH",
  rpcUrl: "https://rpc.gobob.xyz/",
  explorer: "https://explorer.gobob.xyz/",
  logo: "/logo/bob.jpg"
},

81457: {
  name: "Blast Mainnet",
  symbol: "ETH",
  rpcUrl: "https://rpc.blast.io",
  explorer: "https://blastscan.io",
  logo: "/logo/blast.jpeg"
},

1868: {
  name: "Soneium",
  symbol: "ETH",
  rpcUrl: "https://soneium.drpc.org",
  explorer: "https://mainnet-explorer.soneium.org",
  logo: "/logo/soneium.jpg"
},

480: {
  name: "World Chain",
  symbol: "ETH",
  rpcUrl: "https://worldchain-mainnet.g.alchemy.com/public",
  explorer: "https://worldchain-mainnet.explorer.alchemy.com",
  logo: "/logo/worldcoin.png"
},

1135: {
  name: "Lisk",
  symbol: "ETH",
  rpcUrl: "https://rpc.api.lisk.com",
  explorer: "https://blockscout.lisk.com",
  logo: "/logo/lisk.png"
},

1923: {
  name: "Swellchain",
  symbol: "ETH",
  rpcUrl: "https://swell-mainnet.alt.technology",
  explorer: "https://explorer.swellnetwork.io",
  logo: "/logo/swell.png"
},

2741: {
  name: "Abstract",
  symbol: "ETH",
  rpcUrl: "https://api.mainnet.abs.xyz",
  explorer: "https://abscan.org/",
  logo: "/logo/abstract.png"
},

747474: {
  name: "Katana",
  symbol: "ETH",
  rpcUrl: "https://rpc.katana.network",
  explorer: "https://explorer.katanarpc.com",
  logo: "/logo/katana.jpg"
},

146: {
  name: "Sonic",
  symbol: "S",
  rpcUrl: "https://rpc.soniclabs.com",
  explorer: "https://sonicscan.org",
  logo: "/logo/sonic.jpg"
},


};
// -------------------------------
// 4) Convert to Reown CAIP networks
// -------------------------------
function toReownNetwork(id, meta) {
  return {
    id: Number(id),
    chainNamespace: "eip155",
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
      ? { default: { name: "explorer", url: meta.explorer } }
      : undefined,
  };
}

// Include Reown built-ins + your expanded list
const builtinIds = new Set([1, 137, 42161, 8453, 10]);

export const reownNetworks = [
  rcMainnet,
  rcPolygon,
  rcArbitrum,
  rcBase,
  rcOptimism,
  ...Object.entries(SUPPORTED_CHAINS)
    .filter(([id]) => !builtinIds.has(Number(id)))
    .map(([id, meta]) => toReownNetwork(id, meta)),
];

// Handy list of numeric chainIds if you need them
export const chainIds = reownNetworks.map((n) => Number(n.id));
