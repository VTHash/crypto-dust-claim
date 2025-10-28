import axios from 'axios'

/**
 * Wrapped native tokens for "swap → unwrap to native".
 * (We call the variable WRAPPED_NATIVE... but many chains still name the contract WETH.)
 */
const WRAPPED_NATIVE_BY_CHAIN = {
  1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // Ethereum: WETH
  10: '0x4200000000000000000000000000000000000006', // Optimism: WETH
  137:'0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // Polygon: WMATIC
  42161:'0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // Arbitrum: WETH
  56: '0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // BNB Chain: WBNB
  8453:'0x4200000000000000000000000000000000000006', // Base: WETH
  // Add more as needed (Linea, Gnosis, etc.) when you enable them via aggregators
}

/**
 * 0x API hosts are chain-specific. Use the correct base for each chain.
 * (These are the official public endpoints; unsupported chains should return null.)
 */
const ZEROX_HOST_BY_CHAIN = {
  1: 'https://api.0x.org',
  10: 'https://optimism.api.0x.org',
  56: 'https://bsc.api.0x.org',
  137: 'https://polygon.api.0x.org',
  42161:'https://arbitrum.api.0x.org',
  8453: 'https://base.api.0x.org',
}

/** Normalize amount to a decimal string (wei) for HTTP calls */
const toAmountStr = (amount) =>
  typeof amount === 'bigint' ? amount.toString() : String(amount ?? '0')

class DexAggregatorService {
  constructor() {
    // 1inch supported hosts we plan to use
    this.oneInchBaseURLs = {
      1: 'https://api.1inch.io/v5.0/1',
      10: 'https://api.1inch.io/v5.0/10',
      56: 'https://api.1inch.io/v5.0/56',
      137: 'https://api.1inch.io/v5.0/137',
      42161: 'https://api.1inch.io/v5.0/42161',
      8453: 'https://api.1inch.io/v5.0/8453',
    }

    // Paraswap main endpoints
    this.paraswapBaseURL = 'https://api.paraswap.io/v2'
  }

  // ---------------------------------------------------------------------------
  // Best-quote selector across 1inch / ParaSwap / 0x
  // ---------------------------------------------------------------------------
  async getBestQuote(chainId, fromToken, toToken, amount, slippagePct = 1) {
    const amt = toAmountStr(amount)
    try {
      const quotes = await Promise.allSettled([
        this.get1InchQuote(chainId, fromToken, toToken, amt),
        this.getParaswapQuote(chainId, fromToken, toToken, amt, slippagePct),
        this.get0xQuote(chainId, fromToken, toToken, amt, slippagePct),
      ])

      const valid = quotes
        .filter((r) => r.status === 'fulfilled' && r.value)
        .map((r) => r.value)

      if (!valid.length) throw new Error('No quotes available from aggregators')

      // Pick the highest output amount
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

  // ---------------------------------------------------------------------------
  // 1inch
  // ---------------------------------------------------------------------------
  async get1InchQuote(chainId, fromToken, toToken, amount) {
    try {
      const base = this.oneInchBaseURLs[Number(chainId)]
      if (!base) throw new Error(`1inch not supported on chain ${chainId}`)

      // 1inch /quote is a pure quote (no slippage/tx)
      const { data } = await axios.get(`${base}/quote`, {
        params: {
          fromTokenAddress: fromToken,
          toTokenAddress: toToken,
          amount: toAmountStr(amount),
        },
      })

      return {
        fromTokenAmount: toAmountStr(amount),
        toTokenAmount: data?.toTokenAmount ?? '0',
        estimatedGas: data?.estimatedGas ?? null,
        transaction: null,
        aggregator: '1inch',
      }
    } catch (error) {
      console.error('1inch quote error:', error?.response?.data || error.message)
      return null
    }
  }

  // ---------------------------------------------------------------------------
  // ParaSwap (prices only; tx needs user address & /transactions)
  // ---------------------------------------------------------------------------
  async getParaswapQuote(chainId, fromToken, toToken, amount, _slippagePct = 1) {
    try {
      const { data } = await axios.get(`${this.paraswapBaseURL}/prices`, {
        params: {
          srcToken: fromToken,
          destToken: toToken,
          srcAmount: toAmountStr(amount),
          side: 'SELL',
          network: Number(chainId),
        },
      })

      const route = data?.priceRoute
      if (!route) return null

      return {
        fromTokenAmount: toAmountStr(amount),
        toTokenAmount: route.destAmount ?? '0',
        estimatedGas: route.gasCost ?? null,
        transaction: null,
        aggregator: 'paraswap',
      }
    } catch (error) {
      console.error('Paraswap quote error:', error?.response?.data || error.message)
      return null
    }
  }

  // ---------------------------------------------------------------------------
  // 0x (chain-specific hosts)
  // ---------------------------------------------------------------------------
  async get0xQuote(chainId, fromToken, toToken, amount, slippagePct = 1) {
    try {
      const host = ZEROX_HOST_BY_CHAIN[Number(chainId)]
      if (!host) return null // 0x may not support this chain

      const { data } = await axios.get(`${host}/swap/v1/quote`, {
        params: {
          sellToken: fromToken,
          buyToken: toToken,
          sellAmount: toAmountStr(amount),
          slippagePercentage: Number(slippagePct) / 100,
        },
      })

      return {
        fromTokenAmount: toAmountStr(amount),
        toTokenAmount: data?.buyAmount ?? '0',
        estimatedGas: data?.estimatedGas ?? null,
        transaction: data ?? null, // full tx if you want to send directly with signer
        aggregator: '0x',
      }
    } catch (error) {
      console.error('0x quote error:', error?.response?.data || error.message)
      return null
    }
  }

  // ===========================================================================
  // Helpers your UI expects (safe stubs — you can wire a backend later)
  // ===========================================================================

  /**
   * Quote a single-token sell → wrapped-native via 1inch, return a minOut buffer.
   * We do NOT fabricate router calldata in the browser. Use a backend for that.
   */
  async quoteOneInchSingle({ chainId, tokenIn, amount, slippageBps = 100 }) {
    const wrapped = WRAPPED_NATIVE_BY_CHAIN[Number(chainId)]
    if (!wrapped) return null

    const q = await this.get1InchQuote(chainId, tokenIn, wrapped, toAmountStr(amount))
    if (!q?.toTokenAmount) return null

    const toAmt = BigInt(q.toTokenAmount)
    const minOutWei = (toAmt * BigInt(10000 - Number(slippageBps))) / BigInt(10000)

    return {
      quotedMinOutWei: minOutWei.toString(),
      calldata: null, // build with backend if you want to call the contract path client-side
    }
  }

  /**
   * Quote a batch of sells → wrapped-native via 1inch.
   * Returns arrays aligned with tokens (datas = '0x' placeholders).
   */
  async quoteOneInchBatch(items = [], slippageBps = 100) {
    const tokens = []
    const minOutsWei = []
    const datas = []

    for (const it of items) {
      const res = await this.quoteOneInchSingle({
        chainId: it.chainId,
        tokenIn: it.token,
        amount: it.amount,
        slippageBps,
      })
      if (res?.quotedMinOutWei) {
        tokens.push(it.token)
        minOutsWei.push(res.quotedMinOutWei)
        datas.push('0x') // placeholder; real calldata should come from a backend
      }
    }

    if (!tokens.length) return null
    return { tokens, minOutsWei, datas }
  }

  /**
   * “Quote” Uniswap V3 single hop token → wrapped-native.
   * Without an onchain quoter in the browser, we provide a neutral minOut (0).
   * Your contract enforces minReturnAmount the user supplies.
   */
  async quoteUniswapSingle({ chainId, tokenIn, amount, fee = 3000, ttlSec = 900 }) {
    const wrapped = WRAPPED_NATIVE_BY_CHAIN[Number(chainId)]
    if (!wrapped) return null

    return {
      fee,
      minOutWei: '0', // neutral; safe but no slippage protection
      ttlSec,
    }
  }

  // ===========================================================================
  // Execution helpers (when an aggregator returns a ready transaction object)
  // ===========================================================================

  async executeSwap(quote, signer) {
    const { aggregator, transaction } = quote || {}
    if (!signer || !transaction) throw new Error('Missing signer or transaction')

    // All of these provide a tx-like object { to, data, value, gas* }
    if (aggregator === '1inch') {
      return this.executeDirectTx(transaction, signer, 300000n)
    } else if (aggregator === 'paraswap') {
      return this.executeDirectTx(transaction, signer, 350000n)
    } else if (aggregator === '0x') {
      return this.executeDirectTx(transaction, signer, 300000n)
    }

    throw new Error('Unsupported aggregator for execution')
  }

  async executeDirectTx(txData, signer, fallbackGas = 300000n) {
    const to = txData.to
    const data = txData.data
    if (!to || !data) throw new Error('Malformed tx data')

    const value =
      txData.value != null
        ? (typeof txData.value === 'string' ? BigInt(txData.value) : BigInt(txData.value))
        : 0n

    const gasLimitRaw = txData.gas ?? txData.gasLimit ?? txData.gasLimitHex ?? null
    const gasLimit =
      gasLimitRaw != null
        ? (typeof gasLimitRaw === 'string' ? BigInt(gasLimitRaw) : BigInt(gasLimitRaw))
        : fallbackGas

    const tx = await signer.sendTransaction({ to, data, value, gasLimit })
    return await tx.wait()
  }
}

export default new DexAggregatorService()