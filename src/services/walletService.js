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

// IMPORTANT: converts "maybe promise / maybe undefined" into a real promise
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

async function ensureProvider() {
  const injected = pickInjectedProvider()

  // Prefer MetaMask if present
  if (isInjectedMetaMask(injected)) {
    eip1193 = injected
    attachListeners()
    return eip1193
  }

  // Otherwise AppKit provider (WalletConnect)
  const maybeProvider = await asPromise(appKit.getProvider?.()).catch(() => null)
  if (maybeProvider) {
    eip1193 = maybeProvider
    attachListeners()
    return eip1193
  }

  // Fallback
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

// MetaMask Mobile hydration (kept as-is; safe)
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

// ---- API ----
const walletService = {
  getAppKit: () => appKit,

  async getProvider() {
    return eip1193 || (await ensureProvider())
  },

  async getBrowserProvider() {
    if (!eip1193) await ensureProvider()
    if (!eip1193) return null
    if (!browserProvider) browserProvider = new ethers.BrowserProvider(eip1193)
    return browserProvider
  },

  async getSigner() {
    if (!eip1193) await ensureProvider()
    await ensureEthers()
    return signer
  },

  async getAddress() {
    if (!accounts?.length) {
      if (!eip1193) await ensureProvider()
      await ensureAccounts()
    }
    return accounts?.[0] ?? null
  },

  async getChainId() {
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
    if (!eip1193) await ensureProvider()
    const accs = await ensureAccounts()
    return !!(accs && accs.length)
  },

  openModal() {
    return appKit.open?.()
  },
  closeModal() {
    return appKit.close?.()
  },

  async init() {
    try {
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
      await ensureProvider()
      if (!eip1193) return null

      const accs = await ensureAccounts()
      if (!accs?.length) return null

      chainId = await asPromise(eip1193.request?.({ method: 'eth_chainId' })).catch(() => null)
      await ensureEthers()
      startTxReconciler()

      return {
        accounts,
        account: accounts[0],
        chainId,
        address: accounts[0],
        connected: true
      }
    } catch (err) {
      console.warn('restoreSession error:', err)
      return null
    }
  },

  async connect() {
    try {
      const injected = pickInjectedProvider()

      // Prefer MetaMask injection if present (unchanged)
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

      // Otherwise open AppKit modal (WalletConnect)
      await asPromise(appKit.open?.()).catch(() => undefined)

      // SAFE waitFor: never calls .catch on undefined
      const waitFor = async (fn, predicate, timeoutMs = 30000, intervalMs = 250) => {
        const start = Date.now()
        while (true) {
          const val = await asPromise(fn()).catch(() => null)
          if (predicate(val)) return val
          if (Date.now() - start > timeoutMs) throw new Error('Wallet connect timed out')
          await sleep(intervalMs)
        }
      }

      eip1193 = await waitFor(() => appKit.getProvider?.(), (p) => !!p)
      attachListeners()

      const reqAccs = await waitFor(
        () => asPromise(eip1193.request?.({ method: 'eth_accounts' })).catch(() => []),
        (arr) => Array.isArray(arr) && arr.length > 0
      )

      accounts = reqAccs
      chainId = await eip1193.request?.({ method: 'eth_chainId' })

      await ensureEthers()
      startTxReconciler()

      return { success: true, accounts, chainId, address: accounts[0] ?? null, signer }
    } catch (err) {
      console.warn('[walletService] connect error:', err?.message || err)
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
    if (!eip1193) await ensureProvider()
    return await ensureAccounts()
  },

  // SIMPLE SEND (hash only) — single path via sendTransactionWithReceipt
  async sendTransaction(tx) {
    const r = await this.sendTransactionWithReceipt(tx, { kind: 'tx', title: 'Transaction', step: 'tx' })
    return r?.success
      ? { success: true, txHash: r.txHash }
      : { success: false, error: r?.error || 'Transaction failed' }
  },

  // BULLETPROOF SEND (hash + receipt) — unified through txSend.js
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

      // ethers TransactionRequest
      const request = { from, to, data, value }

      // pass-through optional gas/fees if present
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
      if (!eip1193) await ensureProvider()
      const ok = await this.isConnected()
      if (!ok) {
        const res = await this.connect()
        if (!res.success) return { success: false, error: res.error }
      }

      await ensureHydratedForSend()

      // MetaMask path (most reliable)
      if (isInjectedMetaMask(eip1193)) {
        const from = await this.getAddress()
        const sig = await eip1193.request({
          method: 'personal_sign',
          params: [ethers.hexlify(ethers.toUtf8Bytes(message)), from]
        })
        return { success: true, signature: sig }
      }

      // WalletConnect / AppKit path
      await ensureEthers()
      if (!signer) return { success: false, error: 'Signer unavailable (provider not hydrated)' }
      const signature = await signer.signMessage(message)
      return { success: true, signature }
    } catch (err) {
      return { success: false, error: err?.message || 'Sign failed' }
    }
  },

  async switchChain(targetId) {
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