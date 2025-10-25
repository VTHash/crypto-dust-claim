import commonAbi from './dustclaim.common.json'

// If a chain needs a custom ABI in the future, add a file and swap import here:
// import polygonAbi from './dustclaim.polygon.json'
// import arbitrumAbi from './dustclaim.arbitrum.json'
// ...etc.

export const DUSTCLAIM_CONTRACTS = {
  // ---- Mainnets & L2s you listed ----
  1: {
    key: 'ethereum',
    name: 'Ethereum Mainnet',
    address: '0x73f2Ef769b3Dc5c84390347b05cc1D89dD9644f', // ✅ verified
    abi: commonAbi
  },
  10: {
    key: 'optimism',
    name: 'OP Mainnet',
    address: '0xYourOptimismAddress',
    abi: commonAbi
  },
  8453: {
    key: 'base',
    name: 'Base',
    address: '0xYourBaseAddress',
    abi: commonAbi
  },
  42161: {
    key: 'arbitrum',
    name: 'Arbitrum One',
    address: '0xYourArbitrumAddress',
    abi: commonAbi
  },
  137: {
    key: 'polygon',
    name: 'Polygon PoS',
    address: '0xYourPolygonAddress',
    abi: commonAbi
  },
  56: {
    key: 'bsc',
    name: 'BNB Smart Chain',
    address: '0xYourBnbAddress',
    abi: commonAbi
  },
  43114: {
    key: 'avalanche',
    name: 'Avalanche C-Chain',
    address: '0xYourAvalancheAddress',
    abi: commonAbi
  },
  100: {
    key: 'gnosis',
    name: 'Gnosis',
    address: '0xYourGnosisAddress',
    abi: commonAbi
  },
  250: {
    key: 'fantom',
    name: 'Fantom',
    address: '0xYourFantomAddress',
    abi: commonAbi
  },
  59144: {
    key: 'linea',
    name: 'Linea',
    address: '0xYourLineaAddress',
    abi: commonAbi
  },
  7777777: {
    key: 'zora',
    name: 'Zora',
    address: '0xYourZoraAddress',
    abi: commonAbi
  },
  34443: {
    key: 'mode',
    name: 'Mode',
    address: '0xYourModeAddress',
    abi: commonAbi
  },
  1329: {
    key: 'sei',
    name: 'Sei Network',
    address: '0xYourSeiAddress',
    abi: commonAbi
  },
  80094: {
    key: 'berachain',
    name: 'Berachain',
    address: '0xYourBerachainAddress',
    abi: commonAbi
  },
  195: {
    key: 'x1',
    name: 'X1',
    address: '0xYourX1Address',
    abi: commonAbi
  }
}

// Helper
export function getContractConfig(chainId) {
  const cfg = DUSTCLAIM_CONTRACTS[Number(chainId)]
  if (!cfg || !cfg.address) {
    throw new Error(`DustClaim not configured for chain ${chainId}`)
  }
  return cfg
}

// Optional: list of supported chain IDs
export const DUSTCLAIM_SUPPORTED_CHAIN_IDS = Object.keys(DUSTCLAIM_CONTRACTS).map(Number)