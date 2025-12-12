import axios from 'axios'

// 0x Swap API hosts per chain (19 supported chains)
export const ZEROX_HOST_BY_CHAIN = {
  1: 'https://api.0x.org',                 // Ethereum (Mainnet)

  10: 'https://optimism.api.0x.org',        // Optimism
  56: 'https://bsc.api.0x.org',             // BSC
  130: 'https://unichain.api.0x.org',       // Unichain
  137: 'https://polygon.api.0x.org',        // Polygon
  143: 'https://monad.api.0x.org',          // Monad
  146: 'https://sonic.api.0x.org',          // Sonic
  480: 'https://worldchain.api.0x.org',     // World Chain
  5000: 'https://mantle.api.0x.org',        // Mantle
  9745: 'https://plasma.api.0x.org',        // Plasma

  42161: 'https://arbitrum.api.0x.org',     // Arbitrum
  43114: 'https://avalanche.api.0x.org',    // Avalanche
  534352: 'https://scroll.api.0x.org',      // Scroll
  59144: 'https://linea.api.0x.org',        // Linea

  80094: 'https://berachain.api.0x.org',    // Berachain
  81457: 'https://blast.api.0x.org',        // Blast
  34443: 'https://mode.api.0x.org',         // Mode
  8453: 'https://base.api.0x.org',          // Base
  57073: 'https://ink.api.0x.org',          // Ink
}

export async function bestQuote({
  chainId,
  fromToken,
  toToken,
  amount,
  slippagePct = 1,
  takerAddress, // optional (recommended if you want an executable tx)
}) {
  const q = await zeroXQuote({
    chainId,
    fromToken,
    toToken,
    amount,
    slippagePct,
    takerAddress,
  })

  if (!q) throw new Error(`0x unsupported or no quote for chain ${chainId}`)
  return { ...q, aggregator: '0x' }
}

async function zeroXQuote({
  chainId,
  fromToken,
  toToken,
  amount,
  slippagePct = 1,
  takerAddress,
}) {
  const host = ZEROX_HOST_BY_CHAIN[Number(chainId)]
  if (!host) return null

  const params = {
    sellToken: fromToken,
    buyToken: toToken,
    sellAmount: String(amount),
    slippagePercentage: Number(slippagePct) / 100,
  }

  // If provided, 0x will include an executable tx payload tailored to taker
  if (takerAddress) params.takerAddress = takerAddress

  const { data } = await axios.get(`${host}/swap/v1/quote`, { params })

  return {
    // normalize to match what your app already expects
    toTokenAmount: data?.buyAmount ?? '0',
    tx: {
      to: data?.to,
      data: data?.data,
      value: data?.value ?? '0',
      gas: data?.gas,
      gasPrice: data?.gasPrice,
      allowanceTarget: data?.allowanceTarget, // IMPORTANT for approvals
    },
    // keep raw in case you need more fields
    raw: data,
  }
}
