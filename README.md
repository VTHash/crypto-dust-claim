# 🧹 DustClaim — Multi-Chain Dust-to-ETH Converter

**DustClaim** is a **non-custodial**, **gas-optimized** smart contract and dApp that lets users efficiently convert their leftover ("dust") ERC-20 token balances into **ETH** across multiple blockchains — all in one transaction.

The protocol integrates **1inch** and **Uniswap V3** routes for best-rate conversions, automating token cleanup for users and wallets.

---

## 🌐 Website
👉 [https://dustclaim.xyz](https://dustclaim.xyz)

---

## 🚀 Features

- ⚡ **Multi-Chain Support** — deployable across 10+ EVM networks (Ethereum, BNB, Polygon, Base, Arbitrum, Optimism, Avalanche, Linea, etc.)  
- 💨 **Gas-Optimized Batch Swaps** — convert multiple dust tokens to ETH in one call  
- 🔒 **Non-Custodial Design** — DustClaim never holds user funds; tokens are swapped and released immediately  
- 🧩 **1inch + Uniswap V3 Integration** — routes swaps via top-liquidity DEXs  
- 🧱 **Modular ABI Support** — separate JSON ABIs per chain  
- 🪶 **Minimal Approvals** — each token only approved once for all future swaps  
- 🧰 **Admin-Safe** — only the contract owner can recover tokens accidentally sent to the contract  

---

## 💡 Smart Contract Overview

### **Purpose**
A gas-efficient **dust-to-ETH** converter that allows users to turn tiny token balances into ETH via:
- **1inch Aggregation Router** (batch or single token)
- **Uniswap V3** (single token)

### **Key Interfaces**
- `I1inchRouter` — for flexible 1inch swaps using encoded data
- `IWETH` — used for wrapping/unwrapping ETH/WETH
- `IUniswapV3Router` — for exact-input swaps via Uniswap V3 pools

---

## ⚙️ Core Functions

| Function | Description |
|-----------|--------------|
| `claimDustToETH(address tokenAddress, uint256 minReturnAmount, bytes swapData)` | Swaps a single token to ETH via 1inch |
| `claimDustBatchToETH(address[] tokens, uint256[] minReturns, bytes[] swapDatas)` | Swaps up to 10 tokens to ETH in one transaction |
| `claimDustViaUniswap(address tokenAddress, uint24 fee, uint256 minReturnAmount, uint256 deadline)` | Swaps a single token via Uniswap V3 |
| `withdrawCollectedToken(address token, uint256 amount)` | Admin-only rescue function for mistakenly sent tokens |

---

## 🛡️ Security & Gas Optimizations

- **✅ Reentrancy Guard** — all external calls protected  
- **✅ SafeERC20** — supports non-standard tokens (like USDT)  
- **✅ Minimal Approvals** — uses `forceApprove` to set allowances efficiently  
- **✅ Batch Processing** — combines multiple swaps into one payout  
- **✅ Custom Errors** — gas-saving reverts (`NoBalance`, `LengthMismatch`, etc.)  

---

## 🔁 Workflow

1. The user connects their wallet (MetaMask, WalletConnect, etc.).
2. The user approves the contract to spend specific dust tokens.
3. The contract:
   - Pulls the approved token(s)
   - Swaps via 1inch or Uniswap V3
   - Converts WETH → ETH
   - Sends ETH directly back to the user’s wallet
4. The contract emits:
   - `DustClaimed` (per swap)
   - `DustBatchClaimed` (for batch operations)

---

## 👮 Admin Role

The contract is **permissionless for users** — any user can interact and claim.

Only the `owner` has access to:
- `withdrawCollectedToken()` — used only to recover tokens sent by mistake.

No admin control over user funds or swaps.

---

## 🧾 Events

| Event | Description |
|--------|-------------|
| `DustClaimed(address indexed user, address indexed tokenIn, uint256 amountIn, uint256 ethOut)` | Fired on each single-token swap |
| `DustBatchClaimed(address indexed user, uint256 totalEthOut)` | Fired after a successful batch swap |

---

## 🧮 Parameters

| Parameter | Type | Description |
|------------|------|-------------|
| `tokenAddress` | `address` | ERC20 token to convert |
| `minReturnAmount` | `uint256` | Minimum acceptable ETH amount |
| `swapData` | `bytes` | Encoded swap path for 1inch |
| `fee` | `uint24` | Uniswap V3 pool fee (e.g., 3000 = 0.3%) |
| `deadline` | `uint256` | Unix timestamp after which tx is invalid |

---

## 🧠 Tech Stack

| Layer | Technology |
|--------|-------------|
| Smart Contract | Solidity `^0.8.20` |
| Framework | Hardhat / Foundry |
| Frontend | React + Vite |
| Web3 | Ethers.js + Reown AppKit |
| Wallet Support | MetaMask, WalletConnect, Coinbase Wallet, Rainbow |
| Styling | Custom CSS + Reown modal theme |
| Deployment | Multi-Chain Ready (Ethereum mainnet + EVMs) |
---

## 🧰 Local Setup (Developers)

```bash
# Clone the repo
git clone https://github.com/<your-org>/dustclaim.git
cd dustclaim

# Install dependencies
npm install

# Run local development
npm run dev

# Build for production
npm run build