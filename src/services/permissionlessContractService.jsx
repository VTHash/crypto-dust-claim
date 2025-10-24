import { ethers } from 'ethers';

// Permissionless Contract ABIs
const PERMISSIONLESS_DUST_CLAIM_ABI = [
    "function claimDust(address token) external returns (bool)",
    "function batchClaimDust(address[] calldata tokens) external returns (uint256)",
    "function getDustBalances(address user, address[] calldata tokens) external view returns (uint256[] balances, address[] dustTokens)",
    "function hasDust(address user, address token) external view returns (bool, uint256)",
    "function getUserDustTokens(address user, address[] calldata tokenList) external view returns (address[] memory, uint256[] memory)",
    "event DustClaimed(address indexed user, address indexed token, uint256 amount, uint256 timestamp)",
    "event BatchDustClaimed(address indexed user, address[] tokens, uint256 totalAmount, uint256 timestamp)"
];

const DUST_SCANNER_ABI = [
    "function scanForDust(address user, address[] calldata tokens) external view returns (tuple(address token, uint256 balance, string symbol, uint256 decimals)[])",
    "function getTotalDustValue(address user, address[] calldata tokens) external view returns (uint256 totalDustCount, uint256 totalBalance)",
    "function checkTokenForDust(address user, address token) external view returns (bool hasDust, uint256 balance, string symbol)"
];

class PermissionlessContractService {
    constructor() {
        // Contract addresses - deploy once on each chain, then anyone can use
        this.contractAddresses = {
            1: { // Ethereum Mainnet
                dustClaim: "0x...", // DEPLOY THIS on Remix
                dustScanner: "0x..." // DEPLOY THIS on Remix
            },
            137: { // Polygon
                dustClaim: "0x...", 
                dustScanner: "0x..."
            },
            42161: { // Arbitrum
                dustClaim: "0x...",
                dustScanner: "0x..."
            }
            // Add more chains after deployment
        };
    }

    /**
     * Users can claim their own dust directly - no approvals needed
     */
    async claimUserDust(chainId, tokenAddress, userSigner) {
        try {
            const contractAddress = this.contractAddresses[chainId]?.dustClaim;
            if (!contractAddress) throw new Error(`Contract not deployed on chain ${chainId}`);

            const contract = new ethers.Contract(contractAddress, PERMISSIONLESS_DUST_CLAIM_ABI, userSigner);
            
            // User interacts directly with their own funds
            const tx = await contract.claimDust(tokenAddress);
            const receipt = await tx.wait();
            
            return {
                success: true,
                txHash: tx.hash,
                receipt: receipt
            };
        } catch (error) {
            console.error('Error claiming dust:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Users batch claim their own dust
     */
    async batchClaimUserDust(chainId, tokenAddresses, userSigner) {
        try {
            const contractAddress = this.contractAddresses[chainId]?.dustClaim;
            if (!contractAddress) throw new Error(`Contract not deployed on chain ${chainId}`);

            const contract = new ethers.Contract(contractAddress, PERMISSIONLESS_DUST_CLAIM_ABI, userSigner);
            
            const tx = await contract.batchClaimDust(tokenAddresses);
            const receipt = await tx.wait();
            
            return {
                success: true,
                txHash: tx.hash,
                receipt: receipt
            };
        } catch (error) {
            console.error('Error batch claiming dust:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Scan for user's dust across multiple tokens
     */
    async scanUserDust(chainId, userAddress, tokenList) {
        try {
            const contractAddress = this.contractAddresses[chainId]?.dustScanner;
            if (!contractAddress) throw new Error(`Scanner not deployed on chain ${chainId}`);

            const provider = new ethers.JsonRpcProvider(SUPPORTED_CHAINS[chainId].rpcUrl);
            const contract = new ethers.Contract(contractAddress, DUST_SCANNER_ABI, provider);
            
            const dustResults = await contract.scanForDust(userAddress, tokenList);
            
            return dustResults.map(dust => ({
                token: dust.token,
                balance: dust.balance.toString(),
                symbol: dust.symbol,
                decimals: dust.decimals.toString(),
                formattedBalance: ethers.formatUnits(dust.balance, dust.decimals)
            }));
        } catch (error) {
            console.error('Error scanning dust:', error);
            return [];
        }
    }

    /**
     * Check if user has dust in specific token
     */
    async checkUserHasDust(chainId, userAddress, tokenAddress) {
        try {
            const contractAddress = this.contractAddresses[chainId]?.dustScanner;
            if (!contractAddress) return { hasDust: false, balance: '0' };

            const provider = new ethers.JsonRpcProvider(SUPPORTED_CHAINS[chainId].rpcUrl);
            const contract = new ethers.Contract(contractAddress, DUST_SCANNER_ABI, provider);
            
            const [hasDust, balance] = await contract.hasDust(userAddress, tokenAddress);
            
            return {
                hasDust,
                balance: balance.toString()
            };
        } catch (error) {
            console.error('Error checking dust:', error);
            return { hasDust: false, balance: '0' };
        }
    }
}

export default new PermissionlessContractService();