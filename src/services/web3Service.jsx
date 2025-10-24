import { ethers } from 'ethers'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'

class Web3Service {
  constructor() {
    this.providers = {}
    this.initializeProviders()
  }

  initializeProviders() {
    Object.keys(SUPPORTED_CHAINS).forEach(chainId => {
      const chain = SUPPORTED_CHAINS[chainId]
      this.providers[chainId] = new ethers.JsonRpcProvider(chain.rpcUrl)
    })
  }

  getProvider(chainId) {
    return this.providers[chainId]
  }

  async getBalance(chainId, address) {
    try {
      const provider = this.getProvider(chainId)
      const balance = await provider.getBalance(address)
      return ethers.formatEther(balance)
    } catch (error) {
      console.error(`Error getting balance on chain ${chainId}:`, error)
      return '0'
    }
  }

  async getTokenBalances(chainId, address) {
    // Mock token data - in real app, you'd have proper token lists
    const TOKENS = {
      1: {
        'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        'DAI': '0x6B175474E89094C44Da98b954EedeAC495271d0F'
      },
      137: {
        'USDT': '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        'USDC': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
      }
    }

    const tokens = TOKENS[chainId] || {}
    const balances = []

    for (const [symbol, tokenAddress] of Object.entries(tokens)) {
      try {
        const balance = await this.getTokenBalance(chainId, tokenAddress, address)
        if (parseFloat(balance) > 0) {
          balances.push({
            symbol,
            balance,
            address: tokenAddress,
            chainId
          })
        }
      } catch (error) {
        console.error(`Error getting ${symbol} balance:`, error)
      }
    }

    return balances
  }

  async getTokenBalance(chainId, tokenAddress, userAddress) {
    const provider = this.getProvider(chainId)
    
    const abi = [
      "function balanceOf(address owner) view returns (uint256)",
      "function decimals() view returns (uint8)"
    ]
    
    const contract = new ethers.Contract(tokenAddress, abi, provider)
    const balance = await contract.balanceOf(userAddress)
    const decimals = await contract.decimals()
    
    return ethers.formatUnits(balance, decimals)
  }

  async checkForDust(chainId, address) {
    const nativeBalance = await this.getBalance(chainId, address)
    const tokenBalances = await this.getTokenBalances(chainId, address)
    
    const nativeDust = parseFloat(nativeBalance) < 0.001
    const tokenDust = tokenBalances.filter(token => parseFloat(token.balance) < 0.01)
    
    return {
      chainId,
      nativeBalance,
      nativeDust,
      tokenDust,
      hasDust: nativeDust || tokenDust.length > 0
    }
  }

  async getUSDValue(chainId, nativeBalance, tokenDust) {
    // Mock USD values - in real app, you'd use price feeds
    const nativeValue = parseFloat(nativeBalance) * 2500 // Mock ETH price
    const tokenValue = tokenDust.reduce((sum, token) => sum + parseFloat(token.balance) * 1, 0) // Mock $1 per token
    
    return nativeValue + tokenValue
  }
}

export default new Web3Service()