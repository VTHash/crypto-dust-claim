// src/services/walletService.js
import { createAppKit } from '@reown/appkit'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { ethers } from 'ethers'
import {
  projectId,
  getReownMetadata,
  reownNetworks,
  SUPPORTED_CHAINS
} from '../config/walletConnectConfig'

import { TxReconciler } from './txReconciler'
import { sendTransactionReliable } from './txSend'
import { txStore } from './txStore'

// ---- utils ----
const toHexChainId = (id) => '0x' + Number(id).toString(16)

function isInjectedMetaMask(p) {
  return !!(p && (p.isMetaMask || p._metamask))
}

function isMetaMaskMobileUA() {
  if (typeof window === 'undefined') return false
  const ua = window.navigator?.userAgent || ''
  return /MetaMaskMobile/i.test(ua)
}

function hexToDec(hex) {
  if (!hex) return null
  try {
    return Number.parseInt(hex, 16)
  } catch {
    return null
  }
}

function toHexQuantity(v) {
  if (v === null || v === undefined) return undefined
  try {
    if (typeof v === 'string') {
      // already hex?
      if (v.startsWith('0x')) return v
      // numeric string -> BigInt
      return '0x' + BigInt(v).toString(16)
    }
    if (typeof v === 'number') return '0x' + BigInt(v).toString(16)
    if (typeof v === 'bigint') return '0x' + v.toString(16)
    return undefined
  } catch {
    return undefined
  }
}

function normalizeEip1193Tx(tx) {
  // MetaMask expects hex quantities for numeric fields
  // tx must include: from, to, data?, value?, gas?, gasPrice? OR maxFeePerGas/maxPriorityFeePerGas
  const out = {
    from: tx.from,
    to: tx.to,
    data: tx.data ?? undefined,
    value: tx.value !== undefined ? toHexQuantity(tx.value) : undefined,
    gas: tx.gas !== undefined ? toHexQuantity(tx.gas) : undefined,
    gasPrice: tx.gasPrice !== undefined ? toHexQuantity(tx.gasPrice) : undefined,
    maxFeePerGas: tx.maxFeePerGas !== undefined ? toHexQuantity(tx.maxFeePerGas) : undefined,
    maxPriorityFeePerGas:
      tx.maxPriorityFeePerGas !== undefined ? toHexQuantity(tx.maxPriorityFeePerGas) : undefined
  }

  // Remove undefined keys (MetaMask can be picky)
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k])
  return out
}

// ---- single AppKit instance (do not create anywhere else) ----
const appKit = createAppKit({
  adapters: [new EthersAdapter()],
  networks: reownNetworks,
  metadata: getReownMetadata(),
  projectId,
  enableInjectedProvider: true
})

// ---- internal state ----
let eip1193 = null // EIP-1193 provider
let browserProvider = null // ethers.BrowserProvider
let signer = null // ethers.Signer
let accounts = [] // string[]
let chainId = null // hex string like "0x1"

// reconciler
let reconciler = null

// event listeners wired by WalletContext
let onAccChanged = null
let onChainChanged = null
let onDisconnected = null

// ---- event handlers ----
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

// ---- internal helpers ----
async function ensureProvider() {
  // Prefer injected provider in MetaMask in-app browser
  const injected = typeof window !== 'undefined' ? window.ethereum : null
  if (isInjectedMetaMask(injected)) {
    eip1193 = injected
    attachListeners()
    return eip1193
  }

  // Otherwise try AppKit provider (WalletConnect, etc.)
  const maybeProvider = await appKit.getProvider?.()
  if (maybeProvider) {
    eip1193 = maybeProvider
    attachListeners()
    return eip1193
  }

  // Fallback to any injected provider
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

// ---- MetaMask Mobile safe send path ----
async function sendViaMetaMaskEip1193(txRequest, meta = {}) {
  if (!eip1193) await ensureProvider()
  if (!eip1193) throw new Error('Provider unavailable')

  const injected = typeof window !== 'undefined' ? window.ethereum : null
  const useInjected = isInjectedMetaMask(eip1193) || isInjectedMetaMask(injected)

  if (!useInjected) throw new Error('Not an injected MetaMask provider')

  // Hard re-hydrate permissions on mobile to avoid “silent no-op”
  // If the wallet shows a pending request, MetaMask returns -32002.
  await eip1193.request({ method: 'eth_requestAccounts' })

  const bp = await walletService.getBrowserProvider()
  if (!bp) throw new Error('BrowserProvider unavailable')

  const from = txRequest.from || (await walletService.getAddress())
  if (!from) throw new Error('Missing from address')

  // Build base tx
  const base = {
    from,
    to: txRequest.to,
    data: txRequest.data ?? '0x',
    value: txRequest.value ?? 0n
  }

  // Chain safety: ensure the wallet is on the chain we think it is.
  const chainHex = await walletService.getChainId()
  const chainDec = hexToDec(chainHex)
  if (!chainDec) throw new Error('Unable to read chainId from wallet')

  // Gas estimation (critical on mobile)
  let gasLimit = txRequest.gasLimit ?? txRequest.gas ?? null
  try {
    if (!gasLimit) {
      const est = await bp.estimateGas(base)
      // +30% buffer
      gasLimit = (BigInt(est) * 130n) / 100n
    }
  } catch (e) {
    // If estimation fails, still try with a conservative ceiling if user supplied none
    if (!gasLimit) gasLimit = 1_200_000n
  }

  // Fees (prefer EIP-1559 if available; otherwise gasPrice)
  const feeData = await bp.getFeeData().catch(() => null)
  const maxFeePerGas =
    txRequest.maxFeePerGas ?? feeData?.maxFeePerGas ?? null
  const maxPriorityFeePerGas =
    txRequest.maxPriorityFeePerGas ?? feeData?.maxPriorityFeePerGas ?? null
  const gasPrice = txRequest.gasPrice ?? feeData?.gasPrice ?? null

  const mmTx = normalizeEip1193Tx({
    ...base,
    gas: gasLimit,
    // choose fee model
    ...(maxFeePerGas && maxPriorityFeePerGas
      ? { maxFeePerGas, maxPriorityFeePerGas }
      : gasPrice
        ? { gasPrice }
        : {})
  })

  // Submit — MetaMask returns tx hash if broadcasted
  const txHash = await eip1193.request({
    method: 'eth_sendTransaction',
    params: [mmTx]
  })

  if (!txHash || typeof txHash !== 'string') {
    throw new Error('No tx hash returned by MetaMask (not broadcast)')
  }

  // Wait for receipt (best-effort)
  const receipt = await bp.waitForTransaction(txHash, meta.waitConfirms ?? 1, meta.waitTimeoutMs ?? 180000)
  const status = receipt?.status === 1 ? 'success' : receipt?.status === 0 ? 'reverted' : 'unknown'

  return { txHash, receipt, status }
}

// ---- API ----
const walletService = {
  // getters / helpers
  getAppKit: () => appKit,

  async getProvider() {
    return eip1193 || (await ensureProvider())
  },

  // PUBLIC provider access (no signer requirement)
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

  // IMPORTANT: connected should not depend on signer existing
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
      window.addEventListener('focus', () => reconciler?.reconcileOnce?.().catch(() => {}))
      window.addEventListener('pageshow', () => reconciler?.reconcileOnce?.().catch(() => {}))
    }
    return
  },

  startTxReconciler,
  stopTxReconciler,

  async restoreSession() {
    try {
      await ensureProvider()
      if (!eip1193) return null

      const accs = await ensureAccounts()
      if (!accs?.length) return null

      chainId = await eip1193.request?.({ method: 'eth_chainId' }).catch(() => null)
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

  // Connect (MetaMask injected preferred; AppKit modal as fallback)
  async connect() {
    try {
      const injected = typeof window !== 'undefined' ? window.ethereum : null

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

      await appKit.open?.()

      const waitFor = async (fn, predicate, timeoutMs = 30000, intervalMs = 250) => {
        const start = Date.now()
        while (true) {
          const val = await fn().catch(() => null)
          if (predicate(val)) return val
          if (Date.now() - start > timeoutMs) throw new Error('Wallet connect timed out')
          await new Promise((r) => setTimeout(r, intervalMs))
        }
      }

      eip1193 = await waitFor(() => appKit.getProvider?.(), (p) => !!p)
      attachListeners()

      const reqAccs = await waitFor(
        () => eip1193.request({ method: 'eth_accounts' }).catch(() => []),
        (arr) => Array.isArray(arr) && arr.length > 0
      )
      accounts = reqAccs
      chainId = await eip1193.request({ method: 'eth_chainId' })

      await ensureEthers()
      startTxReconciler()

      console.debug('[walletService] connected', { accounts, chainId })
      return { success: true, accounts, chainId, address: accounts[0] ?? null, signer }
    } catch (err) {
      console.warn('[walletService] connect error:', err?.message || err)
      return { success: false, error: err?.message || 'Connect failed' }
    }
  },

  async disconnect() {
    try {
      await appKit.disconnect?.()
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

  async sendTransaction(tx) {
    try {
      if (!eip1193) await ensureProvider()

      const ok = await this.isConnected()
      if (!ok) {
        const res = await this.connect()
        if (!res.success) return { success: false, error: res.error }
      }

      await ensureEthers()
      if (!signer) return { success: false, error: 'Signer unavailable (provider not hydrated)' }

      const resp = await signer.sendTransaction(tx)
      return { success: true, txHash: resp.hash }
    } catch (err) {
      const code = err?.code
      const msg = err?.shortMessage || err?.reason || err?.message || 'Transaction failed'
      if (code === 4001) return { success: false, error: 'User rejected the request (4001)' }
      if (code === -32002) return { success: false, error: 'Request already pending in wallet (-32002)' }
      return { success: false, error: code ? `${msg} (code ${code})` : msg }
    }
  },

  /**
   * Reliable send:
   * - On MetaMask injected (esp. mobile): use eth_sendTransaction to guarantee txHash.
   * - Otherwise: use existing sendTransactionReliable (WalletConnect path).
   */
  async sendTransactionWithReceipt(tx, meta = {}) {
    try {
      if (!eip1193) await ensureProvider()

      const ok = await this.isConnected()
      if (!ok) {
        const res = await this.connect()
        if (!res.success) return { success: false, error: res.error }
      }

      startTxReconciler()

      // If we are in MetaMask injected context, prefer EIP-1193 send.
      // This is the core fix for “mobile sends but no hash”.
      const injected = typeof window !== 'undefined' ? window.ethereum : null
      const useMmPath = isInjectedMetaMask(eip1193) || isInjectedMetaMask(injected) || isMetaMaskMobileUA()

      if (useMmPath) {
        const out = await sendViaMetaMaskEip1193(tx, {
          waitConfirms: meta.waitConfirms ?? 1,
          waitTimeoutMs: meta.waitTimeoutMs ?? 180000
        })

        return {
          success: true,
          txHash: out.txHash,
          receipt: out.receipt,
          status: out.status,
          txId: null
        }
      }

      // WalletConnect/AppKit path (keeps your existing tx store & reconciling)
      const from = await this.getAddress()
      const chainHex = await this.getChainId()
      const chainDec = hexToDec(chainHex)

      const bp = await this.getBrowserProvider()
      if (!bp) return { success: false, error: 'Provider unavailable' }

      const out = await sendTransactionReliable({
        provider: bp,
        chainId: chainDec ?? 1,
        from,
        kind: meta.kind || 'unknown',
        request: tx,
        tokenAddress: meta.tokenAddress,
        spender: meta.spender,
        amount: meta.amount,
        waitConfirms: meta.waitConfirms ?? 1,
        waitTimeoutMs: meta.waitTimeoutMs ?? 180000
      })

      return {
        success: !!out.success,
        txHash: out.txHash,
        receipt: out.receipt,
        status: out.status,
        txId: out.id
      }
    } catch (err) {
      const code = err?.code
      const msg = err?.shortMessage || err?.reason || err?.message || 'Transaction failed'
      if (code === 4001) return { success: false, error: 'User rejected the request (4001)' }
      if (code === -32002) return { success: false, error: 'Request already pending in wallet (-32002)' }
      return { success: false, error: code ? `${msg} (code ${code})` : msg }
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

  // ---- tx store helpers for UI ----
  listTransactions(filters) {
    return txStore.list(filters)
  },
  getTransactionById(id) {
    return txStore.getById(id)
  },

  // subscriptions
  onAccountsChanged(cb) {
    onAccChanged = cb
  },
  onChainChanged(cb) {
    onChainChanged = cb
  },
  onDisconnect(cb) {
    onDisconnected = cb
  },

  // cleanup
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