import { createAppKit } from '@reown/appkit'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { ethers } from 'ethers'
import {
  projectId,
  metadata,
  reownNetworks,
  SUPPORTED_CHAINS
} from '../config/walletConnectConfig'

const toHex = (id) => '0x' + Number(id).toString(16)

// --- Single AppKit instance ---
const appKit = createAppKit({
  adapters: [new EthersAdapter()],
  networks: reownNetworks,
  metadata,
  projectId
})

// ---- internal state ----
let eip1193 = null // EIP-1193 provider from AppKit (or window.ethereum fallback)
let browserProvider = null // ethers.BrowserProvider
let signer = null // ethers.Signer
let accounts = [] // string[]
let chainId = null // hex string like "0x1"

// callbacks wired by WalletContext
let onAccChanged = null
let onChainChanged = null
let onDisconnected = null

// ---------- listeners ----------
function handleAccounts(accs = []) {
  accounts = Array.isArray(accs) ? accs : []
  onAccChanged && onAccChanged(accounts)
}

function handleChain(hexId) {
  chainId = hexId
  onChainChanged && onChainChanged(hexId)
}

function handleDisconnect(err) {
  accounts = []
  chainId = null
  signer = null
  browserProvider = null
  onDisconnected && onDisconnected(err)
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

// ---------- core helpers ----------
async function setProvidersFrom(provider) {
  eip1193 = provider
  browserProvider = new ethers.BrowserProvider(eip1193)
  signer = await browserProvider.getSigner().catch(() => null)

  // populate accounts/chain
  accounts = await eip1193.request({ method: 'eth_accounts' }).catch(() => [])
  chainId = await eip1193.request({ method: 'eth_chainId' }).catch(() => null)

  attachListeners()
}

const walletService = {
  // getters / utils
  getAppKit: () => appKit,
  async getProvider() { return eip1193 },
  async getBrowserProvider() { return browserProvider },
  async getSigner() { return signer },
  async getAddress() { return accounts?.[0] ?? null },
  async getChainId() { return chainId },
  async isConnected() { return !!(accounts?.length && signer) },
  openModal() { return appKit.open?.() },
  closeModal() { return appKit.close?.() },

  // lifecycle
  async init() { return },

  // Try to rebuild state if the wallet is already authorized
  async restoreSession() {
    try {
      // Prefer AppKit’s provider if present
      const kitProvider = await appKit.getProvider()
      if (kitProvider) {
        await setProvidersFrom(kitProvider)
        if (accounts?.length) {
          const addr = accounts[0]
          return { accounts, address: addr, account: addr, chainId, signer }
        }
      }

      // Fallback to injected provider if user connected previously
      const injected = typeof window !== 'undefined' ? window.ethereum : null
      if (injected) {
        const accs = await injected.request({ method: 'eth_accounts' })
        if (accs && accs.length) {
          await setProvidersFrom(injected)
          const addr = accs[0]
          return { accounts, address: addr, account: addr, chainId, signer }
        }
      }
      return null
    } catch {
      return null
    }
  },

  async connect() {
    try {
      // open modal; user selects wallet/chain
      await appKit.open()

      // get provider from AppKit
      let provider = await appKit.getProvider()

      // mobile/injected fallback (extra safety)
      if (!provider && typeof window !== 'undefined' && window.ethereum) {
        provider = window.ethereum
      }
      if (!provider) return { success: false, error: 'No provider from AppKit' }

      await setProvidersFrom(provider)

      const addr = accounts?.[0] ?? null
      return {
        success: true,
        accounts,
        address: addr, // important: include both keys
        account: addr, // <- WalletContext reads this too
        chainId,
        signer
      }
    } catch (err) {
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
  async sendTransaction(tx) {
    try {
      if (!signer) {
        const res = await this.connect()
        if (!res.success) return { success: false, error: res.error }
      }
      const resp = await signer.sendTransaction(tx)
      return { success: true, txHash: resp.hash }
    } catch (err) {
      return { success: false, error: err?.message || 'Transaction failed' }
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
      return { success: false, error: err?.message || 'Sign failed' }
    }
  },

  async switchChain(targetId) {
    if (!eip1193) return { success: false, error: 'Wallet not connected' }
    const hex = toHex(targetId)
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
            params: [{
              chainId: hex,
              chainName: chain.name,
              nativeCurrency: { name: chain.symbol, symbol: chain.symbol, decimals: 18 },
              rpcUrls: [chain.rpcUrl],
              blockExplorerUrls: [chain.explorer]
            }]
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
  onAccountsChanged(cb) { onAccChanged = cb },
  onChainChanged(cb) { onChainChanged = cb },
  onDisconnect(cb) { onDisconnected = cb },

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