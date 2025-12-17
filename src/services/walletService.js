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

const getInjected = () => (typeof window !== 'undefined' ? window.ethereum : null)
const isMetaMask = (p) => !!p?.isMetaMask

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
  onAccChanged?.(accounts)
}
function handleChain(hexId) {
  chainId = hexId
  onChainChanged?.(hexId)
}
function handleDisconnect(err) {
  accounts = []
  chainId = null
  signer = null
  browserProvider = null
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

// Small helper: set internal state from a provider (assumes it is authorized)
async function setStateFromProvider(provider) {
  eip1193 = provider
  browserProvider = new ethers.BrowserProvider(eip1193)
  signer = await browserProvider.getSigner()
  accounts = (await eip1193.request?.({ method: 'eth_accounts' })) || []
  chainId = await eip1193.request?.({ method: 'eth_chainId' })
  attachListeners()
  return {
    success: true,
    accounts,
    chainId,
    address: accounts?.[0] ?? null,
    signer
  }
}

// ---- API ----
const walletService = {
  // getters / helpers
  getAppKit: () => appKit,
  async getProvider() {
    return eip1193
  },
  async getBrowserProvider() {
    return browserProvider
  },
  async getSigner() {
    return signer
  },
  async getAddress() {
    return accounts?.[0] ?? null
  },
  async getChainId() {
    return chainId
  },
  async isConnected() {
    return !!(accounts?.length && signer)
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
      const injected = getInjected()

      // ✅ Prefer MetaMask injected if it already has an authorized session
      if (isMetaMask(injected)) {
        const accs = await injected.request?.({ method: 'eth_accounts' })
        if (Array.isArray(accs) && accs.length > 0) {
          const res = await setStateFromProvider(injected)
          console.debug('[walletService] restoreSession: MetaMask', { accounts: res.accounts, chainId: res.chainId })
          return { ...res, connected: true }
        }
      }

      // Otherwise, try AppKit session
      const maybeProvider = await appKit.getProvider?.()
      if (!maybeProvider) return null

      const accs = await maybeProvider.request?.({ method: 'eth_accounts' })
      if (!Array.isArray(accs) || accs.length === 0) return null

      const res = await setStateFromProvider(maybeProvider)
      console.debug('[walletService] restoreSession: AppKit', { accounts: res.accounts, chainId: res.chainId })
      return { ...res, connected: true }
    } catch (err) {
      console.warn('[walletService] restoreSession error:', err)
      return null
    }
  },

  // Connect: prefer MetaMask, fallback to AppKit modal
  async connect() {
    try {
      const injected = getInjected()

      // ✅ 1) Prefer MetaMask (deterministic UX)
      if (isMetaMask(injected)) {
        // This triggers the MetaMask permission popup if not yet authorized
        const accs = await injected.request?.({ method: 'eth_requestAccounts' })
        if (!Array.isArray(accs) || accs.length === 0) {
          return { success: false, error: 'No accounts returned from MetaMask' }
        }

        const res = await setStateFromProvider(injected)
        console.debug('[walletService] connected via MetaMask', { accounts: res.accounts, chainId: res.chainId })
        return res
      }

      // ✅ 2) Fallback: AppKit modal (WalletConnect etc.)
      await appKit.open()

      const waitFor = async (fn, predicate, timeoutMs = 30000, intervalMs = 250) => {
        const start = Date.now()
        while (true) {
          const val = await fn()
          if (predicate(val)) return val
          if (Date.now() - start > timeoutMs) throw new Error('Wallet connect timed out')
          await new Promise((r) => setTimeout(r, intervalMs))
        }
      }

      eip1193 = await waitFor(() => appKit.getProvider?.(), (p) => !!p)

      // Trigger permission prompt for providers that require it
      const accs = await eip1193.request?.({ method: 'eth_requestAccounts' })
      if (!Array.isArray(accs) || accs.length === 0) {
        return { success: false, error: 'No accounts returned from provider' }
      }

      const res = await setStateFromProvider(eip1193)
      console.debug('[walletService] connected via AppKit', { accounts: res.accounts, chainId: res.chainId })
      return res
    } catch (err) {
      console.warn('[walletService] connect error:', err)
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
    if (!eip1193) return []
    try {
      return await eip1193.request({ method: 'eth_accounts' })
    } catch {
      return []
    }
  },

  async sendTransaction(tx) {
    try {
      if (!signer) {
        const res = await this.connect()
        if (!res.success) return { success: false, error: res.error }
      }

      // Helpful debug (shows if tx is missing fields)
      console.debug('[walletService] sendTransaction tx:', tx)

      const resp = await signer.sendTransaction(tx)
      console.debug('[walletService] txHash:', resp.hash)

      return { success: true, txHash: resp.hash }
    } catch (err) {
      console.error('[walletService] sendTransaction error:', err)
      return { success: false, error: err?.shortMessage || err?.message || 'Transaction failed' }
    }
  },

  async signMessage(message) {
    try {
      if (!signer) {
        const res = await this.connect()
        if (!res.success) return { success: false, error: res.error }
      }
      const signature = await signer.signMessage(message)
      return { success: true, signature }
    } catch (err) {
      console.error('[walletService] signMessage error:', err)
      return { success: false, error: err?.shortMessage || err?.message || 'Sign failed' }
    }
  },

  async switchChain(targetId) {
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