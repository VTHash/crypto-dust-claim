// Per-chain execution config for swaps/claims.
// - `weth`: the WRAPPED *native* token of that chain (ERC-20 form used for swaps).
// - `oneInchRouter`: 1inch v5 router where supported; else null.
// - `uniswapV3Router`: Uniswap v3/Universal Router (or compatible) where present; else null.

export const DEPLOYMENTS = {
  1: {
    chainId: 1,
    name: 'Ethereum',
    dustclaim: '0x73f2Ef769b3Dc5c84390347b05cc1D89dD9644f',
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH9
    oneInchRouter: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    uniswapV3Router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
  },

  10: {
    chainId: 10,
    name: 'Optimism',
    dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
    weth: '0x4200000000000000000000000000000000000006', // canonical WETH
    oneInchRouter: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    uniswapV3Router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
  },

  56: {
    chainId: 56,
    name: 'BNB Smart Chain',
    dustclaim: '0x8794ADCD9b641eD623235cA418640e10E4d75D6F',
    weth: '0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
    oneInchRouter: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    uniswapV3Router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45' // Uni v3 on BSC
  },

  100: {
    chainId: 100,
    name: 'Gnosis',
    dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
    weth: '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d', // WXDAI (wrapped native)
    oneInchRouter: '0x1111111254EEB25477B68fb85Ed929f73A960582', // supported
    uniswapV3Router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45' // present on Gnosis
  },

  137: {
    chainId: 137,
    name: 'Polygon PoS',
    dustclaim: '0xf97f7f21430b99aE91680aC2e0fFD8cA481eC486F',
    weth: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC (wrapped native)
    oneInchRouter: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    uniswapV3Router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
  },

  42161: {
    chainId: 42161,
    name: 'Arbitrum One',
    dustclaim: '0xd7aC005D908cbf7A9692478c4DEef2525CAA2AfE',
    weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
    oneInchRouter: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    uniswapV3Router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
  },

  8453: {
    chainId: 8453,
    name: 'Base',
    dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
    weth: '0x4200000000000000000000000000000000000006', // WETH
    oneInchRouter: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    uniswapV3Router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
  },

  43114: {
    chainId: 43114,
    name: 'Avalanche C-Chain',
    dustclaim: '0xA10980211Cda7228708e774e1f1c7E299E6947dB',
    weth: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', // WAVAX
    oneInchRouter: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    uniswapV3Router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
  },

  59144: {
    chainId: 59144,
    name: 'Linea',
    dustclaim: '0xEB4931BE941D88304252001Ba7206e8E438534795',
    weth: '0xE5D7C2a44FfDDf6b295A15c148167daaAf5Cf34F', // WETH on Linea
    oneInchRouter: '0x1111111254EEB25477B68fb85Ed929f73A960582', // ✅ you said 1inch path works
    uniswapV3Router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'
  },

  34443: {
    chainId: 34443,
    name: 'Mode',
    dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
    weth: '0x4200000000000000000000000000000000000006', // WETH
    oneInchRouter: null, // not supported yet
    uniswapV3Router: null // add when an official router is live
  },

  1329: {
    chainId: 1329,
    name: 'Sei Network',
    dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
    weth: '0xE30FeDd158A2e3b1e39EbaeABaFc5516e95e98C7', // WSEI
    oneInchRouter: null,
    uniswapV3Router: null
  },

  250: {
    chainId: 250,
    name: 'Fantom Opera',
    dustclaim: '0xe6292481711419e6035b8Ac263Fd91AF48142966',
    weth: '0x21be370D5312f44cb42ce377BC9b8a0cef1A4C83', // WFTM
    oneInchRouter: null, // keep null unless you confirm 1inch v5 is active
    uniswapV3Router: null // fill if you integrate a Fantom router
  },

  7777777: {
    chainId: 7777777,
    name: 'Zora',
    dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
    weth: '0x4200000000000000000000000000000000000006', // WETH
    oneInchRouter: null,
    uniswapV3Router: '0x7De04c96BE5159c3b5CeffC82aa176dc81281557'
  },

  80094: {
    chainId: 80094,
    name: 'Berachain',
    dustclaim: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46',
    weth: '0x6969696969696969696969696969696969696969', // WBERA (update if mainnet diff)
    oneInchRouter: null,
    uniswapV3Router: null
  },

  195: {
    chainId: 195,
    name: 'X1',
    dustclaim: '',
    weth: '0x4200000000000000000000000000000000000006', // WETH
    oneInchRouter: null,
    uniswapV3Router: null
  }
}

export function getDeployment(chainId) {
  return DEPLOYMENTS[Number(chainId)] || null
}