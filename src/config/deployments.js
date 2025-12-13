import DUSTCLAIM_V3_ABI from './contracts/dustclaim.common.json'
import { SUPPORTED_CHAINS } from './walletConnectConfig'
// Per-chain execution config for swaps/claims.
// - `weth`: the WRAPPED *native* token of that chain (ERC-20 form used for swaps).
export const ZEROX_HOST_BY_CHAIN = {
  1: 'https://api.0x.org',

  10: 'https://optimism.api.0x.org',
  56: 'https://bsc.api.0x.org',
  130: 'https://unichain.api.0x.org',
  137: 'https://polygon.api.0x.org',
  143: 'https://monad.api.0x.org',
  146: 'https://sonic.api.0x.org',
  480: 'https://worldchain.api.0x.org',
  5000: 'https://mantle.api.0x.org',
  9745: 'https://plasma.api.0x.org',

  42161: 'https://arbitrum.api.0x.org',
  43114: 'https://avalanche.api.0x.org',
  534352: 'https://scroll.api.0x.org',
  59144: 'https://linea.api.0x.org',

  80094: 'https://berachain.api.0x.org',
  81457: 'https://blast.api.0x.org',
  34443: 'https://mode.api.0x.org',
  8453: 'https://base.api.0x.org',
  57073: 'https://ink.api.0x.org',
}


export const DUSTCLAIM_V3_BY_CHAIN = {
  1: {
    chainId: 1,
    name: 'Ethereum',
    dustclaim: '0xa87B722979D3c2D381A225E224427498455d535e',
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    zeroXHost: 'https://api.0x.org/',
    support0x: true,
  },

  10: {
    chainId: 10,
    name: 'Optimism',
    dustclaim: '0xEB4931BE941D830425420D1Ba7206e8E43854795',
    weth: '0x4200000000000000000000000000000000000006',
    zeroXHost: 'https://optimism.api.0x.org/',
    support0x: true,
  },

  56: {
    chainId: 56,
    name: 'BNB Smart Chain',
    dustclaim: '0xC9b01707cE50803783ECcD0A995233Ab3052Fd1A',
    weth: '0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    zeroXHost: 'https://bsc.api.0x.org/',
    support0x: true,
  },

  100: {
    chainId: 100,
    name: 'Gnosis',
    dustclaim: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    weth: '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d',
    zeroXHost: null,
    support0x: false,
  },

  130: {
    chainId: 130,
    name: 'Unichain',
    dustclaim: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    weth: '0x4200000000000000000000000000000000000006',
    zeroXHost: 'https://unichain.api.0x.org/',
    support0x: true,
  },

  137: {
    chainId: 137,
    name: 'Polygon PoS',
    dustclaim: '0x6f04783806684760f841b981d1823b46584200D8',
    weth: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    zeroXHost: 'https://polygon.api.0x.org/',
    support0x: true,  
  },


  250: {
    chainId: 250,
    name: 'Fantom Opera',
    dustclaim: '0xe6292481711419e6035b8Ac263Fd91AF48142966',
    weth: '0x21be370D5312f44cb42ce377BC9b8a0cef1A4C83',
    zeroXHost: null,
    support0x: false,
  },

  1284: {
    chainId: 1284,
    name: 'Moonbeam',
    dustclaim: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    weth: '0xAcc15dC74880C9944775448304B263D191c6077F',
    zeroXHost: null,
    support0x: false,
  },

  1285: {
    chainId: 1285,
    name: 'Moonriver',
    dustclaim: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    weth: '0x98878B06940aE243284CA214f92Bb71a2b032B8A',
   zeroXHost: null,
    support0x: false,
  },

  1329: {
    chainId: 1329,
    name: 'Sei Network',
    dustclaim: '0x7692fDf5bbcA49ACE485D31B760e8A082d193D3d',
    weth: '0xE30FeDd158A2e3b1e39EbaeABaFc5516e95e98C7',
    zeroXHost: null,
    support0x: false,
  },

  42220: {
    chainId: 42220,
    name: 'Celo',
    dustclaim: '0x7692fDf5bbcA49ACE485D31B760e8A082d193D3d',
    weth: '0x471EcE3750Da237f93B8E339c536989b8978a438',
    zeroXHost: null,
    support0x: false,
  },

  42161: {
    chainId: 42161,
    name: 'Arbitrum One',
    dustclaim: '0x003031Aef54ED627Cf7b9783802C86BBB05d1e72',
    weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    zeroXHost: 'https://arbitrum.api.0x.org/',
    support0x: true,
  },

  43114: {
    chainId: 43114,
    name: 'Avalanche C-Chain',
    dustclaim: '0xe41a31664DaCf9cE696545Cf770e7F6662CF61fd',
    weth: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    zeroXHost: 'https://avalanche.api.0x.org/',
    support0x: true,
  },

  5000: {
    chainId: 5000,
    name: 'Mantle',
    dustclaim: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    weth: '0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000',
    zeroXHost: 'https://mantle.api.0x.org/',
    support0x: true,
  },

  59144: {
    chainId: 59144,
    name: 'Linea',
    dustclaim: '0xBB45cc85B5e6505Ad1C8403227Da68ba0F13357B',
    weth: '0xE5D7C2a44FfDDf6b295A15c148167daaAf5Cf34F',
    zeroXHost: 'https://linea.api.0x.org/',
    support0x: true,
  },

  8453: {
    chainId: 8453,
    name: 'Base',
    dustclaim: '0xBfc253Ffc3fDD5533D91937f062bf0CD7d4A1551',
    weth: '0x4200000000000000000000000000000000000006',
    zeroXHost: 'https://base.api.0x.org/',
    support0x: true,
  },

  34443: {
    chainId: 34443,
    name: 'Mode',
    dustclaim: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    weth: '0x4200000000000000000000000000000000000006',
    zeroXHost: 'https://mode.api.0x.org/',
    support0x: true,
  },

  7777777: {
    chainId: 7777777,
    name: 'Zora',
    dustclaim: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    weth: '0x4200000000000000000000000000000000000006',
    zeroXHost: null,
    support0x: false,
  },

  80094: {
    chainId: 80094,
    name: 'Berachain',
    dustclaim: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    weth: '0x6969696969696969696969696969696969696969',
    zeroXHost: 'https://berachain.api.0x.org/',
    support0x: true,
  },

  9745: {
    chainId: 9745,
    name: 'Plasma',
    dustclaim: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    weth: '0x4200000000000000000000000000000000000006',
    zeroXHost: 'https://plasma.api.0x.org/',
    support0x: true,
  },

  1313161554: {
    chainId: 1313161554,
    name: 'Aurora',
    dustclaim: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    weth: '0xC9BdeEd33CD01541e1eeD10f90519d2C06Fe3feB',
    zeroXHost: null,
    support0x: false,
  },

  14: {
  chainId: 14,
  name: 'Flare',
  dustclaim: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc', // placeholder per your pattern
  weth: '0x1D80c49bBbCd1c0911346656B529dF9E5c2F783d', // WFLR (native wrapper)
  zeroXHost: null, // 0x not yet supported on Flare
  support0x: false,
},

40: {
  chainId: 40,
  name: 'Telos',
  dustclaim: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
  weth: '0xBAb93B7ad7fE8692A878B95a8e689423437cc500', // WTLOS
  zeroXHost: null,
  support0x: false,
},


57: {
  chainId: 57,
  name: 'Syscoin',
  dustclaim: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
  weth: '0x7C598c96D02398d89FbCb9d41Eab3DF0C16F227D', // WSYS wrapped native
  zeroXHost: null, // 0x not yet supported on Syscoin
  support0x: false,
},


50: {
  chainId: 50,
  name: 'XDC Network',
  dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
  weth: '0xE7C9C6dc2A1FDB7B70950f0bA27be11Cbb9dBa1D', // WXDC
  zeroXHost: null, // 0x not yet supported on XDC
  support0x: false,
},

61: {
  chainId: 61,
  name: "Ethereum Classic",
  dustclaim: "0x7692fDf5bbcA49ACE485D31B760e8A082d193D3d",
  weth: "0x82A618305706B14e7bcf2592D4B9324A366b6dAd", // WETC
  zeroXHost: null, // 0x not yet supported on ETC
  support0x: false,
},

57073: {
  chainId: 57073,
  name: "Inkonchain",
  dustclaim: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc",
  weth: "0x4200000000000000000000000000000000000006", // WETH on Ink
  zeroXHost: 'https://inkonchain.api.0x.org/', // 0x supported on Ink
  support0x: true,
},

122: {
  chainId: 122,
  name: "Fuse Network",
  dustclaim: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc",
  weth: "0xa722c13135930332Eb3d749B2F0906559D2C5b99", // WETH Bridge Token
  zeroXHost: null, // 0x not yet supported on Fuse
  support0x: false,
},

1868: {
  chainId: 1868,
  name: "Soneium",
  dustclaim: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc",
  weth: "0x4200000000000000000000000000000000000006", // WETH (verified by docs) 1
  zeroXHost: null, // 0x not yet supported on Soneium
  support0x: false,
},

60808: {
  chainId: 60808,
  name: "BOB Mainnet",
  dustclaim: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc",
  weth: "0x4200000000000000000000000000000000000006", // wrapped native 
  zeroXHost: null, // 0x not yet supported on BOB
  support0x: false,
},

81457: {
  chainId: 81457,
  name: "Blast Mainnet",
  dustclaim: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc",
  weth:"0x4300000000000000000000000000000000000004",
  zeroXHost: 'https://blast.api.0x.org/', // 0x supported on Blast  
  support0x: true,
},

480: {
  chainId: 480,
  name: "World Chain",
  dustclaim: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc",
  weth: "0x4200000000000000000000000000000000000006",
  zerooXHost: 'https://worldchain.api.0x.org/', // 0x supported on Worldchain
  support0x: true,
},

1135: {
  chainId: 1135,
  name: "Lisk",
  dustclaim: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc",
  weth: "0x4200000000000000000000000000000000000006",
  zeroXHost: null,
  support0x: false,
},

1923: {
  chainId: 1923,
  name: "Swellchain",
  dustclaim: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc",
  weth: "0x4200000000000000000000000000000000000006",
  zeroXHost: null,
  support0x: false,
},

2741: {
  chainId: 2741,
  name: "Abstract",
  dustclaim: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", 
  weth: "0x4200000000000000000000000000000000000006", // ABETH (wrapped native)
  zeroXHost: null,
  support0x: false,
},

747474: {
  chainId: 747474,
  name: "Katana",
  dustclaim: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc",
  weth: "0x4200000000000000000000000000000000000006",
  zeroXHost: null,
  support0x: false,
},

146: {
  chainId: 146,
  name: "Sonic",
  dustclaim: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc",
  // Native wrapper on Sonic (wS), not bridged WETH
  weth: "0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38", // Wrapped S (wS)
  zeroXHoast: 'https://sonic.api.0x.org/', // 0x supported on Sonic
  support0x: true,
},

534352: {
  chainId: 534352,
  name: "Scroll",
  dustclaim: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc",
  weth: "0x4200000000000000000000000000000000000006", // WETH on Scroll
  zeroXHost: 'https://scroll.api.0x.org/', // 0x supported on Scroll
  support0x: true,
}

  }


export const DUSTCLAIM_V3_ABI = DUSTCLAIM_V3_ABI

// One unified deployments object (what the app should read)
export const DEPLOYMENTS = Object.keys(SUPPORTED_CHAINS).reduce((acc, rawId) => {
  const chainId = Number(rawId)
  const meta = SUPPORTED_CHAINS[chainId] || {}

  const dustClaimV3 = DUSTCLAIM_V3_BY_CHAIN[chainId] || ''
  const zeroXHost = ZEROX_HOST_BY_CHAIN[chainId] || null

  acc[chainId] = {
    chainId,
    name: meta.name || 'Unknown',
    dustClaimV3: dustClaimV3 || null,

    // 0x-only routing for now:
    zeroXHost, // null if unsupported by 0x
    directSwap0x: !!zeroXHost, // convenience boolean

    // legacy fields kept but null (so nothing breaks if something reads them)
    oneInchRouter: null,
    uniswapV3Router: null,
  }

  return acc
}, {})

export const getDeployment = (chainId) => DEPLOYMENTS[Number(chainId)] || null
export const is0xSupported = (chainId) => !!ZEROX_HOST_BY_CHAIN[Number(chainId)]