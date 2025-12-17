import { ethers } from 'ethers'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import priceService from './priceService'
import { discoverAllERC20s } from './tokenDiscoveryService'

const toKey = (id) => String(Number(id))

const DEFAULT_DUST_THRESHOLDS = {
  native: 0.001,
  tokenUnit: 0.01
}

function normalizeRpcUrl(rpcUrl) {
  // Accept common shapes:
  // - "https://..."
  // - ["https://...", "https://backup..."]
  // - { http: "https://..." } / { default: "https://..." }
  // - { url: "https://..." }
  if (!rpcUrl) return null

  if (typeof rpcUrl === 'string') return rpcUrl.trim() || null

  if (Array.isArray(rpcUrl)) {
    const first = rpcUrl.find((x) => typeof x === 'string' && x.trim())
    return first ? first.trim() : null
  }

  if (typeof rpcUrl === 'object') {
    const candidates = [rpcUrl.http, rpcUrl.https, rpcUrl.default, rpcUrl.url]
    const first = candidates.find((x) => typeof x === 'string' && x.trim())
    return first ? first.trim() : null
  }

  return null
}

async function withTimeout(promise, ms = 12_000, label = 'timeout') {
  let t
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(label)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(t)
  }
}

class Web3Service {
  constructor() {
    this.providers = {}
    this.disabled = new Set()
  }

  getProvider(chainId) {
    const id = toKey(chainId)
    if (this.disabled.has(id)) return null
    if (this.providers[id]) return this.providers[id]

    const chain = SUPPORTED_CHAINS[id]
    const rpc = normalizeRpcUrl(chain?.rpcUrl)

    if (!rpc) {
      console.warn(
        `[web3Service] No valid rpcUrl for chain ${id}. Got:`,
        chain?.rpcUrl
      )
      this.disabled.add(id)
      return null
    }

    try {
      // DO NOT pass chainId as 2nd arg (can cause weird parsing issues across builds)
      const p = new ethers.JsonRpcProvider(rpc)
      this.providers[id] = p
      return p
    } catch (e) {
      console.warn(`[web3Service] RPC init failed for chain ${id}:`, e?.message || e)
      this.disabled.add(id)
      return null
    }
  }

  async assertProviderHealthy(chainId) {
    const id = toKey(chainId)
    const provider = this.getProvider(id)
    if (!provider) return false

    try {
      const net = await withTimeout(provider.getNetwork(), 10_000, 'RPC getNetwork timeout')
      const got = Number(net?.chainId || 0)
      const expected = Number(id)

      if (expected && got && expected !== got) {
        console.warn(`[web3Service] RPC chainId mismatch expected=${expected} got=${got}. Disabling chain ${id}.`)
        this.disabled.add(id)
        return false
      }

      return true
    } catch (e) {
      console.warn(`[web3Service] RPC unhealthy for chain ${id}:`, e?.message || e)
      this.disabled.add(id)
      return false
    }
  }

  async getBalance(chainId, address) {
    const id = toKey(chainId)
    try {
      const ok = await this.assertProviderHealthy(id)
      if (!ok) return '0'
      const provider = this.getProvider(id)
      const balance = await provider.getBalance(address)
      return ethers.formatEther(balance)
    } catch {
      return '0'
    }
  }

  async getTokenBalances(chainId, address) {
    const key = Number(chainId)
    const ok = await this.assertProviderHealthy(key)
    if (!ok) return []

    const provider = this.getProvider(key)
    if (!provider) return []

    try {
      const discovered = await discoverAllERC20s({ provider, chainId: key, owner: address })

      const out = []
      for (const t of discovered) {
        try {
          const human = ethers.formatUnits(t.balance, t.decimals ?? 18)
          const bal = parseFloat(human)
          if (bal > 0) {
            out.push({
              chainId: key,
              address: t.address,
              symbol: t.symbol || 'TOKEN',
              decimals: t.decimals ?? 18,
              balance: human,
              name: t.name || '',
              logoURI: t.logoURI || ''
            })
          }
        } catch (e) {
          console.warn('[web3Service] Token decode failed', key, t.address, e?.message)
        }
      }

      return out
    } catch (e) {
      console.warn('[web3Service] Auto token discovery failed on chain', key, e?.message)
      return []
    }
  }

  async getDetailedChainView(chainId, address, settings = null) {
    const key = Number(chainId)
    const symbol = SUPPORTED_CHAINS[key]?.symbol || 'ETH'

    const nativeBalance = await this.getBalance(key, address)
    const tokens = await this.getTokenBalances(key, address)

    const nativePrice = await priceService.getNativeUsdPrice(key)
    const nativeValue = parseFloat(nativeBalance || '0') * (nativePrice || 0)

    const tokenAddrs = tokens.map((t) => t.address.toLowerCase())
    const priceMap = tokenAddrs.length ? await priceService.getTokenUsdPrices(key, tokenAddrs) : {}

    const tokenDetails = tokens.map((t) => {
      const price = priceMap[t.address.toLowerCase()] || 0
      const value = parseFloat(t.balance || '0') * price
      return { ...t, price, value }
    })

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
      const maxUsd = maxUsdRaw === undefined || maxUsdRaw === null || maxUsdRaw === 0 ? Infinity : Number(maxUsdRaw)

      claimableTokens = includeNonDust
        ? tokenDetails.filter((t) => Number(t.balance || 0) > 0)
        : tokenDetails.filter((t) => {
            const v = Number(t.value || 0)
            return v >= minUsd && v <= maxUsd
          })
    } else {
      claimableTokens = tokenDetails.filter((t) => parseFloat(t.balance || '0') < DEFAULT_DUST_THRESHOLDS.tokenUnit)
    }

    const totalValue = Number((nativeValue + tokenDetails.reduce((s, x) => s + x.value, 0)).toFixed(6))

    return {
      chainId: key,
      chainName: SUPPORTED_CHAINS[key]?.name || `Chain ${key}`,
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

  async scanChains(chainIds, address, settings = null) {
    const out = []
    for (const id of chainIds) {
      try {
        out.push(await this.getDetailedChainView(id, address, settings))
      } catch (e) {
        console.warn('[web3Service] scan error for chain', id, e?.message)
      }
    }
    return out
  }
}

export default new Web3Service()