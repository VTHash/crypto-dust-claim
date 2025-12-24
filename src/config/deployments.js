// src/config/deployments.js
import DUSTCLAIM_V3_ABI from './contracts/dustclaim.common.json'
import { SUPPORTED_CHAINS } from './walletConnectConfig'

// 0x Swap API hosts per chain (19 supported chains)
export const ZEROX_HOST_BY_CHAIN = {
  1: 'https://api.0x.org', // Ethereum

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

//  DustClaimV3 contract + wrapped native per chain.
// For chains not supported by 0x, keep zeroXHost=null automatically (below).
export const DUSTCLAIM_V3_BY_CHAIN = {
  1: {
    dustClaimV3: '0xa87B722979D3c2D381A225E224427498455d535e',
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  },
  10: {
    dustClaimV3: '0xEB4931BE941D830425420D1Ba7206e8E43854795',
    weth: '0x4200000000000000000000000000000000000006',
  },
  56: {
    dustClaimV3: '0xfD5a5Fcd2e93DE5D747776BFDAd7F1A612C21941',
    wbnb: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  },
  100: {
    dustClaimV3: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    weth: '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d',
  },
  130: {
    dustClaimV3: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    weth: '0x4200000000000000000000000000000000000006',
  },
  137: {
    dustClaimV3: '0x3D3Aa75dECBf2Baf919aec818514c02528167Bec',
    wpol: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
  },
  250: {
    dustClaimV3: '0xe6292481711419e6035b8Ac263Fd91AF48142966',
    weth: '0x21be370D5312F44cB42ce377BC9b8a0CeF1A4c83',
  },
  1329: {
    dustClaimV3: '0x7692fDf5bbcA49ACE485D31B760e8A082d193D3d',
    weth: '0xE30FeDd158A2e3b1e39EbaeABaFc5516e95e98C7',
  },
  8453: {
    dustClaimV3: '0xBfc253Ffc3fDD5533D91937f062bf0CD7d4A1551',
    weth: '0x4200000000000000000000000000000000000006',
  },
  34443: {
    dustClaimV3: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    weth: '0x4200000000000000000000000000000000000006',
  },
  42161: {
    dustClaimV3: '0xbAa92DFD8DEf1c6dC3259f9f7D0019284B00909d',
    weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  },
  43114: {
    dustClaimV3: '0xe41a31664DaCf9cE696545Cf770e7F6662CF61fd',
    weth: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
  },
  5000: {
    dustClaimV3: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    weth: '0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000',
  },
  59144: {
    dustClaimV3: '0xBB45cc85B5e6505Ad1C8403227Da68ba0F13357B',
    weth: '0xE5D7C2a44FfDDf6b295A15c148167daaAf5Cf34F',
  },
  80094: {
    dustClaimV3: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    weth: '0x6969696969696969696969696969696969696969',
  },
  81457: {
    dustClaimV3: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    weth: '0x4300000000000000000000000000000000000004',
  },
  9745: {
    dustClaimV3: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    weth: '0x4200000000000000000000000000000000000006',
  },
  57073: {
    dustClaimV3: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    weth: '0x4200000000000000000000000000000000000006',
  },
  480: {
    dustClaimV3: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    weth: '0x4200000000000000000000000000000000000006',
  },
  146: {
    dustClaimV3: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    weth: '0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38', // Sonic wS
  },
  534352: {
    dustClaimV3: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    weth: '0x4200000000000000000000000000000000000006',
  },
}

export { DUSTCLAIM_V3_ABI }

// One unified deployments object (what the app should read)
export const DEPLOYMENTS = Object.keys(SUPPORTED_CHAINS).reduce((acc, rawId) => {
  const chainId = Number(rawId)
  const meta = SUPPORTED_CHAINS?.[chainId] || {}

  const v3 = DUSTCLAIM_V3_BY_CHAIN?.[chainId] || {}
  const zeroXHost = ZEROX_HOST_BY_CHAIN?.[chainId] || null

  acc[chainId] = {
    chainId,
    name: meta.name || v3.name || 'Unknown',

    // contract + weth
    dustClaimV3: v3.dustClaimV3 || null,
    weth: v3.weth || null,

    // 0x-only routing for now
    zeroXHost,
    directSwap0x: !!zeroXHost,

    // keep these null so old code won't accidentally use them
    oneInchRouter: null,
    uniswapV3Router: null,
  }

  return acc
}, {})

export const getDeployment = (chainId) => DEPLOYMENTS[Number(chainId)] || null
export const is0xSupported = (chainId) => !!DEPLOYMENTS[Number(chainId)]?.directSwap0x