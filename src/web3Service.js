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

  // ------------------------
  // Provider bootstrap
  // ------------------------
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

  // ------------------------
  // Balances
  // ------------------------
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

  // Discover ALL ERC-20s the wallet holds on this chain
  async getTokenBalances(chainId, address) {
    const provider = this.getProvider(chainId)
    if (!provider) return []

    let discovered = []
    try {
      discovered = await discoverAllERC20s({
        provider,
        chainId: Number(chainId),
        owner: address
      })
    } catch (e) {
      console.warn('token discovery failed for chain', chainId, e?.message)
      return []
    }

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

  // ------------------------
  // Core detailed view
  // ------------------------
  /**
   * Main “rich” view used by DustScanner & Dashboard.
   *
   * @param {number} chainId
   * @param {string} address
   * @param {object|null} settings - snapshot from SettingsContext
   */
  async getDetailedChainView(chainId, address, settings = null) {
    const key = Number(chainId)
    const meta = SUPPORTED_CHAINS[key] || {}
    const symbol = meta.symbol || 'ETH'

    const [nativeBalance, tokens] = await Promise.all([
      this.getNativeBalance(key, address),
      this.getTokenBalances(key, address)
    ])

    // Prices
    const nativePrice = await priceService.getNativeUsdPrice(key)
    const nativeValue = parseFloat(nativeBalance || '0') * (nativePrice || 0)

    const tokenAddrs = tokens.map((t) => t.address.toLowerCase())
    const priceMap = tokenAddrs.length
      ? await priceService.getTokenUsdPrices(key, tokenAddrs)
      : {}

    const tokenDetails = tokens.map((t) => {
      const price = priceMap[t.address.toLowerCase()] || 0
      const value = parseFloat(t.balance || '0') * price
      return { ...t, price, value }
    })

    // ---- Settings integration ----
    const tokenMin = Number(settings?.tokenMinUSD ?? 0)
    const tokenMax =
      settings?.tokenMaxUSD == null || settings.tokenMaxUSD === 0
        ? Infinity
        : Number(settings.tokenMaxUSD)

    const includeNonDust = !!settings?.includeNonDust
    const nativeDustThreshold =
      settings?.nativeDustThreshold != null
        ? Number(settings.nativeDustThreshold)
        : 0.001 // default 0.001 native units

    const isNativeDust =
      parseFloat(nativeBalance || '0') > 0 &&
      parseFloat(nativeBalance || '0') < nativeDustThreshold

    let claimableTokens
    if (includeNonDust) {
      // Sweep everything with a non-zero balance
      claimableTokens = tokenDetails.filter((t) => parseFloat(t.balance || '0') > 0)
    } else {
      // Only tokens whose USD value is within the dust window
      claimableTokens = tokenDetails.filter((t) => {
        const v = t.value || 0
        return v >= tokenMin && v <= tokenMax
      })
    }

    const totalValue = Number(
      (
        nativeValue +
        tokenDetails.reduce((sum, t) => sum + (t.value || 0), 0)
      ).toFixed(6)
    )

    return {
      chainId: key,
      chainName: meta.name || `Chain ${key}`,
      symbol,
      nativeBalance,
      nativePrice,
      nativeValue,
      tokenDetails, // ALL tokens + prices
      claimableTokens, // filtered by Settings
      hasDust: isNativeDust || claimableTokens.length > 0,
      totalValue
    }
  }

  /**
   * Scan many chains – used by DustScanner.
   * Settings is passed through so Scanner + Dashboard stay in sync.
   */
  async scanChains(chainIds, address, settings = null) {
    const out = []
    for (const id of chainIds) {
      try {
        out.push(await this.getDetailedChainView(id, address, settings))
      } catch (e) {
        console.warn('scan error for chain', id, e?.message)
      }
    }
    return out
  }

  // ------------------------
  // Helpers for Dashboard
  // ------------------------

  /**
   * Lightweight “is there dust here?” helper for a single chain.
   * Wraps getDetailedChainView so logic stays consistent.
   */
  async checkForDust(chainId, address, settings = null) {
    const detail = await this.getDetailedChainView(chainId, address, settings)
    const nativeDustThreshold =
      settings?.nativeDustThreshold != null
        ? Number(settings.nativeDustThreshold)
        : 0.001

    const nativeDust =
      parseFloat(detail.nativeBalance || '0') > 0 &&
      parseFloat(detail.nativeBalance || '0') < nativeDustThreshold

    return {
      chainId: detail.chainId,
      nativeBalance: detail.nativeBalance,
      nativeDust,
      tokenDust: detail.claimableTokens, // tokens matching Settings
      hasDust: detail.hasDust
    }
  }

  /**
   * Stand-alone USD valuation helper – used by Dashboard.
   * Sums native + tokens, and (optionally) re-applies Settings filters.
   */
  async getUSDValue(chainId, nativeBalance, tokenList = [], settings = null) {
    try {
      const id = Number(chainId)
      let total = 0

      // native
      const nativePrice = await priceService.getNativeUsdPrice(id)
      total += parseFloat(nativeBalance || '0') * (nativePrice || 0)

      // tokens
      if (tokenList.length) {
        const addrs = tokenList.map((t) => t.address.toLowerCase())
        const priceMap = await priceService.getTokenUsdPrices(id, addrs)

        const tokenMin = Number(settings?.tokenMinUSD ?? 0)
        const tokenMax =
          settings?.tokenMaxUSD == null || settings.tokenMaxUSD === 0
            ? Infinity
            : Number(settings.tokenMaxUSD)
        const includeNonDust = !!settings?.includeNonDust

        for (const t of tokenList) {
          const price = priceMap[t.address.toLowerCase()] || 0
          const value = parseFloat(t.balance || '0') * price

          if (
            includeNonDust ||
            (value >= tokenMin && value <= tokenMax)
          ) {
            total += value
          }
        }
      }

      return Number(total.toFixed(6))
    } catch (e) {
      console.error(`getUSDValue(${chainId}) error:`, e)
      return 0
    }
  }

  /**
   * Alias kept for backwards-compatibility. Returns the same rich object
   * DustScanner uses, including token USD values and Settings-aware filters.
   */
  async getDetailedDustAnalysis(chainId, address, settings = null) {
    return this.getDetailedChainView(chainId, address, settings)
  }
}

export default new Web3Service()