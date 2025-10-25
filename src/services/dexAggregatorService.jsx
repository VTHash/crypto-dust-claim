import axios from 'axios'
import { ethers } from 'ethers'

/**
 * Minimal WETH map for common chains.
 * Extend as needed for your supported networks.
 */
const WETH_BY_CHAIN = {
  1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // Mainnet WETH
  10: '0x4200000000000000000000000000000000000006', // OP WETH
  137: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', // Polygon WETH
  42161:'0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // Arbitrum WETH
  56: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8' // BSC ETH (wormhole), 0x uses WETH-like, adjust if needed
}

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
    this.zeroXBaseURL = 'https://api.0x.org/swap/v1'
  }

  // ---------------------------
  // Public: best of 1inch / Paraswap / 0x
  // ---------------------------
  async getBestQuote(chainId, fromToken, toToken, amount, slippage = 1) {
    try {
      const quotes = await Promise.allSettled([
        this.get1InchQuote(chainId, fromToken, toToken, amount),
        this.getParaswapQuote(chainId, fromToken, toToken, amount, slippage),
        this.get0xQuote(chainId, fromToken, toToken, amount, slippage)
      ])

      const valid = quotes
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value)

      if (!valid.length) throw new Error('No quotes available from aggregators')

      // Sort by highest buy amount
      valid.sort((a, b) => {
        const A = BigInt(a.toTokenAmount || '0')
        const B = BigInt(b.toTokenAmount || '0')
        return B > A ? 1 : B < A ? -1 : 0
      })

      return valid[0]
    } catch (err) {
      console.error('Error getting best quote:', err)
      throw err
    }
  }

  // ---------------------------
  // 1inch
  // ---------------------------
  async get1InchQuote(chainId, fromToken, toToken, amount) {
    try {
      const base = this.oneInchBaseURLs[chainId]
      if (!base) throw new Error(`1inch not supported on chain ${chainId}`)

      // 1inch /quote does not apply slippage; just returns raw amounts
      const { data } = await axios.get(`${base}/quote`, {
        params: {
          fromTokenAddress: fromToken,
          toTokenAddress: toToken,
          amount
        }
      })

      return {
        fromTokenAmount: amount,
        toTokenAmount: data?.toTokenAmount ?? '0',
        estimatedGas: data?.estimatedGas ?? null,
        transaction: null,
        aggregator: '1inch'
      }
    } catch (error) {
      console.error('1inch quote error:', error?.response?.data || error.message)
      return null
    }
  }

  // ---------------------------
  // ParaSwap
  // ---------------------------
  async getParaswapQuote(chainId, fromToken, toToken, amount, slippage = 1) {
    try {
      // 1) Pricing
      const priceRouteResponse = await axios.get(`${this.paraswapBaseURL}/prices`, {
        params: {
          srcToken: fromToken,
          destToken: toToken,
          srcAmount: amount,
          side: 'SELL',
          network: chainId
        }
      })

      const priceRoute = priceRouteResponse?.data?.priceRoute
      if (!priceRoute) return null

      // We do not build tx here (needs user address); just return amounts
      return {
        fromTokenAmount: amount,
        toTokenAmount: priceRoute.destAmount ?? '0',
        estimatedGas: priceRoute.gasCost ?? null,
        transaction: null,
        aggregator: 'paraswap'
      }
    } catch (error) {
      console.error('Paraswap quote error:', error?.response?.data || error.message)
      return null
    }
  }

  // ---------------------------
  // 0x
  // ---------------------------
  async get0xQuote(chainId, fromToken, toToken, amount, slippage = 1) {
    try {
      // 0x main hosted supports certain chains (1, 137, 56, 10, 42161, 8453, ...)
      // For non-supported chains, this will 4xx.
      const { data } = await axios.get(`${this.zeroXBaseURL}/quote`, {
        params: {
          sellToken: fromToken,
          buyToken: toToken,
          sellAmount: amount,
          slippagePercentage: slippage / 100
        },
        // If you need chain-specific hosts (e.g. Base), switch the base URL by chain
      })

      return {
        fromTokenAmount: amount,
        toTokenAmount: data?.buyAmount ?? '0',
        estimatedGas: data?.estimatedGas ?? null,
        transaction: data ?? null,
        aggregator: '0x'
      }
    } catch (error) {
      console.error('0x quote error:', error?.response?.data || error.message)
      return null
    }
  }

  // ============================================================
  // Helpers your UI expects (safe, compile-ready stubs)
  // ============================================================

  /**
   * Quote a single-token sell -> WETH using 1inch.
   * Returns minOut (with slippage buffer) for UI/contract calls.
   * NOTE: We DO NOT fabricate router `swapData` here — that requires a backend.
   */
  async quoteOneInchSingle({ chainId, tokenIn, amount, slippageBps = 100 }) {
    const weth = WETH_BY_CHAIN[Number(chainId)]
    if (!weth) return null

    const q = await this.get1InchQuote(chainId, tokenIn, weth, amount)
    if (!q?.toTokenAmount) return null

    // Apply slippage buffer (basis points: 100 = 1%)
    const toAmt = BigInt(q.toTokenAmount)
    const minOutWei = (toAmt * BigInt(10000 - slippageBps)) / BigInt(10000)

    return {
      quotedMinOutWei: minOutWei.toString(),
      // For contract `swapData` you must use a backend that requests 1inch with
      // the contract as fromAddress and returns the executor data payload.
      calldata: null
    }
  }

  /**
   * Quote a batch of token sells -> WETH via 1inch.
   * Returns arrays aligned with tokens input (no calldata here).
   * items = [{ chainId, token, amount }]
   */
  async quoteOneInchBatch(items = [], slippageBps = 100) {
    const tokens = []
    const minOutsWei = []
    const datas = [] // kept for shape compatibility; left nulls

    for (const it of items) {
      const res = await this.quoteOneInchSingle({
        chainId: it.chainId,
        tokenIn: it.token,
        amount: it.amount,
        slippageBps
      })
      if (res?.quotedMinOutWei) {
        tokens.push(it.token)
        minOutsWei.push(res.quotedMinOutWei)
        datas.push('0x') // placeholder; real contract path needs backend-built data
      }
    }

    if (!tokens.length) return null
    return { tokens, minOutsWei, datas }
  }

  /**
   * “Quote” Uniswap V3 single hop token -> WETH.
   * Without an onchain quoter or subgraph backend, we can only provide
   * a neutral minOut (0) and a suggested fee. This is enough for your UI to
   * **show the button**, and your contract will enforce real minReturnAmount.
   */
  async quoteUniswapSingle({ chainId, tokenIn, amount, fee = 3000, ttlSec = 900 }) {
    const weth = WETH_BY_CHAIN[Number(chainId)]
    if (!weth) return null

    // If you add an onchain quoter backend, compute a true minOutWei here.
    return {
      fee,
      minOutWei: '0', // placeholder; safe but no slippage protection
      ttlSec
    }
  }

  // ============================================================
  // Execution helpers (use an ethers v6 Signer)
  // ============================================================

  /**
   * Execute an EOA-style swap transaction (when aggregator returns ready tx).
   * `signer` must be an ethers v6 Signer.
   */
  async executeSwap(quote, signer) {
    const { aggregator, transaction } = quote || {}
    if (!signer || !transaction) throw new Error('Missing signer or transaction')

    if (aggregator === '1inch') {
      return this.executeDirectTx(transaction, signer, /*fallbackGas*/ 300000n)
    } else if (aggregator === 'paraswap') {
      return this.executeDirectTx(transaction, signer, /*fallbackGas*/ 350000n)
    } else if (aggregator === '0x') {
      return this.executeDirectTx(transaction, signer, /*fallbackGas*/ 300000n)
    }

    throw new Error('Unsupported aggregator for execution')
  }

  /**
   * Normalize, then signer.sendTransaction.
   */
  async executeDirectTx(txData, signer, fallbackGas = 300000n) {
    const to = txData.to
    const data = txData.data
    if (!to || !data) throw new Error('Malformed tx data')

    // Normalize values for ethers v6
    const value =
      txData.value != null
        ? (typeof txData.value === 'string'
            ? BigInt(txData.value)
            : BigInt(txData.value))
        : 0n

    const gasLimitRaw =
      txData.gas ?? txData.gasLimit ?? txData.gasLimitHex ?? null
    const gasLimit =
      gasLimitRaw != null
        ? (typeof gasLimitRaw === 'string' ? BigInt(gasLimitRaw) : BigInt(gasLimitRaw))
        : fallbackGas

    const tx = await signer.sendTransaction({ to, data, value, gasLimit })
    return await tx.wait()
  }
}

export default new DexAggregatorService()