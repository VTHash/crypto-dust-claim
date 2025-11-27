import { ethers } from 'ethers'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import priceService from './priceService'
import { discoverAllERC20s } from './tokenDiscoveryService'

const toKey = (id) => String(id)

// Default thresholds (used when Settings not provided)
const DEFAULT_DUST_THRESHOLDS = {
  native: 0.001, // e.g., ETH < 0.001
  tokenUnit: 0.01 // token units < 0.01
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

  // AUTO-DISCOVERY FOR ERC-20s (replaces manual TOKENS map)
  async getTokenBalances(chainId, address) {
    const provider = this.getProvider(chainId)
    if (!provider) return []

    // discover all ERC-20s for this wallet on this chain
    const discovered = await discoverAllERC20s({
      provider,
      chainId: Number(chainId),
      owner: address
    })

    const out = []
    for (const t of discovered) {
      try {
        const decimals = t.decimals ?? 18
        const human = ethers.formatUnits(t.balance, decimals)
        const bal = parseFloat(human)
        if (bal > 0) {
          out.push({
            symbol: t.symbol || 'TOKEN',
            balance: human,
            address: t.address,
            decimals,
            chainId: Number(chainId)
          })
        }
      } catch {
        // ignore malformed tokens
      }
    }

    return out
  }

  // ---------- valuation + dust marking ----------
  /**
   * @param {number} chainId
   * @param {string} address
   * @param {object} [settings] - optional SettingsContext snapshot
   */
  async getDetailedChainView(chainId, address, settings = null) {
    const key = Number(chainId)
    const symbol = SUPPORTED_CHAINS[key]?.symbol || 'ETH'

    const nativeBalance = await this.getBalance(key, address)
    const tokens = await this.getTokenBalances(key, address)

    const nativePrice = await priceService.getNativeUsdPrice(key)
    const nativeValue = parseFloat(nativeBalance || '0') * (nativePrice || 0)

    const tokenAddrs = tokens.map((t) => t.address.toLowerCase())
    const priceMap = tokenAddrs.length
      ? await priceService.getTokenUsdPrices(key, tokenAddrs)
      : {}

    const tokenDetails = tokens.map((t) => {
      const price = priceMap[t.address.toLowerCase()] || 0
      const value = parseFloat(t.balance) * price
      return { ...t, price, value }
    })

    // ---- apply dust logic (respect Settings where possible) ----
    const nativeDustThreshold =
      settings && settings.nativeDustThreshold != null
        ? Number(settings.nativeDustThreshold)
        : DEFAULT_DUST_THRESHOLDS.native

    const isNativeDust =
      parseFloat(nativeBalance) > 0 && parseFloat(nativeBalance) < nativeDustThreshold

    let claimableTokens = []

    if (settings) {
      const includeNonDust = !!settings.includeNonDust
      const minUsd = Number(settings.tokenMinUSD ?? 0)
      const maxUsdRaw = settings.tokenMaxUSD
      const maxUsd =
        maxUsdRaw === undefined || maxUsdRaw === null || maxUsdRaw === 0
          ? Infinity
          : Number(maxUsdRaw)

      if (includeNonDust) {
        // Everything with non-zero balance is considered "claimable"
        claimableTokens = tokenDetails.filter((t) => Number(t.balance || 0) > 0)
      } else {
        // Only items in the USD "dust window"
        claimableTokens = tokenDetails.filter((t) => {
          const v = Number(t.value || 0)
          return v >= minUsd && v <= maxUsd
        })
      }
    } else {
      // Legacy behaviour: purely unit-based dust threshold
      claimableTokens = tokenDetails.filter(
        (t) => parseFloat(t.balance) < DEFAULT_DUST_THRESHOLDS.tokenUnit
      )
    }

    const totalValue = Number(
      (nativeValue + tokenDetails.reduce((s, x) => s + x.value, 0)).toFixed(6)
    )

    return {
      chainId: key,
      chainName: SUPPORTED_CHAINS[key]?.name || `Chain ${key}`,
      symbol,
      nativeBalance,
      nativePrice,
      nativeValue,
      tokenDetails, // all tokens (for UI)
      claimableTokens, // dust (or all, depending on settings)
      hasDust: isNativeDust || claimableTokens.length > 0,
      totalValue
    }
  }

  // bulk scan helper – always returns *all* chains requested
  /**
   * @param {number[]} chainIds
   * @param {string} address
   * @param {object} [settings] - optional SettingsContext snapshot
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
}

export default new Web3Service()