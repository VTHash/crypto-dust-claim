// If at least one aggregator route is reliably available, set directSwap:true.
// uniV3Path is specifically for your Uniswap V3 single-path button.

export const CHAIN_CAPS = {
  1: { directSwap: true, uniV3Path: true }, // Ethereum
  10: { directSwap: true, uniV3Path: true }, // Optimism
  56: { directSwap: true, uniV3Path: true }, // BNB (keep uniV3 off unless you wire it)
  137: { directSwap: true, uniV3Path: true }, // Polygon
  42161: { directSwap: true, uniV3Path: true }, // Arbitrum
  8453: { directSwap: true, uniV3Path: true }, // Base
  43114: { directSwap: true, uniV3Path: true }, // Avalanche

  100: { directSwap: true, uniV3Path: true }, // Gnosis (conservative)
  250: { directSwap: true, uniV3Path: true }, // Fantom
  59144: { directSwap: true, uniV3Path: false }, // Linea
  7777777: { directSwap: false, uniV3Path: false }, // Zora
  34443: { directSwap: false, uniV3Path: false }, // Mode
  1329: { directSwap: false, uniV3Path: false }, // Sei
  80094: { directSwap: false, uniV3Path: false }, // Berachain
  195: { directSwap: false, uniV3Path: false }, // X1
};

// Optional helpers (non-breaking)
export const canDirectSwap = (chainId) =>
  !!(CHAIN_CAPS[Number(chainId)] && CHAIN_CAPS[Number(chainId)].directSwap);

export const hasUniV3Path = (chainId) =>
  !!(CHAIN_CAPS[Number(chainId)] && CHAIN_CAPS[Number(chainId)].uniV3Path);