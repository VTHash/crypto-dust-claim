import { ethers } from 'ethers'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import web3Service from './web3Service'
import dexAggregatorService from './dexAggregatorService'

class BatchService {
  constructor() {
    // Standard ERC-20 ABI
    this.erc20ABI = [
      "function transfer(address to, uint256 amount) external returns (bool)",
      "function balanceOf(address account) external view returns (uint256)",
      "function decimals() external view returns (uint8)",
      "function approve(address spender, uint256 amount) external returns (bool)"
    ]
    
    // Batch transfer contract ABI (common pattern)
    this.batchTransferABI = [
      "function batchTransfer(address token, address[] calldata recipients, uint256[] calldata amounts) external",
      "function batchTransferETH(address[] calldata recipients, uint256[] calldata amounts) external payable"
    ]
    
    // Common batch contract addresses by chain
    this.BATCH_CONTRACTS = {
      1: '0x6B175474E89094C44Da98b954EedeAC495271d0F', // Using DAI as example, replace with actual batch contract
      137: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', // Matic USDC
      42161: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8' // Arbitrum USDC
    }
  }

  /**
   * Create optimized batch transactions for dust claiming
   */
  async createBatchDustClaim(claims, walletAddress) {
    try {
      const batchTransactions = []
      
      // Group claims by chain and token
      const claimsByChain = this.groupClaimsByChain(claims)
      
      for (const [chainId, chainClaims] of Object.entries(claimsByChain)) {
        const chainTransactions = await this.createChainBatchTransactions(
          parseInt(chainId),
          chainClaims,
          walletAddress
        )
        batchTransactions.push(...chainTransactions)
      }
      
      return batchTransactions
    } catch (error) {
      console.error('Error creating batch dust claim:', error)
      throw error
    }
  }

  /**
   * Group claims by chain and token
   */
  groupClaimsByChain(claims) {
    const claimsByChain = {}
    
    claims.forEach(claim => {
      if (!claimsByChain[claim.chainId]) {
        claimsByChain[claim.chainId] = {}
      }
      
      if (!claimsByChain[claim.chainId][claim.tokenAddress]) {
        claimsByChain[claim.chainId][claim.tokenAddress] = []
      }
      
      claimsByChain[claim.chainId][claim.tokenAddress].push(claim)
    })
    
    return claimsByChain
  }

  /**
   * Create batch transactions for a specific chain
   */
  async createChainBatchTransactions(chainId, chainClaims, walletAddress) {
    const transactions = []
    
    for (const [tokenAddress, tokenClaims] of Object.entries(chainClaims)) {
      if (tokenAddress === '0x0000000000000000000000000000000000000000') {
        // Native token transfers
        const nativeTx = await this.createNativeBatchTransfer(
          chainId,
          tokenClaims,
          walletAddress
        )
        if (nativeTx) transactions.push(nativeTx)
      } else {
        // ERC-20 token transfers
        const tokenTxs = await this.createTokenBatchTransfers(
          chainId,
          tokenAddress,
          tokenClaims,
          walletAddress
        )
        transactions.push(...tokenTxs)
      }
    }
    
    return transactions
  }

  /**
   * Create batch transfer for native tokens (ETH, MATIC, etc.)
   */
  async createNativeBatchTransfer(chainId, claims, walletAddress) {
    try {
      const recipients = claims.map(claim => claim.recipient)
      const amounts = claims.map(claim => 
        ethers.parseEther(claim.amount.toString())
      )
      
      const totalAmount = amounts.reduce((sum, amount) => sum + amount, 0n)
      
      // For native transfers, we can use a batch contract or multi-send
      const batchContract = this.BATCH_CONTRACTS[chainId]
      
      if (batchContract) {
        // Use batch contract if available
        const contract = new ethers.Interface(this.batchTransferABI)
        const data = contract.encodeFunctionData('batchTransferETH', [
          recipients,
          amounts
        ])
        
        return {
          to: batchContract,
          data: data,
          value: '0x' + totalAmount.toString(16),
          gasLimit: '0x' + (50000 + (recipients.length * 21000)).toString(16),
          chainId: chainId
        }
      } else {
        // Fallback: Use multi-send in single transaction
        // This is a simplified version - in production you'd use a proper multi-send contract
        return await this.createMultiSendNative(chainId, recipients, amounts, totalAmount)
      }
    } catch (error) {
      console.error('Error creating native batch transfer:', error)
      return null
    }
  }

  /**
   * Multi-send implementation for native tokens
   */
  async createMultiSendNative(chainId, recipients, amounts, totalAmount) {
    // Simple implementation: send to first recipient with note about distribution
    // In production, use a proper multi-send contract like:
    // 0x8d29be29923b68abf65421f2e882edc91572316c (MultiSend contract on Ethereum)
    
    const multiSendContract = '0x8d29be29923b68abf65421f2e882edc91572316c' // Example contract
    
    const contract = new ethers.Interface([
      "function multiSend(bytes memory transactions) external payable"
    ])
    
    // Encode multiple transfers into single transaction data
    let transactionsData = '0x'
    recipients.forEach((recipient, i) => {
      const txData = ethers.solidityPacked(
        ['uint8', 'address', 'uint256', 'uint256'],
        [0, recipient, amounts[i], 0]
      )
      transactionsData += txData.slice(2)
    })
    
    const data = contract.encodeFunctionData('multiSend', [transactionsData])
    
    return {
      to: multiSendContract,
      data: data,
      value: '0x' + totalAmount.toString(16),
      gasLimit: '0x' + (100000 + (recipients.length * 5000)).toString(16),
      chainId: chainId
    }
  }

  /**
   * Create batch transfers for ERC-20 tokens
   */
  async createTokenBatchTransfers(chainId, tokenAddress, claims, walletAddress) {
    const transactions = []
    const recipients = claims.map(claim => claim.recipient)
    
    try {
      // Get token decimals
      const provider = web3Service.getProvider(chainId)
      const tokenContract = new ethers.Contract(tokenAddress, this.erc20ABI, provider)
      const decimals = await tokenContract.decimals()
      
      const amounts = claims.map(claim => 
        ethers.parseUnits(claim.amount.toString(), decimals)
      )
      
      // Option 1: Use batch transfer contract
      const batchTx = await this.createTokenBatchViaContract(
        chainId,
        tokenAddress,
        recipients,
        amounts,
        decimals
      )
      if (batchTx) {
        transactions.push(batchTx)
        return transactions
      }
      
      // Option 2: Individual transfers (fallback)
      console.log('Using individual transfers as fallback')
      for (let i = 0; i < recipients.length; i++) {
        const singleTx = await this.createSingleTokenTransfer(
          chainId,
          tokenAddress,
          recipients[i],
          amounts[i],
          decimals
        )
        if (singleTx) transactions.push(singleTx)
      }
      
    } catch (error) {
      console.error('Error creating token batch transfers:', error)
      // Fallback to individual transfers
      for (const claim of claims) {
        const singleTx = await this.createSingleTokenTransfer(
          chainId,
          tokenAddress,
          claim.recipient,
          ethers.parseUnits(claim.amount.toString(), 18), // Default 18 decimals
          18
        )
        if (singleTx) transactions.push(singleTx)
      }
    }
    
    return transactions
  }

  /**
   * Create batch transfer using a batch contract
   */
  async createTokenBatchViaContract(chainId, tokenAddress, recipients, amounts, decimals) {
    try {
      const batchContract = this.BATCH_CONTRACTS[chainId]
      if (!batchContract) return null
      
      const contract = new ethers.Interface(this.batchTransferABI)
      const data = contract.encodeFunctionData('batchTransfer', [
        tokenAddress,
        recipients,
        amounts
      ])
      
      // Estimate gas
      const gasEstimate = 100000 + (recipients.length * 25000)
      
      return {
        to: batchContract,
        data: data,
        value: '0x0',
        gasLimit: '0x' + gasEstimate.toString(16),
        chainId: chainId
      }
    } catch (error) {
      console.error('Error creating batch transfer via contract:', error)
      return null
    }
  }

  /**
   * Create single ERC-20 transfer transaction
   */
  async createSingleTokenTransfer(chainId, tokenAddress, recipient, amount, decimals) {
    try {
      const contract = new ethers.Interface(this.erc20ABI)
      const data = contract.encodeFunctionData('transfer', [
        recipient,
        amount
      ])
      
      return {
        to: tokenAddress,
        data: data,
        value: '0x0',
        gasLimit: '0x186A0', // 100,000 gas
        chainId: chainId
      }
    } catch (error) {
      console.error('Error creating single token transfer:', error)
      return null
    }
  }

  /**
   * Create dust conversion transactions via DEX
   */
  async createDustConversionTransactions(dustResults, targetToken = 'USDC', walletAddress) {
    const conversionTransactions = []
    
    try {
      for (const chainResult of dustResults) {
        const chainId = chainResult.chainId
        
        // Convert native dust
        if (chainResult.nativeDust && parseFloat(chainResult.nativeBalance) > 0.0001) {
          const nativeSwap = await this.createNativeToTokenSwap(
            chainId,
            chainResult.nativeBalance,
            targetToken,
            walletAddress
          )
          if (nativeSwap) conversionTransactions.push(nativeSwap)
        }
        
        // Convert token dust
        for (const token of chainResult.tokenDust) {
          if (parseFloat(token.balance) > 0.0001) { // Minimum threshold
            const tokenSwap = await this.createTokenToTokenSwap(
              chainId,
              token.address,
              token.balance,
              targetToken,
              walletAddress
            )
            if (tokenSwap) conversionTransactions.push(tokenSwap)
          }
        }
      }
      
      return conversionTransactions
    } catch (error) {
      console.error('Error creating dust conversion transactions:', error)
      return []
    }
  }

  /**
   * Create swap from native token to target token
   */
  async createNativeToTokenSwap(chainId, amount, targetToken, walletAddress) {
    try {
      // Use DEX aggregator to get the best swap route
      const quote = await dexAggregatorService.getBestQuote(
        chainId,
        '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // Native token address
        await this.getTokenAddress(chainId, targetToken),
        amount,
        1 // 1% slippage
      )
      
      if (quote && quote.transaction) {
        return {
          to: quote.transaction.to,
          data: quote.transaction.data,
          value: '0x' + BigInt(quote.transaction.value || 0).toString(16),
          gasLimit: '0x' + (quote.estimatedGas || 300000).toString(16),
          chainId: chainId
        }
      }
    } catch (error) {
      console.error('Error creating native to token swap:', error)
    }
    return null
  }

  /**
   * Create swap from one token to another
   */
  async createTokenToTokenSwap(chainId, fromToken, amount, targetToken, walletAddress) {
    try {
      const toToken = await this.getTokenAddress(chainId, targetToken)
      
      const quote = await dexAggregatorService.getBestQuote(
        chainId,
        fromToken,
        toToken,
        amount,
        1 // 1% slippage
      )
      
      if (quote && quote.transaction) {
        return {
          to: quote.transaction.to,
          data: quote.transaction.data,
          value: '0x' + BigInt(quote.transaction.value || 0).toString(16),
          gasLimit: '0x' + (quote.estimatedGas || 300000).toString(16),
          chainId: chainId
        }
      }
    } catch (error) {
      console.error('Error creating token to token swap:', error)
    }
    return null
  }

  /**
   * Get token address by symbol
   */
  async getTokenAddress(chainId, symbol) {
    const TOKEN_ADDRESSES = {
      1: {
        'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        'DAI': '0x6B175474E89094C44Da98b954EedeAC495271d0F'
      },
      137: {
        'USDC': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        'USDT': '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
      },
      42161: {
        'USDC': '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
        'USDT': '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
      }
    }
    
    return TOKEN_ADDRESSES[chainId]?.[symbol] || '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
  }

  /**
   * Calculate real gas savings based on actual transaction counts
   */
  calculateGasSavings(individualTransactions, batchTransactions) {
    // Real gas estimates based on transaction types
    const individualGas = individualTransactions.reduce((total, tx) => {
      let gas = 0
      if (tx.data && tx.data.length > 10) {
        // ERC-20 transfer: ~65,000 gas
        gas = 65000
      } else {
        // Native transfer: ~21,000 gas
        gas = 21000
      }
      return total + gas
    }, 0)
    
    const batchGas = batchTransactions.reduce((total, tx) => {
      let gas = 0
      if (tx.data && tx.data.includes('batchTransfer')) {
        // Batch transfer: ~100,000 base + 20,000 per recipient
        const recipientCount = (tx.data.length - 138) / 64 // Rough estimate
        gas = 100000 + (recipientCount * 20000)
      } else if (tx.data && tx.data.includes('multiSend')) {
        // Multi-send: ~150,000 base + 5,000 per transfer
        const transferCount = (tx.data.length - 138) / 64
        gas = 150000 + (transferCount * 5000)
      } else {
        // Regular transaction
        gas = 65000
      }
      return total + gas
    }, 0)
    
    const savings = individualGas - batchGas
    const savingsPercentage = individualGas > 0 ? ((savings / individualGas) * 100).toFixed(2) : '0.00'
    
    return {
      individualGas,
      batchGas,
      savings,
      savingsPercentage,
      estimatedSavingsUSD: this.estimateGasSavingsUSD(savings)
    }
  }

  /**
   * Estimate USD value of gas savings
   */
  estimateGasSavingsUSD(gasSavings, chainId = 1) {
    // Average gas prices (in gwei)
    const avgGasPrice = {
      1: 30,    // Ethereum: 30 gwei
      137: 200,  // Polygon: 200 gwei
      42161: 0.1, // Arbitrum: 0.1 gwei
      10: 0.001  // Optimism: 0.001 gwei
    }
    
    const gasPrice = avgGasPrice[chainId] || 30
    const ethPrice = 2500 // Assume $2500/ETH
    
    // Convert gas savings to USD
    const ethSaved = (gasSavings * gasPrice * 1e9) / 1e18
    return ethSaved * ethPrice
  }

  /**
   * Validate batch transactions before execution
   */
  validateBatchTransactions(transactions, walletAddress) {
    const errors = []
    
    transactions.forEach((tx, index) => {
      // Check for basic transaction structure
      if (!tx.to) {
        errors.push(`Transaction ${index + 1}: Missing 'to' address`)
      }
      
      if (!tx.data && !tx.value) {
        errors.push(`Transaction ${index + 1}: No data or value provided`)
      }
      
      if (!tx.chainId) {
        errors.push(`Transaction ${index + 1}: Missing chainId`)
      }
      
      // Validate value format
      if (tx.value && !this.isValidHex(tx.value)) {
        errors.push(`Transaction ${index + 1}: Invalid value format`)
      }
      
      // Validate gas limit
      if (tx.gasLimit && !this.isValidHex(tx.gasLimit)) {
        errors.push(`Transaction ${index + 1}: Invalid gas limit format`)
      }
    })
    
    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Check if string is valid hex
   */
  isValidHex(str) {
    return typeof str === 'string' && /^0x[0-9a-fA-F]+$/.test(str)
  }

  /**
   * Optimize transaction order for gas efficiency
   */
  optimizeTransactionOrder(transactions) {
    return transactions.sort((a, b) => {
      // Execute native transfers first (cheaper)
      const aIsNative = !a.data || a.data === '0x'
      const bIsNative = !b.data || b.data === '0x'
      
      if (aIsNative && !bIsNative) return -1
      if (!aIsNative && bIsNative) return 1
      
      // Then sort by chain (group by chain to avoid switching)
      return a.chainId - b.chainId
    })
  }
}

export default new BatchService()