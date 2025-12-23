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

// ---- utils ----
const toHexChainId = (id) => '0x' + Number(id).toString(16)

function isInjectedMetaMask(p) {
  return !!(p && (p.isMetaMask || p._metamask))
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

// event listeners wired by WalletContext
let onAccChanged = null
let onChainChanged = null
let onDisconnected = null

// ---- event handlers ----
function handleAccounts(accs = []) {
  accounts = Array.isArray(accs) ? accs : []
  // If accounts changed, signer may be stale
  signer = null
  onAccChanged?.(accounts)
}
function handleChain(hexId) {
  chainId = hexId
  // On chain change, signer/provider objects can become stale
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

  // Create provider if missing
  if (!browserProvider) browserProvider = new ethers.BrowserProvider(eip1193)

  // Make sure we have accounts; signer.getAddress() often fails without permissions
  if (!accounts?.length) await ensureAccounts()

  // Create signer if missing
  if (!signer) {
    try {
      signer = await browserProvider.getSigner()
    } catch {
      signer = null
    }
  }

  return { browserProvider, signer }
}

// ---- API ----
const walletService = {
  // getters / helpers
  getAppKit: () => appKit,
  async getProvider() {
    return eip1193 || (await ensureProvider())
  },
  async getBrowserProvider() {
    if (!eip1193) await ensureProvider()
    await ensureEthers()
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
    return
  },

  // Try to re-hydrate a previous session (called by WalletContext on mount)
  async restoreSession() {
    try {
      await ensureProvider()
      if (!eip1193) return null

      const accs = await ensureAccounts()
      if (!accs?.length) return null

      chainId = await eip1193.request?.({ method: 'eth_chainId' }).catch(() => null)
      await ensureEthers()

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

      // If MetaMask injected, request permissions directly (most reliable inside MetaMask)
      if (isInjectedMetaMask(injected)) {
        eip1193 = injected
        attachListeners()

        const reqAccs = await eip1193.request?.({ method: 'eth_requestAccounts' })
        accounts = Array.isArray(reqAccs) ? reqAccs : []
        chainId = await eip1193.request?.({ method: 'eth_chainId' })

        await ensureEthers()

        return {
          success: true,
          accounts,
          chainId,
          address: accounts[0] ?? null,
          signer
        }
      }

      // Otherwise use AppKit modal
      await appKit.open?.()

      // wait for AppKit provider
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

      // Request accounts
      const reqAccs = await waitFor(
        () => eip1193.request({ method: 'eth_accounts' }).catch(() => []),
        (arr) => Array.isArray(arr) && arr.length > 0
      )
      accounts = reqAccs
      chainId = await eip1193.request({ method: 'eth_chainId' })

      await ensureEthers()

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
      handleDisconnect()
    }
    return { success: true }
  },

  // actions
  async getAccounts() {
    if (!eip1193) await ensureProvider()
    return await ensureAccounts()
  },

  async sendTransaction(tx) {
    try {
      if (!eip1193) await ensureProvider()

      // Ensure we are connected (accounts exist)
      const ok = await this.isConnected()
      if (!ok) {
        const res = await this.connect()
        if (!res.success) return { success: false, error: res.error }
      }

      // Ensure signer exists even if the UI already shows address
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
    eip1193 = null
    browserProvider = null
    signer = null
    accounts = []
    chainId = null
  }
}

export default walletService