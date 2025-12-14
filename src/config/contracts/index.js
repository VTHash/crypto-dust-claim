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
    address: '0xa87B722979D3c2D381A225E224427498455d535e', // ✅ verified
    abi: commonAbi
  },
  10: {
    key: 'optimism',
    name: 'OP Mainnet',
    address: '0xEB4931BE941D830425420D1Ba7206e8E43854795',
    abi: commonAbi
  },
  8453: {
    key: 'base',
    name: 'Base',
    address: '0xBfc253Ffc3fDD5533D91937f062bf0CD7d4A1551',
    abi: commonAbi
  },
  42161: {
    key: 'arbitrum',
    name: 'Arbitrum One',
    address: '0x003031Aef54ED627Cf7b9783802C86BBB05d1e72',
    abi: commonAbi
  },
  137: {
    key: 'polygon',
    name: 'Polygon PoS',
    address: '0x6f04783806684760f841b981d1823b46584200D8',
    abi: commonAbi
  },
  56: {
    key: 'bsc',
    name: 'BNB Smart Chain',
    address: '0xC9b01707cE50803783ECcD0A995233Ab3052Fd1A',
    abi: commonAbi
  },
  43114: {
    key: 'avalanche',
    name: 'Avalanche C-Chain',
    address: '0xe41a31664DaCf9cE696545Cf770e7F6662CF61fd',
    abi: commonAbi
  },
  100: {
    key: 'gnosis',
    name: 'Gnosis',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },
  250: {
    key: 'fantom',
    name: 'Fantom',
    address: '0xe6292481711419e6035b8Ac263Fd91AF48142966',
    abi: commonAbi
  },
  59144: {
    key: 'linea',
    name: 'Linea',
    address: '0xBB45cc85B5e6505Ad1C8403227Da68ba0F13357B',
    abi: commonAbi
  },
  7777777: {
    key: 'zora',
    name: 'Zora',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },
  34443: {
    key: 'mode',
    name: 'Mode',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },
  1329: {
    key: 'sei',
    name: 'Sei Network',
    address: '0x7692fDf5bbcA49ACE485D31B760e8A082d193D3d',
    abi: commonAbi
  },
  80094: {
    key: 'berachain',
    name: 'Berachain',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },

  130: {
    key: 'unichain',
    name: 'Unichain',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },
  324: {
    key: 'zksync',
    name: 'ZKsync',
    address: '0x7692fDf5bbcA49ACE485D31B760e8A082d193D3d',
    abi: commonAbi
  },

  5000: {
    key: 'mantle',
    name: 'Mantle',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },
  9745: {
    key: 'plasma',
    name: 'Plasma',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },
  57073: {
    key: 'inkonchain',
    name: 'Inkonchain',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },
  81457: {
    key: 'blast',
    name: 'Blast',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },
  480: {
    key: 'worldcoin',
    name: 'Worldcoin',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },
  42220: {
    key: 'celo',
    name: 'Celo',
    address: '0x7692fDf5bbcA49ACE485D31B760e8A082d193D3d',
    abi: commonAbi
  },
  1313161554: {
    key: 'aurora',
    name: 'Aurora',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },  1284: {
    key: 'moonbeam',
    name: 'Moonbeam',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },
  1285: {
    key: 'moonriver',
    name: 'Moonriver',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },
  9745: {
    key: 'plasma',
    name: 'Plasma',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },  
  14: {
    key: 'flare',
    name: 'Flare',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },
  40: {
    key: 'telos',
    name: 'Telos',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },
  57: {
    key: 'syscoin',
    name: 'Syscoin',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },
  61: {
    key: 'etc',
    name: 'Ethereum Classic',
    address: '0x7692fDf5bbcA49ACE485D31B760e8A082d193D3d',
    abi: commonAbi
  },  
  122: {
    key: 'fuse',
    name: 'Fuse',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },
  60808: {
    key: 'bob',
    name: 'Bob',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },
 1868: {
    key: 'soneium',
    name: 'Soneium',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },
 1135: {
    key: 'lisk',
    name: 'Lisk',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },
 1923: {
    key: 'swellchain',
    name: 'Swellchain',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },
 2741: {
    key: 'abstract',
    name: 'Abstract',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },
 747474: {
    key: 'katana',
    name: 'Katana',
    address: '0x7692fDf5bbcA49ACE485D31B760e8A082d193D3d',
    abi: commonAbi
  },
 146: {
    key: 'sonic',
    name: 'Sonic',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },
 534352: {
    key: 'scroll',
    name: 'Scroll',
    address: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc',
    abi: commonAbi
  },
  // ---- You can add more chains here if needed ---- 

  // ---- Add more chains as needed ----  
 
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