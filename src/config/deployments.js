// Per-chain execution config for swaps/claims.
// - `weth`: the WRAPPED *native* token of that chain (ERC-20 form used for swaps).
// - `oneInchRouter`: 1inch v5 router where supported; else null.
// - `uniswapV3Router`: Uniswap v3/Universal Router (or compatible) where present; else null.

export const DEPLOYMENTS = {
  1: {
    chainId: 1,
    name: 'Ethereum',
    dustclaim: '0x73f2Ef769b3Dc5c84390347b05cc1D89dD9644f',
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    oneInchRouter: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    uniswapV3Router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
  },

  10: {
    chainId: 10,
    name: 'Optimism',
    dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
    weth: '0x4200000000000000000000000000000000000006',
    oneInchRouter: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    uniswapV3Router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
  },

  56: {
    chainId: 56,
    name: 'BNB Smart Chain',
    dustclaim: '0x8794D4CD9b641eD623235ca418640e10E4d75D6F',
    weth: '0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    oneInchRouter: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    uniswapV3Router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
  },

  100: {
    chainId: 100,
    name: 'Gnosis',
    dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
    weth: '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d',
    oneInchRouter: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    uniswapV3Router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
  },

  130: {
    chainId: 130,
    name: 'Unichain',
    dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
    weth: '0x4200000000000000000000000000000000000006',
    oneInchRouter: null,
    uniswapV3Router: null
  },

  137: {
    chainId: 137,
    name: 'Polygon PoS',
    dustclaim: '0xf977f21430b99aE91680aC2e0fFD8cA481ec486F',
    weth: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    oneInchRouter: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    uniswapV3Router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
  },

  195: {
    chainId: 195,
    name: 'X1',
    dustclaim: '',
    weth: '0x4200000000000000000000000000000000000006',
    oneInchRouter: null,
    uniswapV3Router: null
  },

  250: {
    chainId: 250,
    name: 'Fantom Opera',
    dustclaim: '0xe6292481711419e6035b8Ac263Fd91AF48142966',
    weth: '0x21be370D5312f44cb42ce377BC9b8a0cef1A4C83',
    oneInchRouter: null,
    uniswapV3Router: null
  },

  1284: {
    chainId: 1284,
    name: 'Moonbeam',
    dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
    weth: '0xAcc15dC74880C9944775448304B263D191c6077F',
    oneInchRouter: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    uniswapV3Router: null
  },

  1285: {
    chainId: 1285,
    name: 'Moonriver',
    dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
    weth: '0x98878B06940aE243284CA214f92Bb71a2b032B8A',
    oneInchRouter: null,
    uniswapV3Router: null
  },

  1329: {
    chainId: 1329,
    name: 'Sei Network',
    dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
    weth: '0xE30FeDd158A2e3b1e39EbaeABaFc5516e95e98C7',
    oneInchRouter: null,
    uniswapV3Router: null
  },

  42220: {
    chainId: 42220,
    name: 'Celo',
    dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
    weth: '0x471EcE3750Da237f93B8E339c536989b8978a438',
    oneInchRouter: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    uniswapV3Router: null
  },

  42161: {
    chainId: 42161,
    name: 'Arbitrum One',
    dustclaim: '0xd7aC005D908Cbf7A9692478c4DEef2525CA2A2fE',
    weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    oneInchRouter: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    uniswapV3Router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
  },

  43114: {
    chainId: 43114,
    name: 'Avalanche C-Chain',
    dustclaim: '0xA10980211Cda7228708e774ef11c7E299E6947dB',
    weth: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    oneInchRouter: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    uniswapV3Router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
  },

  5000: {
    chainId: 5000,
    name: 'Mantle',
    dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
    weth: '0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000',
    oneInchRouter: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    uniswapV3Router: null
  },

  59144: {
    chainId: 59144,
    name: 'Linea',
    dustclaim: '0xEB4931BE941D830425420D1Ba7206e8E43854795',
    weth: '0xE5D7C2a44FfDDf6b295A15c148167daaAf5Cf34F',
    oneInchRouter: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    uniswapV3Router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
  },

  8453: {
    chainId: 8453,
    name: 'Base',
    dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
    weth: '0x4200000000000000000000000000000000000006',
    oneInchRouter: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    uniswapV3Router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
  },

  34443: {
    chainId: 34443,
    name: 'Mode',
    dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
    weth: '0x4200000000000000000000000000000000000006',
    oneInchRouter: null,
    uniswapV3Router: null
  },

  7777777: {
    chainId: 7777777,
    name: 'Zora',
    dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
    weth: '0x4200000000000000000000000000000000000006',
    oneInchRouter: null,
    uniswapV3Router: '0x7De04c96BE5159c3b5CeffC82aa176dc81281557'
  },

  80094: {
    chainId: 80094,
    name: 'Berachain',
    dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
    weth: '0x6969696969696969696969696969696969696969',
    oneInchRouter: null,
    uniswapV3Router: null
  },

  9745: {
    chainId: 9745,
    name: 'Plasma',
    dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
    weth: '0x4200000000000000000000000000000000000006',
    oneInchRouter: null,
    uniswapV3Router: null
  },

  1313161554: {
    chainId: 1313161554,
    name: 'Aurora',
    dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
    weth: '0xC9BdeEd33CD01541e1eeD10f90519d2C06Fe3feB',
    oneInchRouter: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    uniswapV3Router: null
  },

  14: {
  chainId: 14,
  name: 'Flare',
  dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46', // placeholder per your pattern
  weth: '0x1D80c49bBbCd1c0911346656B529dF9E5c2F783d', // WFLR (native wrapper)
  oneInchRouter: '0x0000000000000000000000000000000000000000', 
  uniswapV3Router: '0x8a1E35F5c98C4E85B36B7B253222eE17773b2781' // Flare v3 router
},




40: {
  chainId: 40,
  name: 'Telos',
  dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
  weth: '0xB6C53431608E626AC81a9776ac3e999c5556717c', // WTLOS
  oneInchRouter: null, // 1inch not on Telos
  uniswapV3Router: null // no Uniswap v3
},


57: {
  chainId: 57,
  name: 'Syscoin',
  dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
  weth: '0x27fE1F0aBdDFD2AAdb2411AF6B4070bC9B655F6A', // WSYS wrapped native
  oneInchRouter: null, // 1inch not deployed
  uniswapV3Router: null // no Uni v3 router
},


50: {
  chainId: 50,
  name: 'XDC Network',
  dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
  weth: '0xE7C9C6dc2A1FDB7B70950f0bA27be11Cbb9dBa1D', // WXDC
  oneInchRouter: null, // not supported on XDC
  uniswapV3Router: null // no Uni v3 deployment
},

61: {
  chainId: 61,
  name: "Ethereum Classic",
  dustclaim: "0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46",
  weth: "0x82A618305706B14e7bcf2592D4B9324A366b6dAd", // WETC
  oneInchRouter: "0x0000000000000000000000000000000000000000", // no 1inch
  uniswapV3Router: null // no Uni v2/v3
},

57073: {
  chainId: 57073,
  name: "Inkonchain",
  dustclaim: "0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46",
  weth: "0x4200000000000000000000000000000000000006", // WETH on Ink
  oneInchRouter: "0x0000000000000000000000000000000000000000", // no 1inch on Ink
  uniswapV3Router: "0x177778F19E89dD1012BdBe603F144088A95C4B53" // SwapRouter02 (exactInputSingle)
},

122: {
  chainId: 122,
  name: "Fuse Network",
  dustclaim: "0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46",
  weth: "0x5622F6dC93e08a8b717B149677930C38d5d50682", // WFUSE
  oneInchRouter: "0x0000000000000000000000000000000000000000", // no 1inch
  uniswapV3Router: "0x0000000000000000000000000000000000000000" // no Uni v2/v3
},

60808: {
  chainId: 60808,
  name: "BOB Mainnet",
  dustclaim: "0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46",
  weth: "0x4200000000000000000000000000000000000006", // wrapped native 
  oneInchRouter: "0x0000000000000000000000000000000000000000", // assume none for now
  uniswapV3Router: null // assume none for now
},

81457: {
  chainId: 81457,
  name: "Blast Mainnet",
  dustclaim: "0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46",
  weth:"0x4300000000000000000000000000000000000004",
  oneInchRouter: "0x0000000000000000000000000000000000000000", // not yet confirmed
  uniswapV3Router: null // not yet confirmed
},

  }


export function getDeployment(chainId) {
  return DEPLOYMENTS[Number(chainId)] || null
}