import { ethers } from 'ethers'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import priceService from './priceService'

const toKey = (id) => String(id)

// Adjust to taste
const DUST_THRESHOLDS = {
  native: 0.001, // e.g., ETH < 0.001
  token: 0.01 // token units < 0.01
}

class Web3Service {
  constructor() {
    this.providers = {}
    this.initializeProviders()
  }

  initializeProviders() {
    this.providers = {}
    Object.keys(SUPPORTED_CHAINS).forEach((rawId) => {
      const id = toKey(rawId)
      const chain = SUPPORTED_CHAINS[id]
      if (!chain?.rpcUrl) return
      try {
        this.providers[id] = new ethers.JsonRpcProvider(chain.rpcUrl, Number(id))
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

  // ---------- balances ----------
  async getBalance(chainId, address) {
    try {
      const provider = this.getProvider(chainId)
      if (!provider) return '0'
      const balance = await provider.getBalance(address)
      return ethers.formatEther(balance)
    } catch {
      return '0'
    }
  }

  async _readErc20Balance(provider, tokenAddress, userAddress) {
    const abi = [
      'function balanceOf(address) view returns (uint256)',
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)'
    ]
    const c = new ethers.Contract(tokenAddress, abi, provider)
    const [raw, decimals, symbol] = await Promise.all([
      c.balanceOf(userAddress),
      c.decimals(),
      c.symbol().catch(() => '') // some tokens throw on symbol()
    ])
    return { amount: ethers.formatUnits(raw, decimals), decimals, symbol }
  }

  // Curated token list per chain (extend any time)
  TOKENS = {
    '1': {
      USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
      UNI: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
      // add MODE, AAVE, SHIB, etc. by address if you want them visible too
    },
    '10': {
      USDC: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
      USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    },
    '137': {
      USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
      DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    },
    '42161': {
      USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    },
    '56': {
      USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      USDT: '0x55d398326f99059fF775485246999027B3197955',
    }
    // …add the rest of the chains you’ve enabled
  }

  async getTokenBalances(chainId, address) {
    const key = toKey(chainId)
    const entries = Object.entries(this.TOKENS[key] || {})
    if (!entries.length) return []

    const provider = this.getProvider(key)
    if (!provider) return []

    const out = []
    for (const [symbolGuess, token] of entries) {
      try {
        const { amount, decimals, symbol } = await this._readErc20Balance(provider, token, address)
        const bal = parseFloat(amount)
        if (bal > 0) {
          out.push({
            symbol: symbol || symbolGuess,
            balance: amount,
            address: token,
            decimals,
            chainId: Number(key)
          })
        }
      } catch {
        // ignore single token failures
      }
    }
    return out
  }

  // ---------- valuation + dust marking ----------
  async getDetailedChainView(chainId, address) {
    const key = Number(chainId)
    const symbol = SUPPORTED_CHAINS[key]?.symbol || 'ETH'

    const nativeBalance = await this.getBalance(key, address)
    const tokens = await this.getTokenBalances(key, address)

    const nativePrice = await priceService.getNativeUsdPrice(key)
    const nativeValue = parseFloat(nativeBalance || '0') * (nativePrice || 0)

    const tokenAddrs = tokens.map(t => t.address.toLowerCase())
    const priceMap = tokenAddrs.length
      ? await priceService.getTokenUsdPrices(key, tokenAddrs)
      : {}

    const tokenDetails = tokens.map((t) => {
      const price = priceMap[t.address.toLowerCase()] || 0
      const value = parseFloat(t.balance) * price
      return { ...t, price, value }
    })

    // mark dust, but still return everything for display
    const isNativeDust = parseFloat(nativeBalance) > 0 && parseFloat(nativeBalance) < DUST_THRESHOLDS.native
    const claimableTokens = tokenDetails.filter(t => parseFloat(t.balance) < DUST_THRESHOLDS.token)

    const totalValue = Number((nativeValue + tokenDetails.reduce((s, x) => s + x.value, 0)).toFixed(6))

    return {
      chainId: key,
      chainName: SUPPORTED_CHAINS[key]?.name || `Chain ${key}`,
      symbol,
      nativeBalance,
      nativePrice,
      nativeValue,
      tokenDetails, // all tokens (for UI)
      claimableTokens, // only dust (for plan)
      hasDust: isNativeDust || claimableTokens.length > 0,
      totalValue
    }
  }

  // bulk scan helper – always returns *all* chains requested
  async scanChains(chainIds, address) {
    const out = []
    for (const id of chainIds) {
      try { out.push(await this.getDetailedChainView(id, address)) }
      catch (e) {
        console.warn('scan error for chain', id, e?.message)
      }
    }
    return out
  }
}

export default new Web3Service()