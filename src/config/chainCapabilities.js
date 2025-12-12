// src/config/chainCapabilities.js
// 0x-only routing support flags

export const CHAIN_CAPS = {
  1: { directSwap: true, uniV3Path: false }, // Ethereum
  10: { directSwap: true, uniV3Path: false }, // Optimism
  56: { directSwap: true, uniV3Path: false }, // BSC
  130: { directSwap: true, uniV3Path: false }, // Unichain
  137: { directSwap: true, uniV3Path: false }, // Polygon
  143: { directSwap: true, uniV3Path: false }, // Monad
  146: { directSwap: true, uniV3Path: false }, // Sonic
  480: { directSwap: true, uniV3Path: false }, // World Chain
  5000: { directSwap: true, uniV3Path: false }, // Mantle
  9745: { directSwap: true, uniV3Path: false }, // Plasma
  42161: { directSwap: true, uniV3Path: false }, // Arbitrum
  43114: { directSwap: true, uniV3Path: false }, // Avalanche
  534352: { directSwap: true, uniV3Path: false }, // Scroll
  59144: { directSwap: true, uniV3Path: false }, // Linea
  80094: { directSwap: true, uniV3Path: false }, // Berachain
  81457: { directSwap: true, uniV3Path: false }, // Blast
  34443: { directSwap: true, uniV3Path: false }, // Mode
  8453: { directSwap: true, uniV3Path: false }, // Base
  57073: { directSwap: true, uniV3Path: false }, // Ink
}

// Optional helpers (non-breaking)
export const canDirectSwap = (chainId) =>
  !!(CHAIN_CAPS[Number(chainId)] && CHAIN_CAPS[Number(chainId)].directSwap)

export const hasUniV3Path = (chainId) =>
  !!(CHAIN_CAPS[Number(chainId)] && CHAIN_CAPS[Number(chainId)].uniV3Path)