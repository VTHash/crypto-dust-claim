// src/services/walletService.js
import { createAppKit } from '@reown/appkit'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { ethers } from 'ethers'
import { sendTransactionReliable } from './txSend'
import {
  projectId,
  getReownMetadata,
  reownNetworks,
  SUPPORTED_CHAINS
} from '../config/walletConnectConfig'

import { TxReconciler } from './txReconciler'
import { txStore } from './txStore'

// ---- utils ----
const toHexChainId = (id) => '0x' + Number(id).toString(16)

function isInjectedMetaMask(p) {
  return !!(p && (p.isMetaMask || p._metamask))
}

// pick the correct injected provider (prevents multi-provider collisions)
function pickInjectedProvider() {
  if (typeof window === 'undefined') return null
  const eth = window.ethereum
  if (!eth) return null

  const providers = Array.isArray(eth.providers) ? eth.providers : null
  if (providers && providers.length) {
    const mm = providers.find((p) => isInjectedMetaMask(p))
    return mm || providers[0] || eth
  }

  return eth
}

function hexToDec(hex) {
  if (!hex) return null
  try {
    return Number.parseInt(hex, 16)
  } catch {
    return null
  }
}

const isNonZeroAddress = (a) =>
  typeof a === 'string' &&
  /^0x[0-9a-fA-F]{40}$/.test(a) &&
  a.toLowerCase() !== '0x0000000000000000000000000000000000000000'

const toBigIntSafe = (v) => {
  try {
    if (v === null || v === undefined) return undefined
    if (typeof v === 'bigint') return v
    if (typeof v === 'number') return BigInt(Math.trunc(v))
    if (typeof v === 'string') {
      const s = v.trim()
      if (!s) return undefined
      if (s.startsWith('0x')) return BigInt(s)
      return BigInt(s)
    }
    return undefined
  } catch {
    return undefined
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const asPromise = (v) => Promise.resolve(v)

// ---- single AppKit instance (do not create anywhere else) ----
const appKit = createAppKit({
  adapters: [new EthersAdapter()],
  networks: reownNetworks,
  metadata: getReownMetadata(),
  projectId,
  enableInjectedProvider: true
})

// ---- internal state ----
let eip1193 = null
let browserProvider = null
let signer = null
let accounts = []
let chainId = null

let reconciler = null

let onAccChanged = null
let onChainChanged = null
let onDisconnected = null

let unsubscribeProviders = null

function handleAccounts(accs = []) {
  accounts = Array.isArray(accs) ? accs : []
  signer = null
  onAccChanged?.(accounts)
}

function handleChain(hexId) {
  chainId = hexId
  signer = null
  browserProvider = null
  onChainChanged?.(hexId)
}

function handleDisconnect(err) {
  accounts = []
  chainId = null
  signer = null
  browserProvider = null
  eip1193 = null
  onDisconnected?.(err)
}

function attachListeners() {
  if (!eip1193) return
  eip1193.removeListener?.('accountsChanged', handleAccounts)
  eip1193.removeListener?.('chainChanged', handleChain)
  eip1193.removeListener?.('disconnect', handleDisconnect)
  eip1193.on?.('accountsChanged', handleAccounts)
  eip1193.on?.('chainChanged', handleChain)
  eip1193.on?.('disconnect', handleDisconnect)
}

// Prefer MetaMask injection if present; otherwise use AppKit EVM provider
async function ensureProvider() {
  const injected = pickInjectedProvider()

  if (isInjectedMetaMask(injected)) {
    eip1193 = injected
    attachListeners()
    return eip1193
  }

  // IMPORTANT: use AppKit providers map (EVM namespace)
  try {
    const providers = appKit.getProviders?.()
    const p = providers?.['eip155']
    if (p) {
      eip1193 = p
      attachListeners()
      return eip1193
    }
  } catch {
    // ignore
  }

  // Fallback: any injection if exists
  if (injected) {
    eip1193 = injected
    attachListeners()
    return eip1193
  }

  return null
}

async function ensureAccounts() {
  if (!eip1193) return []
  try {
    const accs = await eip1193.request?.({ method: 'eth_accounts' })
    if (Array.isArray(accs) && accs.length) {
      accounts = accs
      return accs
    }
  } catch {
    // ignore
  }
  return accounts || []
}

async function ensureEthers() {
  if (!eip1193) return { browserProvider: null, signer: null }
  if (!browserProvider) browserProvider = new ethers.BrowserProvider(eip1193)
  if (!accounts?.length) await ensureAccounts()
  if (!signer) {
    try {
      signer = await browserProvider.getSigner()
    } catch {
      signer = null
    }
  }
  return { browserProvider, signer }
}

// MetaMask Mobile hydration (safe)
async function ensureHydratedForSend() {
  if (!eip1193) await ensureProvider()
  if (!eip1193) return false

  try {
    await eip1193.request?.({ method: 'eth_requestAccounts' })
  } catch {
    // ignore (WalletConnect providers may reject)
  }

  await ensureAccounts()
  await ensureEthers()
  return true
}

// ---- reconciler wiring ----
async function providerFactory() {
  if (!eip1193) await ensureProvider()
  if (!eip1193) return null
  if (!browserProvider) browserProvider = new ethers.BrowserProvider(eip1193)
  return browserProvider
}

function startTxReconciler() {
  if (reconciler) return
  reconciler = new TxReconciler(providerFactory, {
    pollMs: 6000,
    maxAgeMs: 24 * 60 * 60 * 1000
  })
  reconciler.start()
}

function stopTxReconciler() {
  if (!reconciler) return
  reconciler.stop()
  reconciler = null
}

// ---- NEW: subscribe to AppKit providers so mobile “return to dapp” hydrates instantly ----
function ensureProviderSubscription() {
  if (unsubscribeProviders) return
  try {
    unsubscribeProviders = appKit.subscribeProviders?.((state) => {
      const p = state?.['eip155']
      if (p && p !== eip1193) {
        eip1193 = p
        attachListeners()
        // proactive refresh of cached data
        ;(async () => {
          try {
            chainId = await asPromise(eip1193.request?.({ method: 'eth_chainId' })).catch(() => chainId)
            const accs = await asPromise(eip1193.request?.({ method: 'eth_accounts' })).catch(() => [])
            if (Array.isArray(accs) && accs.length) handleAccounts(accs)
          } catch {
            // ignore
          }
        })()
      }
    })
  } catch {
    // ignore
  }
}

// ---- API ----
const walletService = {
  getAppKit: () => appKit,

  // AppKit authoritative state helpers (for WalletContext hydration)
  getIsConnected() {
    try {
      return !!appKit.getIsConnected?.()
    } catch {
      return false
    }
  },
  getModalAddress() {
    try {
      return appKit.getAddress?.() || null
    } catch {
      return null
    }
  },

  async getProvider() {
    ensureProviderSubscription()
    return eip1193 || (await ensureProvider())
  },

  async getBrowserProvider() {
    ensureProviderSubscription()
    if (!eip1193) await ensureProvider()
    if (!eip1193) return null
    if (!browserProvider) browserProvider = new ethers.BrowserProvider(eip1193)
    return browserProvider
  },

  async getSigner() {
    ensureProviderSubscription()
    if (!eip1193) await ensureProvider()
    await ensureEthers()
    return signer
  },

  async getAddress() {
    // Prefer real EIP-1193 accounts, but fall back to AppKit modal address if needed
    if (!accounts?.length) {
      ensureProviderSubscription()
      if (!eip1193) await ensureProvider()
      await ensureAccounts()
    }
    return accounts?.[0] ?? this.getModalAddress() ?? null
  },

  async getChainId() {
    ensureProviderSubscription()
    if (!chainId) {
      if (!eip1193) await ensureProvider()
      try {
        chainId = await eip1193.request?.({ method: 'eth_chainId' })
      } catch {
        // ignore
      }
    }
    return chainId
  },

  async getChainIdDec() {
    const hex = await this.getChainId()
    return hexToDec(hex)
  },

  async isConnected() {
    ensureProviderSubscription()
    // If AppKit says connected, trust it (mobile can lag on eth_accounts)
    if (this.getIsConnected()) return true
    if (!eip1193) await ensureProvider()
    const accs = await ensureAccounts()
    return !!(accs && accs.length)
  },

  openModal() {
    // Force EVM-only connect view on mobile wallets
    return appKit.open?.({ view: 'Connect', namespace: 'eip155' })
  },
  closeModal() {
    return appKit.close?.()
  },

  async init() {
    try {
      ensureProviderSubscription()
      await ensureProvider()
      startTxReconciler()
    } catch {
      // ignore
    }

    if (typeof window !== 'undefined') {
      const safeReconcile = () => {
        try {
          const p = reconciler?.reconcileOnce?.()
          if (p && typeof p.catch === 'function') p.catch(() => {})
        } catch {
          // ignore
        }
      }

      window.addEventListener('focus', safeReconcile)
      window.addEventListener('pageshow', safeReconcile)
    }
  },

  startTxReconciler,
  stopTxReconciler,

  async restoreSession() {
    try {
      ensureProviderSubscription()
      await ensureProvider()

      // If AppKit says connected, we can hydrate without waiting for eth_accounts immediately
      const connected = this.getIsConnected()
      const modalAddr = this.getModalAddress()

      const accs = await ensureAccounts()
      const addr = accs?.[0] || modalAddr || null
      if (!connected && !addr) return null

      chainId = await asPromise(eip1193?.request?.({ method: 'eth_chainId' })).catch(() => chainId)
      await ensureEthers()
      startTxReconciler()

      return {
        accounts: accs?.length ? accs : (addr ? [addr] : []),
        account: addr,
        chainId,
        address: addr,
        connected: true
      }
    } catch (err) {
      console.warn('restoreSession error:', err)
      return null
    }
  },

  async connect() {
    try {
      ensureProviderSubscription()
      const injected = pickInjectedProvider()

      // Prefer MetaMask injection if present
      if (isInjectedMetaMask(injected)) {
        eip1193 = injected
        attachListeners()

        const reqAccs = await eip1193.request?.({ method: 'eth_requestAccounts' })
        accounts = Array.isArray(reqAccs) ? reqAccs : []
        chainId = await eip1193.request?.({ method: 'eth_chainId' })

        await ensureEthers()
        startTxReconciler()

        return {
          success: true,
          accounts,
          chainId,
          address: accounts[0] ?? null,
          signer
        }
      }

      // WalletConnect/AppKit modal connect (EVM namespace) 
      await asPromise(this.openModal()).catch(() => undefined)

      const waitFor = async (fn, predicate, timeoutMs = 180000, intervalMs = 250) => {
        const start = Date.now()
        while (true) {
          const val = await asPromise(fn()).catch(() => null)
          if (predicate(val)) return val
          if (Date.now() - start > timeoutMs) throw new Error('Wallet connect timed out')
          await sleep(intervalMs)
        }
      }

      // 1) Wait until AppKit declares connection OR address exists (modal state)
      await waitFor(
        () => ({ c: this.getIsConnected(), a: this.getModalAddress() }),
        (s) => !!(s && (s.c || isNonZeroAddress(s.a)))
      )

      // 2) Now fetch the provider from providers map (EVM)
      const p = await waitFor(
        () => {
          const providers = appKit.getProviders?.()
          return providers?.['eip155'] || null
        },
        (x) => !!x
      )

      eip1193 = p
      attachListeners()

      // 3) Accounts can lag on mobile; poll eth_accounts, but if it stays empty, still return success with modal address
      const accs = await waitFor(
        async () => {
          const a = await asPromise(eip1193.request?.({ method: 'eth_accounts' })).catch(() => [])
          return Array.isArray(a) ? a : []
        },
        (arr) => Array.isArray(arr),
        60000,
        300
      )

      accounts = Array.isArray(accs) ? accs : []
      chainId = await asPromise(eip1193.request?.({ method: 'eth_chainId' })).catch(() => null)

      await ensureEthers()
      startTxReconciler()

      const addr = accounts[0] ?? this.getModalAddress() ?? null

      return { success: true, accounts: addr ? (accounts.length ? accounts : [addr]) : accounts, chainId, address: addr, signer }
    } catch (err) {
      console.warn('[walletService] connect error:', err?.message || err)

      // IMPORTANT: if AppKit says connected, do NOT fail just because polling timed out
      const stillConnected = this.getIsConnected()
      const modalAddr = this.getModalAddress()
      if (stillConnected || isNonZeroAddress(modalAddr)) {
        // Try to hydrate provider in background-ish manner (still in this call)
        try {
          await ensureProvider()
          await ensureAccounts()
          chainId = await asPromise(eip1193?.request?.({ method: 'eth_chainId' })).catch(() => chainId)
        } catch {
          // ignore
        }
        return {
          success: true,
          accounts: accounts?.length ? accounts : (modalAddr ? [modalAddr] : []),
          chainId: chainId || null,
          address: accounts?.[0] || modalAddr || null,
          signer: signer || null,
          warning: 'Connected, waiting for wallet to return provider'
        }
      }

      return { success: false, error: err?.message || 'Connect failed' }
    }
  },

  async disconnect() {
    try {
      await asPromise(appKit.disconnect?.()).catch(() => undefined)
    } finally {
      stopTxReconciler()
      handleDisconnect()
    }
    return { success: true }
  },

  async getAccounts() {
    ensureProviderSubscription()
    if (!eip1193) await ensureProvider()
    return await ensureAccounts()
  },

  // SIMPLE SEND (hash only)
  async sendTransaction(tx) {
    const r = await this.sendTransactionWithReceipt(tx, { kind: 'tx', title: 'Transaction', step: 'tx' })
    return r?.success
      ? { success: true, txHash: r.txHash }
      : { success: false, error: r?.error || 'Transaction failed' }
  },

  // BULLETPROOF SEND (hash + receipt)
  async sendTransactionWithReceipt(tx, meta = {}) {
    const waitConfirms = Number(meta.waitConfirms ?? 1)
    const waitTimeoutMs = Number(meta.waitTimeoutMs ?? 180000)

    const fail = (error, extra = {}) => {
      const message =
        error?.shortMessage ||
        error?.reason ||
        error?.message ||
        String(error || 'Transaction failed')
      return { success: false, error: message, ...extra }
    }

    try {
      ensureProviderSubscription()
      if (!eip1193) await ensureProvider()

      const ok = await this.isConnected()
      if (!ok) {
        const res = await this.connect()
        if (!res?.success) return fail(res?.error || 'Wallet connection failed')
      }

      await ensureHydratedForSend()

      const from = (tx?.from && String(tx.from)) || (await this.getAddress())
      if (!isNonZeroAddress(from)) return fail('No wallet address')

      const chainHex = await this.getChainId()
      const chainDec = hexToDec(chainHex)

      const bp = await this.getBrowserProvider()
      if (!bp) return fail('Provider unavailable')

      const to = tx?.to
      if (!isNonZeroAddress(to)) return fail('Invalid "to" address')

      const data = typeof tx?.data === 'string' ? tx.data : '0x'
      const value = toBigIntSafe(tx?.value) ?? 0n

      const request = { from, to, data, value }

      const gasLimit = toBigIntSafe(tx?.gasLimit ?? tx?.gas)
      const maxFeePerGas = toBigIntSafe(tx?.maxFeePerGas)
      const maxPriorityFeePerGas = toBigIntSafe(tx?.maxPriorityFeePerGas)
      const gasPrice = toBigIntSafe(tx?.gasPrice)
      const nonce = tx?.nonce != null ? Number(tx.nonce) : null

      if (gasLimit && gasLimit > 0n) request.gasLimit = gasLimit
      if (maxFeePerGas && maxFeePerGas > 0n) request.maxFeePerGas = maxFeePerGas
      if (maxPriorityFeePerGas && maxPriorityFeePerGas > 0n)
        request.maxPriorityFeePerGas = maxPriorityFeePerGas
      if (gasPrice && gasPrice > 0n) request.gasPrice = gasPrice
      if (Number.isFinite(nonce) && nonce >= 0) request.nonce = nonce

      const r = await sendTransactionReliable({
        provider: bp,
        chainId: chainDec,
        from,
        kind: meta.kind || 'tx',
        request,
        tokenAddress: meta.tokenAddress || null,
        spender: meta.spender || null,
        amount: meta.amount || null,
        flowId: meta.flowId || null,
        title: meta.title || null,
        step: meta.step || null,
        waitConfirms,
        waitTimeoutMs
      })

      return {
        success: !!r?.success,
        txHash: r?.txHash || null,
        receipt: r?.receipt || null,
        status: r?.status || (r?.success ? 'confirmed' : 'failed'),
        chainId: chainDec,
        error: r?.success ? null : (r?.error || 'Transaction failed'),
        warning: r?.warning || null
      }
    } catch (e) {
      const msg = e?.message || ''
      const code = e?.code
      const rejected =
        code === 4001 ||
        /user rejected/i.test(msg) ||
        /denied transaction/i.test(msg) ||
        /rejected/i.test(msg)

      return fail(rejected ? 'User rejected the transaction' : e)
    }
  },

  async signMessage(message) {
    try {
      ensureProviderSubscription()
      if (!eip1193) await ensureProvider()
      const ok = await this.isConnected()
      if (!ok) {
        const res = await this.connect()
        if (!res.success) return { success: false, error: res.error }
      }

      await ensureHydratedForSend()

      if (isInjectedMetaMask(eip1193)) {
        const from = await this.getAddress()
        const sig = await eip1193.request({
          method: 'personal_sign',
          params: [ethers.hexlify(ethers.toUtf8Bytes(message)), from]
        })
        return { success: true, signature: sig }
      }

      await ensureEthers()
      if (!signer) return { success: false, error: 'Signer unavailable (provider not hydrated)' }
      const signature = await signer.signMessage(message)
      return { success: true, signature }
    } catch (err) {
      return { success: false, error: err?.message || 'Sign failed' }
    }
  },

  async switchChain(targetId) {
    ensureProviderSubscription()
    if (!eip1193) await ensureProvider()
    if (!eip1193) return { success: false, error: 'Wallet not connected' }

    const hex = toHexChainId(targetId)
    try {
      await eip1193.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hex }]
      })
      return { success: true }
    } catch (err) {
      if (err?.code === 4902) {
        const chain = SUPPORTED_CHAINS[targetId]
        if (!chain) return { success: false, error: 'Unsupported chain' }
        try {
          await eip1193.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: hex,
                chainName: chain.name,
                nativeCurrency: { name: chain.symbol, symbol: chain.symbol, decimals: 18 },
                rpcUrls: [chain.rpcUrl],
                blockExplorerUrls: [chain.explorer]
              }
            ]
          })
          return { success: true, added: true }
        } catch (addErr) {
          return { success: false, error: addErr?.message || 'Failed to add chain' }
        }
      }
      return { success: false, error: err?.message || 'Failed to switch chain' }
    }
  },

  listTransactions(filters) {
    return txStore.list(filters)
  },
  getTransactionById(id) {
    return txStore.getById(id)
  },

  onAccountsChanged(cb) {
    onAccChanged = cb
  },
  onChainChanged(cb) {
    onChainChanged = cb
  },
  onDisconnect(cb) {
    onDisconnected = cb
  },

  destroy() {
    try {
      unsubscribeProviders?.()
    } catch {
      // ignore
    }
    unsubscribeProviders = null

    if (eip1193) {
      eip1193.removeListener?.('accountsChanged', handleAccounts)
      eip1193.removeListener?.('chainChanged', handleChain)
      eip1193.removeListener?.('disconnect', handleDisconnect)
    }
    stopTxReconciler()
    eip1193 = null
    browserProvider = null
    signer = null
    accounts = []
    chainId = null
  }
}

export default walletService