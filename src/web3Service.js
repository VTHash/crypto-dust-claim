import { ethers } from 'ethers'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import priceService from './priceService'
import { discoverAllERC20s } from './tokenDiscoveryService'

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

  async getNativeBalance(chainId, address) {
    try {
      const provider = this.getProvider(chainId)
      if (!provider) return '0'
      const balance = await provider.getBalance(address)
      return ethers.formatEther(balance)
    } catch {
      return '0'
    }
  }

  // NEW: discover every ERC-20 on chain for the user
  async getTokenBalances(chainId, address) {
    const provider = this.getProvider(chainId)
    const discovered = await discoverAllERC20s({
      provider,
      chainId: Number(chainId),
      owner: address
    })

    // convert raw (wei strings) → human strings with decimals
    const out = []
    for (const t of discovered) {
      try {
        const human = ethers.formatUnits(t.balance, t.decimals ?? 18)
        if (parseFloat(human) > 0) {
          out.push({
            chainId: Number(chainId),
            address: t.address,
            symbol: t.symbol || 'TOKEN',
            decimals: t.decimals ?? 18,
            balance: human
          })
        }
      } catch {
        // ignore malformed
      }
    }
    return out
  }

  async checkForDust(chainId, address) {
    const key = toKey(chainId)
    const [nativeBalance, tokenBalances] = await Promise.all([
      this.getNativeBalance(key, address),
      this.getTokenBalances(key, address)
    ])

    // define dust thresholds
    const nativeDust = parseFloat(nativeBalance) > 0 && parseFloat(nativeBalance) < 0.002
    const tokenDust = (tokenBalances || []).filter(t => parseFloat(t.balance) < 1) // < 1 token as "dust"

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
      const id = Number(chainId)
      let total = 0

      const nativePrice = await priceService.getNativeUsdPrice(id)
      total += (parseFloat(nativeBalance || '0') * (nativePrice || 0))

      if (tokenDust.length) {
        const addrs = tokenDust.map(t => t.address.toLowerCase())
        const priceMap = await priceService.getTokenUsdPrices(id, addrs)
        for (const t of tokenDust) {
          const p = priceMap[t.address.toLowerCase()] || 0
          total += parseFloat(t.balance || '0') * p
        }
      }
      return Number(total.toFixed(6))
    } catch (e) {
      console.error(`getUSDValue(${chainId}) error:`, e)
      return 0
    }
  }

  async getDetailedDustAnalysis(chainId, address) {
    const base = await this.checkForDust(chainId, address)

    const nativePrice = await priceService.getNativeUsdPrice(Number(chainId))
    const nativeValue = parseFloat(base.nativeBalance || '0') * (nativePrice || 0)

    const addrs = (base.tokenDust || []).map(t => t.address.toLowerCase())
    const priceMap = await priceService.getTokenUsdPrices(Number(chainId), addrs)

    const tokenDetails = (base.tokenDust || []).map(t => {
      const price = priceMap[t.address.toLowerCase()] || 0
      return { ...t, price, value: parseFloat(t.balance || '0') * price }
    })

    const totalValue = Number((nativeValue + tokenDetails.reduce((s, t) => s + t.value, 0)).toFixed(6))
    return { ...base, nativePrice, nativeValue, tokenDetails, totalValue }
  }
}

export default new Web3Service()