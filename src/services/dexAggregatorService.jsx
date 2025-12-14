import axios from 'axios'

/**
 * Wrapped native tokens for "swap → unwrap to native".
 * (We call the variable WRAPPED_NATIVE... but many chains still name the contract WETH.)
 */
const WRAPPED_NATIVE_BY_CHAIN = {
 1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // Ethereum WETH
  10: "0x4200000000000000000000000000000000000006", // Optimism WETH
  56: "0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // BNB Smart Chain WBNB
  100: "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d", // Gnosis WXDAI
  137: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // Polygon PoS WMATIC
  195: "", // X1 (no wrapped token yet)
  250: "0x21be370D5312F44cB42ce377BC9b8a0CeF1A4c83", // Fantom WFTM
  1329: "0xE30FeDd158A2e3b1e39EbaeABaFc5516e95e98C7", // Sei Network WSEI
  8453: "0x4200000000000000000000000000000000000006", // Base WETH
  34443:"0x4200000000000000000000000000000000000006", // Mode WETH
  42161:"0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // Arbitrum WETH
  43114:"0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", // Avalanche WAVAX
  59144:"0xE5D7C2a44FfDDf6b295A15c148167daaAf5Cf34F", // Linea WETH
  80094:"0x6969696969696969696969696969696969696969", // Berachain WBERA (canonical)
  7777777:"0x4200000000000000000000000000000000000006", // Zora WETH
  130: "0x4200000000000000000000000000000000000006", // Unichain WETH (Optimism stack)
  42220:"0x471EcE3750Da237f93B8E339c536989b8978a438", // Celo CELO (native wrapper)
  1313161554:"0xC9BdeEd33CD01541e1eeD10f90519d2C06Fe3feB", // Aurora WETH
  1284: "0xAcc15dC74880C9944775448304B263D191c6077F", // Moonbeam WGLMR
  1285: "0x98878B06940aE243284CA214f92Bb71a2b032B8A", // Moonriver WMOVR
  5000: "0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000", // Mantle WMNT
  9745: "0x4200000000000000000000000000000000000006", // Plasma WETH
  14: "0x1D80c49bBbCd1c0911346656B529dF9E5c2F783d", // Flare WFLR
  40: "0xD102cE6A4dB07D247fcc28F366A623Df0938CA9E", // Telos WTLOS
  50: "0x951857744785E80e2De051c32EE7b25f9c458c42", // XDC WXDC
  57: "0xd3e822f3Ef011Ca5F17D82C956D952D8d7C3A1BB", // Syscoin WSYS
  61: "0x82A618305706B14e7bcf2592D4B9324A366b6dAd", // ETC WETC
  57073: "0x4200000000000000000000000000000000000006",// Inkonchain WInk
  60808: "0x4200000000000000000000000000000000000006", // Bob WETH
  81457: "0x4300000000000000000000000000000000000004", // Blast
   1868:  "0x4200000000000000000000000000000000000006",// Soneium
   480: "0x4200000000000000000000000000000000000006",// Worldcoin
   1135:  "0x4200000000000000000000000000000000000006", // Lisk
   1923:  "0x4200000000000000000000000000000000000006", // Swellchain
   2741: "0x4200000000000000000000000000000000000006", // Abstract
   747474: "0x4200000000000000000000000000000000000006", // Katana
   146: "0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38", // Sonic native wrapper
    534352: "0x4200000000000000000000000000000000000006", // Scroll WETH
  167000: '0x4200000000000000000000000000000000000006', // Taiko WETH
  42170: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // Arbitrum Nova WETH
  28185: '0x5300000000000000000000000000000000000011', // Morph WMORPH,

   
  // Add more as needed (Linea, Gnosis, etc.) when you enable them via aggregators
}

/**
 * 0x API hosts are chain-specific. Use the correct base for each chain.
 */
const ZEROX_HOST_BY_CHAIN = {
  1: 'https://api.0x.org',
  10: 'https://optimism.api.0x.org',
  56: 'https://bsc.api.0x.org',
  137: 'https://polygon.api.0x.org',
  42161: 'https://arbitrum.api.0x.org',
  8453: 'https://base.api.0x.org',
}

/** Normalize amount to a decimal string (wei) for HTTP calls */
const toAmountStr = (amount) =>
  typeof amount === 'bigint' ? amount.toString() : String(amount ?? '0')

class DexAggregatorService {
  constructor() {
    // 0x only – no extra constructor state needed
  }

  // ---------------------------------------------------------------------------
  // Best-quote selector (0x only)
  // ---------------------------------------------------------------------------
      async getBestQuote(chainId, fromToken, toToken, amount, slippagePct = 1) {
    const amt = toAmountStr(amount)
    try {
      const quote = await this.get0xQuote(chainId, fromToken, toToken, amt, slippagePct)
      if (!quote) throw new Error('No quotes available from 0x')
      return quote
    } catch (err) {
      console.error('Error getting best quote (0x):', err)
      throw err
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
  // Helpers your UI expects (but 1inch is now DISABLED)
  // ===========================================================================

  /**
   * Previously: quote single-token → wrapped-native via 1inch.
   * Now: we DISABLE this and return null so the 1inch quick button disappears.
   */
  async quoteOneInchSingle(_opts) {
    // 1inch path disabled
    return null
  }

  /**
   * Previously: quote batch via 1inch.
   * Now: disabled, returns null.
   */
  async quoteOneInchBatch(_items = [], _slippageBps = 100) {
    // 1inch path disabled
    return null
  }

  /**
   * “Quote” Uniswap V3 single hop token → wrapped-native.
   * Still just returns neutral minOut=0 – your contract enforces slippage via user’s minReturn.
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

    if (aggregator === '0x') {
      return this.executeDirectTx(transaction, signer, 300000n)
    }

    throw new Error('Unsupported aggregator for execution (only 0x is enabled now)')
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
