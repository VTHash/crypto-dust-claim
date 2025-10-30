import { ethers } from 'ethers'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import priceService from './priceService'

/**
 * Tiny registry of popular tokens per chain.
 * - Add more anytime; balances are only queried if the token exists here.
 * - decimals are only needed if you later format or prefetch; we read them live anyway.
 * - coingeckoId lets us price a token even if your priceService doesn’t know the on-chain address.
 */
const TOKEN_REGISTRY = {
  '1': [ // Ethereum
    { symbol: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', coingeckoId: 'tether' },
    { symbol: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', coingeckoId: 'usd-coin' },
    { symbol: 'DAI', address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', coingeckoId: 'dai' },
    { symbol: 'WBTC', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', coingeckoId: 'wrapped-bitcoin' },
    { symbol: 'UNI', address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', coingeckoId: 'uniswap' },
    { symbol: 'AAVE', address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', coingeckoId: 'aave' },
    { symbol: 'SHIB', address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', coingeckoId: 'shiba-inu' },
    { symbol: 'MODE', address: '0x9999999999993E3eA5A88fC4FfC9E77d67d0e02A', coingeckoId: 'mode' }, // example; confirm actual
    { symbol: 'VXV', address: '0x7D29A64504629172a429e64183D6673b9dAcbB8c', coingeckoId: 'vectorspace' },
    { symbol: 'AERGO',address: '0x91Af0fBb28ABA7E31403Cb457106Ce79397FD4E6', coingeckoId: 'aergo' },
    { symbol: 'VIDT-OLD', address: '0x445f51299Ef3307dbd75036dd896565F5B4BF7A5', coingeckoId: 'vidt-datalink' },
  ],
  '137': [ // Polygon PoS
    { symbol: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', coingeckoId: 'tether' },
    { symbol: 'USDC', address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', coingeckoId: 'usd-coin' },
    { symbol: 'DAI', address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', coingeckoId: 'dai' },
  ],
  '42161': [ // Arbitrum
    { symbol: 'USDC', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', coingeckoId: 'usd-coin' },
    { symbol: 'USDT', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', coingeckoId: 'tether' },
  ],
  '10': [ // Optimism
    { symbol: 'USDC', address: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', coingeckoId: 'usd-coin' },
    { symbol: 'USDT', address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', coingeckoId: 'tether' },
  ],
  '56': [ // BNB Chain
    { symbol: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955', coingeckoId: 'tether' },
    { symbol: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', coingeckoId: 'usd-coin' },
    { symbol: 'DAI', address: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3', coingeckoId: 'dai' },
    // add your deployed DustClaim BNB token(s) here if you want to scan them:
    // { symbol: 'HFV', address: '0x...', coingeckoId: 'hfv-protocol' },
  ],
  // add Base(8453), Mode(34443), Linea(59144), Gnosis(100) etc. as you enable pricing
}

/** normalize to string keys */
const toKey = (id) => String(id)

/** small helpers */
const erc20Abi = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]

class Web3Service {
  constructor() {
    this.providers = {}
    this.initializeProviders()
  }

  initializeProviders() {
    this.providers = {}
    Object.entries(SUPPORTED_CHAINS).forEach(([id, chain]) => {
      if (!chain?.rpcUrl) return
      try {
        this.providers[toKey(id)] = new ethers.JsonRpcProvider(chain.rpcUrl, Number(id))
      } catch (e) {
        console.warn(`RPC init failed for chain ${id}`, e)
      }
    })
  }

  getProvider(chainId) {
    const id = toKey(chainId)
    const p = this.providers[id]
    if (!p) console.warn(`No provider for chain ${id}. Check SUPPORTED_CHAINS.rpcUrl`)
    return p
  }

  async getBalance(chainId, address) {
    try {
      const provider = this.getProvider(chainId)
      if (!provider) return '0'
      const balance = await provider.getBalance(address)
      return ethers.formatEther(balance)
    } catch (e) {
      console.error(`getBalance(${chainId})`, e)
      return '0'
    }
  }

  async getErc20Balance(chainId, tokenAddress, user) {
    try {
      const provider = this.getProvider(chainId)
      if (!provider) return { amount: '0', decimals: 18 }
      const c = new ethers.Contract(tokenAddress, erc20Abi, provider)
      const [raw, dec] = await Promise.all([c.balanceOf(user), c.decimals()])
      return { amount: ethers.formatUnits(raw, dec), decimals: Number(dec) }
    } catch (e) {
      console.warn(`getErc20Balance(${chainId}, ${tokenAddress})`, e)
      return { amount: '0', decimals: 18 }
    }
  }

  /**
   * Scan registry tokens on the chain for non-zero balances.
   */
  async getTokenBalances(chainId, address) {
    const key = toKey(chainId)
    const list = TOKEN_REGISTRY[key] || []
    const results = []

    // query sequentially to be RPC-friendly
    for (const t of list) {
      const { amount } = await this.getErc20Balance(key, t.address, address)
      if (parseFloat(amount) > 0) {
        results.push({
          symbol: t.symbol,
          address: t.address,
          chainId: Number(key),
          balance: amount,
          coingeckoId: t.coingeckoId || null,
        })
      }
    }
    return results
  }

  /**
   * A “dust” pass that:
   * - flags tiny native balances
   * - collects small ERC-20 balances from the token registry
   * Thresholds can be tuned per your UX.
   */
  async checkForDust(chainId, address) {
    const key = toKey(chainId)
    const nativeBalance = await this.getBalance(key, address)
    const tokenBalances = await this.getTokenBalances(key, address)

    const NATIVE_DUST_MAX = 0.002 // ~2e-3 ETH (tweak if you like)
    const TOKEN_DUST_MAX = 5 // up to $5 is “dust” (pricing comes later)

    // Don’t try to price yet; simply carry balances forward.
    const nativeDust = parseFloat(nativeBalance) > 0 && parseFloat(nativeBalance) < NATIVE_DUST_MAX
    const tokenDust = tokenBalances // keep all; pricing will filter if needed

    return {
      chainId: Number(key),
      nativeBalance,
      nativeDust,
      tokenDust,
      hasDust: nativeDust || tokenDust.length > 0
    }
  }

  /**
   * Price helper that tries (1) by token address, then (2) by CoinGecko id.
   * Returns a map { addressLower: price } and a second map { cgId: price }.
   */
  async resolveTokenPrices(chainId, tokens = []) {
    const addrs = tokens.map(t => t.address.toLowerCase())
    const cgIds = tokens.filter(t => t.coingeckoId).map(t => t.coingeckoId)

    // Prefer address-based prices
    const byAddress = addrs.length
      ? await priceService.getTokenUsdPrices(Number(chainId), addrs).catch(() => ({}))
      : {}

    // Fill what’s missing with CoinGecko ID pricing
    const missing = tokens.filter(t => !byAddress[t.address.toLowerCase()] && t.coingeckoId)
    let byCg = {}
    if (missing.length) {
      byCg = await priceService
        .getCoinGeckoPrices(missing.map(m => m.coingeckoId))
        .catch(() => ({}))
    }

    return { byAddress, byCg }
  }

  async getUSDValue(chainId, nativeBalance, tokenDust = []) {
    try {
      const id = Number(chainId)
      let total = 0

      const nativePrice = await priceService.getNativeUsdPrice(id)
      total += parseFloat(nativeBalance || '0') * (nativePrice || 0)

      if (tokenDust.length) {
        const { byAddress, byCg } = await this.resolveTokenPrices(id, tokenDust)
        for (const t of tokenDust) {
          const p = byAddress[t.address.toLowerCase()] || (t.coingeckoId ? byCg[t.coingeckoId] : 0) || 0
          total += parseFloat(t.balance || '0') * p
        }
      }

      return Number(total.toFixed(6))
    } catch (e) {
      console.error(`getUSDValue(${chainId})`, e)
      return 0
    }
  }

  /**
   * Full analysis for Dashboard cards (with per-token pricing breakdown).
   */
  async getDetailedDustAnalysis(chainId, address) {
    const base = await this.checkForDust(chainId, address)
    const id = Number(chainId)

    const nativePrice = await priceService.getNativeUsdPrice(id)
    const nativeValue = parseFloat(base.nativeBalance || '0') * (nativePrice || 0)

    let tokenDetails = []
    if (base.tokenDust.length) {
      const { byAddress, byCg } = await this.resolveTokenPrices(id, base.tokenDust)
      tokenDetails = base.tokenDust.map(t => {
        const price = byAddress[t.address.toLowerCase()] || (t.coingeckoId ? byCg[t.coingeckoId] : 0) || 0
        return { ...t, price, value: parseFloat(t.balance || '0') * price }
      })
    }

    const totalValue = Number((nativeValue + tokenDetails.reduce((s, t) => s + t.value, 0)).toFixed(6))
    return { ...base, nativePrice, nativeValue, tokenDetails, totalValue }
  }
}

export default new Web3Service()
