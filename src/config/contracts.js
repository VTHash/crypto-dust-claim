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
  1: "0xYourMainnetAddress", // Ethereum
  10: "0xYourOptimismAddress", // OP Mainnet
  8453: "0xYourBaseAddress", // Base
  42161:"0xYourArbitrumAddress", // Arbitrum
  137: "0xYourPolygonAddress", // Polygon
  // add more as you deploy
}