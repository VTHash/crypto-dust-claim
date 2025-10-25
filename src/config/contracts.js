export const DUSTCLAIM_ABI = [
  // 1inch paths
  "function claimDustToETH(address tokenAddress, uint256 minReturnAmount, bytes swapData) external returns (uint256 ethReceived)",
  "function claimDustBatchToETH(address[] tokens, uint256[] minReturns, bytes[] swapDatas) external returns (uint256 totalEth)",
  // Uniswap V3 path
  "function claimDustViaUniswap(address tokenAddress, uint24 fee, uint256 minReturnAmount, uint256 deadline) external returns (uint256 ethReceived)",
  // view
  "function chainId() view returns (uint256)",
  // admin (owner-only on your contract)
  "function withdrawCollectedToken(address token, uint256 amount) external",
  // events
  "event DustClaimed(address indexed user, address indexed tokenIn, uint256 amountIn, uint256 ethOut)",
  "event DustBatchClaimed(address indexed user, uint256 totalEthOut)"
]

// One contract address per chain (fill these after deploy)
export const DUSTCLAIM_ADDRESS = {
  // Mainnets & L2s
  1: import.meta.env.VITE_DUSTCLAIM_ETH || "0xC73E2EE769b3CDc5c843093470b5Cc17d89D9640", // ✅ Ethereum Mainnet
  10: import.meta.env.VITE_DUSTCLAIM_OP || "0xYourOptimismAddress", // Optimism
  56: import.meta.env.VITE_DUSTCLAIM_BNB || "0xYourBnbAddress", // BNB Smart Chain
  100: import.meta.env.VITE_DUSTCLAIM_GNO || "0xYourGnosisAddress", // Gnosis
  137: import.meta.env.VITE_DUSTCLAIM_POLY || "0xYourPolygonAddress", // Polygon PoS
  195: import.meta.env.VITE_DUSTCLAIM_X1 || "0xYourX1Address", // X1 Network
  250: import.meta.env.VITE_DUSTCLAIM_FTM || "0xYourFantomAddress", // Fantom
  1329: import.meta.env.VITE_DUSTCLAIM_SEI || "0xYourSeiAddress", // Sei Network
  8453: import.meta.env.VITE_DUSTCLAIM_BASE || "0xYourBaseAddress", // Base
  34443: import.meta.env.VITE_DUSTCLAIM_MODE || "0xYourModeAddress", // Mode
  42161: import.meta.env.VITE_DUSTCLAIM_ARB || "0xYourArbitrumAddress", // Arbitrum One
  43114: import.meta.env.VITE_DUSTCLAIM_AVAX || "0xYourAvalancheAddress", // Avalanche C-Chain
  59144: import.meta.env.VITE_DUSTCLAIM_LINEA || "0xYourLineaAddress", // Linea
  80084: import.meta.env.VITE_DUSTCLAIM_BERA || "0xYourBerachainAddress", // Berachain
  7777777: import.meta.env.VITE_DUSTCLAIM_ZORA || "0xYourZoraAddress" // Zora
}
