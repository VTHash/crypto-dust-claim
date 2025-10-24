import { ethers } from 'ethers'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import priceService from './priceService'

/** Normalize to string keys because SUPPORTED_CHAINS often uses string ids */
const toKey = (id) => String(id)

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
        // ethers v6
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

  async getBalance(chainId, address) {
    try {
      const provider = this.getProvider(chainId)
      if (!provider) return '0'
      const balance = await provider.getBalance(address)
      return ethers.formatEther(balance)
    } catch (error) {
      console.error(`getBalance(${chainId}) error:`, error)
      return '0'
    }
  }

  async getTokenBalance(chainId, tokenAddress, userAddress) {
    try {
      const provider = this.getProvider(chainId)
      if (!provider) return '0'
      const abi = [
        'function balanceOf(address owner) view returns (uint256)',
        'function decimals() view returns (uint8)'
      ]
      const contract = new ethers.Contract(tokenAddress, abi, provider)
      const [raw, decimals] = await Promise.all([
        contract.balanceOf(userAddress),
        contract.decimals()
      ])
      return ethers.formatUnits(raw, decimals)
    } catch (e) {
      console.error(`getTokenBalance(${chainId}, ${tokenAddress}) error:`, e)
      return '0'
    }
  }

  async getTokenBalances(chainId, address) {
    // token lists per chain (extend as needed)
    const TOKENS = {
      '1': {
        USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
        UNI: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'
      },
      '137': {
        USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063'
      },
      '42161': {
        USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
      },
      '10': {
        USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
        USDC: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607'
      }
    }

    const key = toKey(chainId)
    const tokens = TOKENS[key] || {}
    const balances = []

    // Query sequentially (RPC friendly). Replace with Promise.all if your RPC can handle it.
    for (const [symbol, tokenAddress] of Object.entries(tokens)) {
      const bal = await this.getTokenBalance(key, tokenAddress, address)
      if (parseFloat(bal) > 0) {
        balances.push({
          symbol,
          balance: bal,
          address: tokenAddress,
          chainId: Number(key)
        })
      }
    }
    return balances
  }

  async checkForDust(chainId, address) {
    const key = toKey(chainId)
    const nativeBalance = await this.getBalance(key, address)
    const tokenBalances = await this.getTokenBalances(key, address)

    const nativeDust = parseFloat(nativeBalance) > 0 && parseFloat(nativeBalance) < 0.001
    const tokenDust = tokenBalances.filter(t => parseFloat(t.balance) < 0.01)

    return {
      chainId: Number(key),
      nativeBalance,
      nativeDust,
      tokenDust,
      hasDust: nativeDust || tokenDust.length > 0
    }
  }

  async getUSDValue(chainId, nativeBalance, tokenDust = []) {
    try {
      const key = toKey(chainId)
      let total = 0

      const nativePrice = await priceService.getNativeUsdPrice(Number(key))
      total += parseFloat(nativeBalance || '0') * (nativePrice || 0)

      if (tokenDust.length) {
        const addrs = tokenDust.map(t => t.address.toLowerCase())
        const priceMap = await priceService.getTokenUsdPrices(Number(key), addrs)
        for (const t of tokenDust) {
          const p = priceMap[t.address.toLowerCase()] || 0
          total += parseFloat(t.balance || '0') * p
        }
      }
      return Number(total.toFixed(6))
    } catch (e) {
      console.error(`getUSDValue(${chainId}) error:`, e)
      // Fallback heuristic
      const nativeValue = parseFloat(nativeBalance || '0') * 2500
      const tokenValue = (tokenDust || []).reduce((s, t) => s + parseFloat(t.balance || '0') * 1, 0)
      return Number((nativeValue + tokenValue).toFixed(6))
    }
  }

  async getDetailedDustAnalysis(chainId, address) {
    const base = await this.checkForDust(chainId, address)
    if (!base.hasDust) return { ...base, nativePrice: 0, nativeValue: 0, tokenDetails: [], totalValue: 0 }

    const nativePrice = await priceService.getNativeUsdPrice(Number(chainId))
    const nativeValue = parseFloat(base.nativeBalance || '0') * (nativePrice || 0)

    let tokenDetails = []
    if (base.tokenDust.length) {
      const addrs = base.tokenDust.map(t => t.address.toLowerCase())
      const priceMap = await priceService.getTokenUsdPrices(Number(chainId), addrs)
      tokenDetails = base.tokenDust.map(t => {
        const price = priceMap[t.address.toLowerCase()] || 0
        return {
          ...t,
          price,
          value: parseFloat(t.balance || '0') * price
        }
      })
    }

    const totalValue = Number((nativeValue + tokenDetails.reduce((s, t) => s + t.value, 0)).toFixed(6))
    return { ...base, nativePrice, nativeValue, tokenDetails, totalValue }
  }
}

export default new Web3Service()