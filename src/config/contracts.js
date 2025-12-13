// ---- Load ABIs (JSON) ----
// Keep these files in: src/config/contracts/
import commonAbi from './contracts/dustclaim.common.json'
import ethAbi from './contracts/dustclaim.eth.json'
import bnbAbi from './contracts/dustclaim.bnb.json'
import avaxAbi from './contracts/dustclaim.avax.json'
import arbAbi from './contracts/dustclaim.arb.json'
import polygonAbi from './contracts/dustclaim.polygon.json'
import opAbi from './contracts/dustclaim.op.json'
import seiAbi from './contracts/dustclaim.sei.json'
import modeAbi from './contracts/dustclaim.mode.json'
import gnosisAbi from './contracts/dustclaim.gnosis.json'
import lineaAbi from './contracts/dustclaim.linea.json'
import zoraAbi from './contracts/dustclaim.zora.json'
import beraAbi from './contracts/dustclaim.bera.json'
import fantomAbi from './contracts/dustclaim.fantom.json'
import unichainAbi from './contracts/dustclaim.unichain.json'
import celoAbi from './contracts/dustclaim.celo.json'
import auroraAbi from './contracts/dustclaim.aurora.json'

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
  5000: "0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46", // Mantle
  9745: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Plasma
  14: "0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46", // Flare
  40: "0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46", // Telos
  57: "0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46", // Syscoin
  61: "0x7692fDf5bbcA49ACE485D31B760e8A082d193D3d", // ETC
  57073: "0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46", // Inkonchain
  122: "0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46", // Fuse
  60808: "0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46", // Bob
  81457:  "0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46", // Blast
 1868:  "0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46", // Soneium
 480:  "0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46", // Worldcoin
 1135:  "0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46", // Lisk
 1923: "0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46", // Swellchain
 2741: "0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46", // Abstract
 747474: "0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46", // Katana
 146: "0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46", // Sonic
 534352: "0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46", // Scroll
}

// ---- Optional: per-chain ABI overrides (only add if different from common) ----
export const DUSTCLAIM_ABI_BY_CHAIN = {
  1: ethAbi
  // e.g. 137: polygonAbi, 42161: arbitrumAbi, ... later if needed
}

// ---- Helpers ----
export function getAddressForChain(chainId) {
  return DUSTCLAIM_ADDRESS[Number(chainId)] || null
}

export function getContractConfig(chainId) {
  const id = Number(chainId)
  return {
    address: DUSTCLAIM_ADDRESS[id] || null,
    abi: DUSTCLAIM_ABI_BY_CHAIN[id] || commonAbi
  }
}