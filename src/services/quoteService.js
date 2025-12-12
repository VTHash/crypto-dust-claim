import axios from 'axios'

// 0x API hosts are chain-specific
const ZEROX_HOST_BY_CHAIN = {
  1: 'https://api.0x.org',
  10: 'https://optimism.api.0x.org',
  56: 'https://bsc.api.0x.org',
  137: 'https://polygon.api.0x.org',
  42161: 'https://arbitrum.api.0x.org',
  8453: 'https://base.api.0x.org',
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
