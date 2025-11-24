// Your universal tip address on all chains
export const UNIVERSAL_TIP_ADDRESS =
  "0x25b3Ea33069428dCD1f268F1c6139701F1dc0137";

// Full multi-chain tip support for every chain you have in DexAggregatorService
export const TIP_CHAINS = {
  1: { label: "Ethereum", symbol: "ETH", address: UNIVERSAL_TIP_ADDRESS },
  10: { label: "Optimism", symbol: "ETH", address: UNIVERSAL_TIP_ADDRESS },
  56: { label: "BNB Smart Chain", symbol: "BNB", address: UNIVERSAL_TIP_ADDRESS },
  100: { label: "Gnosis", symbol: "xDAI", address: UNIVERSAL_TIP_ADDRESS },
  137: { label: "Polygon", symbol: "MATIC", address: UNIVERSAL_TIP_ADDRESS },
  195: { label: "X1", symbol: "X1", address: UNIVERSAL_TIP_ADDRESS },
  250: { label: "Fantom", symbol: "FTM", address: UNIVERSAL_TIP_ADDRESS },
  1329:{ label: "Sei", symbol: "SEI", address: UNIVERSAL_TIP_ADDRESS },
  8453:{ label: "Base", symbol: "ETH", address: UNIVERSAL_TIP_ADDRESS },
  34443:{ label:"Mode", symbol: "ETH", address: UNIVERSAL_TIP_ADDRESS },
  42161:{ label:"Arbitrum One", symbol: "ETH", address: UNIVERSAL_TIP_ADDRESS },
  43114:{ label:"Avalanche", symbol: "AVAX", address: UNIVERSAL_TIP_ADDRESS },
  59144:{ label:"Linea", symbol: "ETH", address: UNIVERSAL_TIP_ADDRESS },
  80094:{ label:"Berachain", symbol: "BERA", address: UNIVERSAL_TIP_ADDRESS },
  7777777:{ label:"Zora", symbol: "ETH", address: UNIVERSAL_TIP_ADDRESS },
  130:{ label:"Unichain", symbol: "ETH", address: UNIVERSAL_TIP_ADDRESS },
  42220:{ label:"Celo", symbol: "CELO", address: UNIVERSAL_TIP_ADDRESS },
  1313161554:{ label:"Aurora", symbol: "ETH", address: UNIVERSAL_TIP_ADDRESS },
  1284:{ label:"Moonbeam", symbol: "GLMR", address: UNIVERSAL_TIP_ADDRESS },
  1285:{ label:"Moonriver", symbol: "MOVR", address: UNIVERSAL_TIP_ADDRESS },
  5000:{ label:"Mantle", symbol: "MNT", address: UNIVERSAL_TIP_ADDRESS },
  9745:{ label:"Plasma", symbol: "ETH", address: UNIVERSAL_TIP_ADDRESS },
  14:{ label:"Flare", symbol: "FLR", address: UNIVERSAL_TIP_ADDRESS },
  40:{ label:"Telos", symbol: "TLOS", address: UNIVERSAL_TIP_ADDRESS },
  50:{ label:"XDC", symbol: "XDC", address: UNIVERSAL_TIP_ADDRESS },
  57:{ label:"Syscoin", symbol: "SYS", address: UNIVERSAL_TIP_ADDRESS },
  61:{ label:"Ethereum Classic", symbol: "ETC", address: UNIVERSAL_TIP_ADDRESS },
  57073:{ label:"Inkonchain", symbol: "INK", address: UNIVERSAL_TIP_ADDRESS },
  60808:{ label:"BOB", symbol: "ETH", address: UNIVERSAL_TIP_ADDRESS },
  81457:{ label:"Blast", symbol: "ETH", address: UNIVERSAL_TIP_ADDRESS },
  1868:{ label:"Soneium", symbol: "ETH", address: UNIVERSAL_TIP_ADDRESS },
  480:{ label:"Worldchain", symbol: "ETH", address: UNIVERSAL_TIP_ADDRESS },
  1135:{ label:"Lisk", symbol: "ETH", address: UNIVERSAL_TIP_ADDRESS },
  1923:{ label:"Swellchain", symbol: "ETH", address: UNIVERSAL_TIP_ADDRESS },
  2741:{ label:"Abstract", symbol: "ETH", address: UNIVERSAL_TIP_ADDRESS },
  747474:{ label:"Katana", symbol: "ETH", address: UNIVERSAL_TIP_ADDRESS },
  146:{ label:"Sonic", symbol: "S", address: UNIVERSAL_TIP_ADDRESS },
};

export const TIP_DEFAULT_CHAIN_ID = 1;

// suggested native-amount presets
export const TIP_SUGGESTED_AMOUNTS = ['0.0005', '0.0015', '0.005'];