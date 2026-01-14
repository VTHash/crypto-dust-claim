// ---- Load ABIs (JSON) ----
// Keep these files in: src/config/contracts/
import commonAbi from './contracts/dustclaim.common.json'
import ethAbi from './contracts/dustclaim.eth.json'
import lineaAbi from './contracts/dustclaim.linea.json'

// ---- Back-compat: default ABI the rest of the app expects ----
export const DUSTCLAIM_ABI = commonAbi

// ---- Per-chain ABI overrides (only where contract differs) ----
const ABI_OVERRIDES = {
  // Only keep ethAbi here if Ethereum contract really differs from common
  // 1: ethAbi,

  // Linea: NEW contract with renounceOwnership
  59144: lineaAbi,
}

// ---- Addresses per chain ----
export const DUSTCLAIM_ADDRESS = {
  1: "0xa87B722979D3c2D381A225E224427498455d535e", // Ethereum
  10: "0xEB4931BE941D830425420D1Ba7206e8E43854795", // OP
  56: "0xfD5a5Fcd2e93DE5D747776BFDAd7F1A612C21941", // BSC
  100: "0x7692fDf5bbcA49ACE485D31B760e8A082d193D3d", // Gnosis
  137: "0x3D3Aa75dECBf2Baf919aec818514c02528167Bec", // Polygon
  250: "0xe6292481711419e6035b8Ac263Fd91AF48142966", // Fantom
  1329: "0x7692fDf5bbcA49ACE485D31B760e8A082d193D3d", // Sei
  8453: "0xBfc253Ffc3fDD5533D91937f062bf0CD7d4A1551", // Base
  34443: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Mode
  42161: "0xbAa92DFD8DEf1c6dC3259f9f7D0019284B00909d", // Arbitrum One
  43114: "0xe41a31664DaCf9cE696545Cf770e7F6662CF61fd", // Avalanche
  59144: "0x3Cef985383FE054Bb43152480484fA28fC942A06", // Linea (new contract)
  // ...keep the rest of your mapping as-is...
}

// ---- Helpers ----
export function getAddressForChain(chainId) {
  return DUSTCLAIM_ADDRESS[Number(chainId)] || null
}

export function getAbiForChain(chainId) {
  const id = Number(chainId)
  return ABI_OVERRIDES[id] || commonAbi
}

export function getContractConfig(chainId) {
  const id = Number(chainId)
  return {
    address: DUSTCLAIM_ADDRESS[id] || null,
    abi: getAbiForChain(id),
  }
}
