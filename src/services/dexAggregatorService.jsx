import axios from 'axios'

class DexAggregatorService {
  constructor() {
    this.oneInchBaseURLs = {
      1: 'https://api.1inch.io/v5.0/1',
      137: 'https://api.1inch.io/v5.0/137',
      42161: 'https://api.1inch.io/v5.0/42161',
      10: 'https://api.1inch.io/v5.0/10',
      56: 'https://api.1inch.io/v5.0/56'
    }
    
    this.paraswapBaseURL = 'https://api.paraswap.io/v2'
    this.odoisBaseURL = 'https://api.0x.org/swap/v1'
  }

  async getBestQuote(chainId, fromToken, toToken, amount, slippage = 1) {
    try {
      const quotes = await Promise.allSettled([
        this.get1InchQuote(chainId, fromToken, toToken, amount, slippage),
        this.getParaswapQuote(chainId, fromToken, toToken, amount, slippage),
        this.get0xQuote(chainId, fromToken, toToken, amount, slippage)
      ])

      const validQuotes = quotes
        .filter(result => result.status === 'fulfilled' && result.value)
        .map(result => result.value)

      if (validQuotes.length === 0) {
        throw new Error('No quotes available from aggregators')
      }

      // Return the best quote (highest return amount)
      return validQuotes.sort((a, b) => 
        parseFloat(b.toTokenAmount) - parseFloat(a.toTokenAmount)
      )[0]
    } catch (error) {
      console.error('Error getting best quote:', error)
      throw error
    }
  }

  async get1InchQuote(chainId, fromToken, toToken, amount, slippage) {
    try {
      const baseURL = this.oneInchBaseURLs[chainId]
      if (!baseURL) throw new Error(`1inch not supported on chain ${chainId}`)

      const response = await axios.get(`${baseURL}/quote`, {
        params: {
          fromTokenAddress: fromToken,
          toTokenAddress: toToken,
          amount: amount,
          slippage: slippage
        }
      })

      return {
        fromTokenAmount: amount,
        toTokenAmount: response.data.toTokenAmount,
        estimatedGas: response.data.estimatedGas,
        transaction: response.data.tx,
        aggregator: '1inch'
      }
    } catch (error) {
      console.error('1inch quote error:', error.message)
      return null
    }
  }

  async getParaswapQuote(chainId, fromToken, toToken, amount, slippage) {
    try {
      const priceRouteResponse = await axios.get(`${this.paraswapBaseURL}/prices`, {
        params: {
          srcToken: fromToken,
          destToken: toToken,
          srcAmount: amount,
          side: 'SELL',
          network: chainId
        }
      })

      const priceRoute = priceRouteResponse.data.priceRoute
      
      const transactionResponse = await axios.post(`${this.paraswapBaseURL}/transactions/${chainId}`, {
        srcToken: fromToken,
        destToken: toToken,
        srcAmount: amount,
        destAmount: priceRoute.destAmount,
        priceRoute: priceRoute,
        userAddress: this.userAddress,
        slippage: slippage * 100
      })

      return {
        fromTokenAmount: amount,
        toTokenAmount: priceRoute.destAmount,
        estimatedGas: priceRoute.gasCost,
        transaction: transactionResponse.data,
        aggregator: 'paraswap'
      }
    } catch (error) {
      console.error('Paraswap quote error:', error.message)
      return null
    }
  }

  async get0xQuote(chainId, fromToken, toToken, amount, slippage) {
    try {
      const response = await axios.get(`${this.odoisBaseURL}/quote`, {
        params: {
          sellToken: fromToken,
          buyToken: toToken,
          sellAmount: amount,
          slippagePercentage: slippage / 100
        }
      })

      return {
        fromTokenAmount: amount,
        toTokenAmount: response.data.buyAmount,
        estimatedGas: response.data.estimatedGas,
        transaction: response.data,
        aggregator: '0x'
      }
    } catch (error) {
      console.error('0x quote error:', error.message)
      return null
    }
  }

  async executeSwap(quote, walletAddress, provider) {
    const { aggregator, transaction } = quote
    
    try {
      if (aggregator === '1inch') {
        return await this.execute1InchSwap(transaction, walletAddress, provider)
      } else if (aggregator === 'paraswap') {
        return await this.executeParaswapSwap(transaction, walletAddress, provider)
      } else if (aggregator === '0x') {
        return await this.execute0xSwap(transaction, walletAddress, provider)
      }
    } catch (error) {
      console.error('Error executing swap:', error)
      throw error
    }
  }

  async execute1InchSwap(transactionData, walletAddress, provider) {
    const tx = await provider.sendTransaction({
      to: transactionData.to,
      data: transactionData.data,
      value: transactionData.value || 0,
      gasLimit: transactionData.gas || 300000
    })
    
    return await tx.wait()
  }

  async executeParaswapSwap(transactionData, walletAddress, provider) {
    const tx = await provider.sendTransaction({
      to: transactionData.to,
      data: transactionData.data,
      value: transactionData.value || 0,
      gasLimit: transactionData.gasLimit
    })
    
    return await tx.wait()
  }

  async execute0xSwap(transactionData, walletAddress, provider) {
    const tx = await provider.sendTransaction({
      to: transactionData.to,
      data: transactionData.data,
      value: transactionData.value || 0,
      gasLimit: transactionData.gas
    })
    
    return await tx.wait()
  }
}

export default new DexAggregatorService()