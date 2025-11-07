import { ethers } from 'ethers'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import priceService from './priceService'
import { discoverAllERC20s } from './tokenDiscoveryService'

const toKey = (id) => String(id)

// very simple native dust flag (UI only)
const NATIVE_DUST_THRESHOLD = 0.001

class Web3Service {
  constructor () {
    this.providers = {}
    this.initializeProviders()
  }

  initializeProviders () {
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

  getProvider (chainId) {
    const id = toKey(chainId)
    const p = this.providers[id]
    if (!p) console.warn(`No provider for chain ${id}. Check SUPPORTED_CHAINS.rpcUrl`)
    return p
  }

  // ------------ low-level balance helpers ------------

  async getNativeBalance (chainId, address) {
    try {
      const provider = this.getProvider(chainId)
      if (!provider) return '0'
      const balance = await provider.getBalance(address)
      return ethers.formatEther(balance)
    } catch {
      return '0'
    }
  }

  // discover all ERC-20s held by the user on this chain
  async getTokenBalances (chainId, address) {
    const provider = this.getProvider(chainId)
    if (!provider) return []

    const discovered = await discoverAllERC20s({
      provider,
      chainId: Number(chainId),
      owner: address
    })

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
        // ignore malformed token
      }
    }
    return out
  }

  // ------------ main “rich view” used by Scanner / Dashboard ------------

  async getDetailedChainView (chainId, address) {
    const key = Number(chainId)
    const meta = SUPPORTED_CHAINS[key] || {}
    const symbol = meta.symbol || 'ETH'

    // 1) raw balances
    const nativeBalance = await this.getNativeBalance(key, address)
    const tokens = await this.getTokenBalances(key, address)

    // 2) native USD
    const nativePrice = await priceService.getNativeUsdPrice(key)
    const nativeValue = parseFloat(nativeBalance || '0') * (nativePrice || 0)

    // 3) token USD (per token)
    const tokenAddrs = tokens.map((t) => t.address.toLowerCase())
    const priceMap = tokenAddrs.length
      ? await priceService.getTokenUsdPrices(key, tokenAddrs)
      : {}

    const tokenDetails = tokens.map((t) => {
      const price = priceMap[t.address.toLowerCase()] || 0
      const value = parseFloat(t.balance || '0') * price
      return { ...t, price, value }
    })

    const totalTokenValue = tokenDetails.reduce((s, t) => s + (t.value || 0), 0)
    const totalValue = Number((nativeValue + totalTokenValue).toFixed(6))

    const isNativeDust =
      parseFloat(nativeBalance) > 0 &&
      parseFloat(nativeBalance) < NATIVE_DUST_THRESHOLD

    // For now we let the front-end Settings decide what’s “selected”.
    // claimableTokens is just “all tokens we know about”.
    const claimableTokens = tokenDetails

    return {
      chainId: key,
      chainName: meta.name || `Chain ${key}`,
      symbol,
      nativeBalance,
      nativePrice,
      nativeValue,
      tokenDetails,
      claimableTokens,
      hasDust: isNativeDust || claimableTokens.length > 0,
      totalValue
    }
  }

  // bulk scan used by DustScanner & Dashboard
  async scanChains (chainIds, address) {
    const out = []
    for (const id of chainIds) {
      try {
        out.push(await this.getDetailedChainView(id, address))
      } catch (e) {
        console.warn('scan error for chain', id, e?.message)
      }
    }
    return out
  }

  // keep this helper for Dashboard/etc if you still use it anywhere
  async getUSDValue (chainId, nativeBalance, tokenList = []) {
    try {
      const id = Number(chainId)
      let total = 0

      const nativePrice = await priceService.getNativeUsdPrice(id)
      total += parseFloat(nativeBalance || '0') * (nativePrice || 0)

      if (tokenList.length) {
        const addrs = tokenList.map((t) => t.address.toLowerCase())
        const priceMap = await priceService.getTokenUsdPrices(id, addrs)
        for (const t of tokenList) {
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
}

export default new Web3Service()