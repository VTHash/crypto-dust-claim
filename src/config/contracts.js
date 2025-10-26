// ---- Load ABIs (JSON) ----
// Keep these files in: src/config/contracts/
import commonAbi from './contracts/dustclaim.common.json'
import ethAbi from './contracts/dustclaim.eth.json'
import bnbAbi from './contracts/dustclaim.bnb.json'
import avaxAbi from './contracts/dustclaim.avax.json'
import arbAbi from './contracts/dustclaim.arb.json'
import polygonAbi from './contracts/dustclaim.polygon.json'
import opAbi from './contracts/dustclaim.op.json'

// ---- Back-compat: expose the default ABI the rest of the app expects ----
export const DUSTCLAIM_ABI = commonAbi

// ---- Addresses per chain (public – fine to keep in repo) ----
export const DUSTCLAIM_ADDRESS = {
  1: "0x73f2Ef769b3Dc5c84390347b05cc1D89dD9644f", // Ethereum ✅
  10: "0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46", // OP Mainnet
  56: "0x8794D4CD9b641eD623235ca418640e10E4d75D6F", // BNB Smart Chain
  100: "", // Gnosis
  137: "0xf977f21430b99aE91680aC2e0fFD8cA481ec486F", // Polygon PoS
  195: "", // X1
  250: "", // Fantom
  1329: "", // Sei
  8453: "0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46", // Base
  34443: "", // Mode
  42161: "0xd7aC005D908Cbf7A9692478c4DEef2525CA2A2fE", // Arbitrum One
  43114: "0xA10980211Cda7228708e774ef11c7E299E6947dB", // Avalanche C
  59144: "", // Linea
  80094: "", // Berachain (matches your SUPPORTED_CHAINS)
  7777777: "" // Zora
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