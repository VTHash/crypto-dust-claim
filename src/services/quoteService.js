import axios from 'axios'

const ONEINCH = {
  1: 'https://api.1inch.io/v5.0/1',
  10: 'https://api.1inch.io/v5.0/10',
  137: 'https://api.1inch.io/v5.0/137',
  42161: 'https://api.1inch.io/v5.0/42161',
  8453: 'https://api.1inch.io/v5.0/8453',
}

const PARASWAP_BASE = 'https://api.paraswap.io'

export async function bestQuote({ chainId, fromToken, toToken, amount }) {
  const [oneInch, paraswap] = await Promise.allSettled([
    oneInchQuote(chainId, fromToken, toToken, amount),
    paraswapQuote(chainId, fromToken, toToken, amount),
  ])

  const quotes = []
  if (oneInch.status === 'fulfilled') quotes.push({ ...oneInch.value, aggregator: '1inch' })
  if (paraswap.status === 'fulfilled') quotes.push({ ...paraswap.value, aggregator: 'paraswap' })

  if (!quotes.length) throw new Error('No quotes available')
  quotes.sort((a, b) => Number(b.toTokenAmount) - Number(a.toTokenAmount))
  return quotes[0]
}

async function oneInchQuote(chainId, fromToken, toToken, amount) {
  const base = ONEINCH[chainId]
  const { data } = await axios.get(`${base}/quote`, {
    params: {
      fromTokenAddress: fromToken,
      toTokenAddress: toToken,
      amount,
    },
  })
  // data.tx is usually for swap; we use it during execution
  return { toTokenAmount: data.toTokenAmount, tx: data.tx }
}

async function paraswapQuote(chainId, fromToken, toToken, amount) {
  const { data } = await axios.get(`${PARASWAP_BASE}/prices`, {
    params: {
      srcToken: fromToken,
      destToken: toToken,
      srcAmount: amount,
      side: 'SELL',
      network: chainId,
    },
  })
  return { toTokenAmount: data?.priceRoute?.destAmount, route: data?.priceRoute }
}