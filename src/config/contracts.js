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
  1: "0x73f2Ef769b3Dc5c84390347b05cc1D89dD9644f", // Ethereum ✅
  10: "", // OP Mainnet
  56: "", // BNB Smart Chain
  100: "", // Gnosis
  137: "", // Polygon PoS
  195: "", // X1
  250: "", // Fantom
  1329: "", // Sei
  8453: "", // Base
  34443: "", // Mode
  42161: "", // Arbitrum One
  43114: "", // Avalanche C
  59144: "", // Linea
  80094: "", // Berachain (note: your SUPPORTED_CHAINS used 80094)
  7777777: "" // Zora
};

// Helper
export function getAddressForChain(chainId) {
  return DUSTCLAIM_ADDRESS[Number(chainId)] || null;
}