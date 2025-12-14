// ---- Load ABIs (JSON) ----
// Keep these files in: src/config/contracts/
import commonAbi from './contracts/dustclaim.common.json'
import ethAbi from './contracts/dustclaim.eth.json'


// ---- Back-compat: expose the default ABI the rest of the app expects ----
export const DUSTCLAIM_ABI = commonAbi

// ---- Addresses per chain (public – fine to keep in repo) ----
export const DUSTCLAIM_ADDRESS = {
  1: "0xa87B722979D3c2D381A225E224427498455d535e", // Ethereum ✅
  10: "0xEB4931BE941D830425420D1Ba7206e8E43854795", // OP Mainnet
  56: "0xC9b01707cE50803783ECcD0A995233Ab3052Fd1A", // BNB Smart Chain
  100: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Gnosis
  137: "0x6f04783806684760f841b981d1823b46584200D8", // Polygon PoS
  195: "", // X1
  250: "0xe6292481711419e6035b8Ac263Fd91AF48142966", // Fantom
  1329: "0x7692fDf5bbcA49ACE485D31B760e8A082d193D3d", // Sei
  8453: "0xBfc253Ffc3fDD5533D91937f062bf0CD7d4A1551", // Base
  34443: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Mode
  42161: "0x003031Aef54ED627Cf7b9783802C86BBB05d1e72", // Arbitrum One
  43114: "0xe41a31664DaCf9cE696545Cf770e7F6662CF61fd", // Avalanche C
  59144: "0xBB45cc85B5e6505Ad1C8403227Da68ba0F13357B", // Linea
  80094: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Berachain (matches your SUPPORTED_CHAINS)
  7777777: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Zora
  130: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Unichain
  42220: "0x7692fDf5bbcA49ACE485D31B760e8A082d193D3d", // Celo
  1313161554: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Aurora
  1284: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Moonbeam
  1285: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Moonriver
  5000: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Mantle
  9745: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Plasma
  14: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Flare
  40: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Telos
  57: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Syscoin
  61: "0x7692fDf5bbcA49ACE485D31B760e8A082d193D3d", // ETC
  57073: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Inkonchain
  122: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Fuse
  60808: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Bob
  81457:  "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Blast
 1868:  "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Soneium
 480:  "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Worldcoin
 1135:  "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Lisk
 1923: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Swellchain
 2741: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Abstract
 747474: "0x7692fDf5bbcA49ACE485D31B760e8A082d193D3d", // Katana
 146: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Sonic
 534352: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Scroll
  324: "0x7692fDf5bbcA49ACE485D31B760e8A082d193D3d", // ZKsync
  167000: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46', // Taiko
  42170: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc', // Arbitrum Nova
  28185: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc', // Morph
  
}

// ---- Optional: per-chain ABI overrides (only add if different from common) ----


// ---- Helpers ----
export function getAddressForChain(chainId) {
  return DUSTCLAIM_ADDRESS[Number(chainId)] || null
}

export function getContractConfig(chainId) {
  const id = Number(chainId)
  return {
    address: DUSTCLAIM_ADDRESS[id] || null,
    abi: commonAbi
  }
}