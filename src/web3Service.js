import { ethers } from 'ethers'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import priceService from './priceService'
import { discoverAllERC20s } from './tokenDiscoveryService'

const toKey = (id) => String(id)

const DEFAULT_DUST_THRESHOLDS = {
  native: 0.001, // native < 0.001 flagged as dust (UI flag only)
  tokenUnit: 0.01, // legacy fallback if no Settings
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

  // --------- AUTO TOKEN DISCOVERY (no manual list) ---------
  async getTokenBalances(chainId, address) {
    const provider = this.getProvider(chainId)
    if (!provider) return []

    const discovered = await discoverAllERC20s({
      provider,
      chainId: Number(chainId),
      owner: address,
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
            balance: human,
          })
        }
      } catch {
        // ignore malformed
      }
    }
    return out
  }

  // --------- FULL CHAIN VIEW + USD VALUATION ---------
  /**
   * @param {number} chainId
   * @param {string} address
   * @param {object|null} settings // SettingsContext snapshot (optional)
   */
  async getDetailedChainView(chainId, address, settings = null) {
    const cid = Number(chainId)
    const meta = SUPPORTED_CHAINS[cid] || {}
    const symbol = meta.symbol || 'ETH'

    // 1) balances
    const nativeBalance = await this.getBalance(cid, address)
    const tokens = await this.getTokenBalances(cid, address)

    // 2) pricing
    const nativePrice = await priceService.getNativeUsdPrice(cid)
    const nativeValue = parseFloat(nativeBalance || '0') * (nativePrice || 0)

    const tokenAddrs = tokens.map((t) => t.address.toLowerCase())
    const priceMap = tokenAddrs.length
      ? await priceService.getTokenUsdPrices(cid, tokenAddrs)
      : {}

    const tokenDetails = tokens.map((t) => {
      const price = priceMap[t.address.toLowerCase()] || 0
      const value = parseFloat(t.balance || '0') * price
      return { ...t, price, value }
    })

    // 3) dust / claimable logic
    const nativeDustThreshold =
      settings && settings.nativeDustThreshold != null
        ? Number(settings.nativeDustThreshold)
        : DEFAULT_DUST_THRESHOLDS.native

    const isNativeDust =
      parseFloat(nativeBalance) > 0 &&
      parseFloat(nativeBalance) < nativeDustThreshold

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
        // "Swap everything" – any positive balance is claimable
        claimableTokens = tokenDetails.filter((t) => Number(t.balance || 0) > 0)
      } else {
        // Only values inside dust USD window
        claimableTokens = tokenDetails.filter((t) => {
          const v = Number(t.value || 0)
          return v >= minUsd && v <= maxUsd
        })
      }
    } else {
      // Legacy: purely unit-based dust
      claimableTokens = tokenDetails.filter(
        (t) => parseFloat(t.balance) < DEFAULT_DUST_THRESHOLDS.tokenUnit
      )
    }

    // 4) totals
    const totalChainValue = Number(
      (nativeValue + tokenDetails.reduce((s, x) => s + x.value, 0)).toFixed(6)
    )

    const totalClaimableValue = Number(
      (
        (isNativeDust ? nativeValue : 0) +
        claimableTokens.reduce((s, x) => s + x.value, 0)
      ).toFixed(6)
    )

    return {
      chainId: cid,
      chainName: meta.name || `Chain ${cid}`,
      symbol,
      nativeBalance,
      nativePrice,
      nativeValue,
      tokenDetails, // all tokens + price + value
      claimableTokens, // filtered by Settings
      hasDust: isNativeDust || claimableTokens.length > 0,
      totalChainValue, // full value on that chain
      totalClaimableValue, // value that matches Settings (for "Dust Found")
    }
  }

  /**
   * Scan many chains; used by DustScanner / Dashboard
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