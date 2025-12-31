🧹 DustClaim — Multi-Chain Dust Aggregation & Native ETH Recovery
DustClaim is a non-custodial, batch-optimized smart contract system and dApp that allows users to convert leftover (“dust”) ERC-20 token balances into native chain ETH (or native gas token) in a single, controlled execution flow.
The protocol is designed for wallet cleanup, gas efficiency, and cross-chain consistency, using 0x Aggregator v2 swap calldata and a hardened execution contract (DustClaimV3).
🌐 Website
👉 https://dustclaim.xyz
🧠 Core Design Principles
Non-custodial — user funds are never stored permanently
Explicit user approvals — every token approval happens on-chain from the user
Single execution entrypoint — one contract call per chain
Aggregator-agnostic execution — swap calldata is prepared off-chain
Mobile-safe flow — avoids wallet loops and race conditions
🚀 Features
⚡ Multi-Chain Support
DustClaim is designed to operate across multiple EVM chains, including:
Ethereum Mainnet
Linea
Arbitrum
Optimism
Base
Polygon
BNB Chain
Avalanche
(and any EVM chain supported by 0x)
Each chain has its own deployed DustClaimV3 contract.
🔁 Batch Dust Conversion (ERC-20 → Native)
Multiple ERC-20 tokens are processed in one execution
Each token is:
Pulled from the user via transferFrom
Approved internally to the swap router
Swapped via aggregator calldata
Converted to WETH
Unwrapped to native ETH
Sent back to the user
No intermediate balances remain in the contract.
🔒 Non-Custodial & Stateless
Tokens are held only during execution
ETH is returned immediately to the caller
Contract has no withdrawal functions for user funds
Owner functions are limited to emergency rescue only
🧾 Explicit Approval Flow (No Hidden Permissions)
DustClaim does not auto-approve tokens.
The flow is:
UI checks allowance
User signs ERC-20 approve() for DustClaimV3
Approval is confirmed on-chain
Only then is the claim execution enabled
This prevents:
infinite approval loops
mobile MetaMask bugs
silent permission grants
🧠 Off-Chain Quote, On-Chain Execution
Swap routes are generated off-chain using 0x API v2
The contract receives:
token
amount
spender
swapCalldata
Contract only executes, never calculates routes
This keeps the on-chain logic minimal, auditable, and gas-efficient.
🧩 Dust Definition Logic
DustClaim does not hardcode “dust” on-chain.
Dust is determined off-chain in the UI, based on:
ERC-20 Tokens
USD value below a configurable threshold (default: $2.50)
Token must be swappable via aggregator
Token must not be native gas token
Native Token (ETH / chain gas)
Filtered using a native dust flag
Default example: 0.0001 ETH
Native gas is never swapped, only displayed
This design allows:
chain-specific tuning
safer UX
future upgrades without redeploying contracts
🛠 Smart Contract Architecture
DustClaimV3.sol
Key responsibilities:
Pull ERC-20 tokens from user
Force-approve router (safe approve pattern)
Execute aggregator calldata
Receive WETH
Unwrap WETH → native ETH
Send ETH back to msg.sender
Security Measures
ReentrancyGuard
SafeERC20
Forced allowance reset pattern
Strict calldata execution
Owner-only rescue for stuck tokens (non-user funds)
🖥 Frontend (dApp)
Pages
Dashboard — wallet overview
Dust Scanner — detects eligible dust tokens
Claim — batch execution
Wallet Support
MetaMask (desktop & mobile)
WalletConnect via Reown AppKit
Execution Safeguards
Sequential approval handling
Execution lock (prevents double-click / loops)
Mobile delay handling
Chain-aware execution plans
🔄 Execution Flow (End-to-End)
User connects wallet
User selects chain
Dust tokens are detected
Required approvals are requested one by one
UI confirms all approvals are mined
User executes one claimDustUsingAggregator transaction
ETH is returned to the user
No balances remain in the contract
🧪 Known Behaviors & Constraints
Native gas is not swapped (by design)
Tokens without liquidity will be skipped
High gas chains (Ethereum) may make small dust uneconomical
Linea currently has fewer “true dust” scenarios due to low gas
🛡 Trust & Transparency
No proxy pattern
No upgradeable logic
No custody
Fully verifiable contracts
Deterministic execution
DustClaim is a tool, not a vault.

👋 Final Note
DustClaim is intentionally simple, explicit, and defensive.
No hidden permissions
No background swaps
No silent approvals
What the user signs is exactly what happens on-chain.
