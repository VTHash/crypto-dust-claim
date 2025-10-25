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

// ---- single AppKit instance (do not create anywhere else) ----
const appKit = createAppKit({
  adapters: [new EthersAdapter()], // typo fix: EthersAdapter
  networks: reownNetworks,
  metadata: getReownMetadata(),
  projectId,
  enableInjectedProvider: true,
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

// ---- API ----
const walletService = {
  // getters / helpers
  getAppKit: () => appKit,
  async getProvider() { return eip1193 },
  async getBrowserProvider() { return browserProvider },
  async getSigner() { return signer },
  async getAddress() { return accounts?.[0] ?? null },
  async getChainId() { return chainId },
  async isConnected() { return !!(accounts?.length && signer) },
  openModal() { return appKit.open?.() },
  closeModal() { return appKit.close?.() },

  async init() {
    // nothing heavy here; instance already created
    return
  },

  // Try to re-hydrate a previous session (called by WalletContext on mount)
  async restoreSession() {
    try {
      // 1) Prefer an already-available EIP-1193 provider from AppKit
      const maybeProvider = await appKit.getProvider?.()
      // 2) Fallback to injected (MetaMask etc.) if present
      const injected = typeof window !== 'undefined' ? window.ethereum : null
      const prov = maybeProvider || injected
      if (!prov) return null

      // Pull accounts without opening the modal
      const accs = await prov.request?.({ method: 'eth_accounts' })
      if (!accs || accs.length === 0) return null

      // Set up internal state so the rest of the app sees "connected"
      eip1193 = maybeProvider || injected
      browserProvider = new ethers.BrowserProvider(eip1193)
      signer = await browserProvider.getSigner()
      accounts = accs
      chainId = await eip1193.request({ method: 'eth_chainId' })
      attachListeners()

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

  // Open modal and connect
  async connect() {
    try {
      // 1) Open the modal (doesn't guarantee user has finished connecting yet)
      await appKit.open();

      // 2) Wait for provider & accounts to become available (up to 30s)
      const waitFor = async (fn, predicate, timeoutMs = 30000, intervalMs = 250) => {
        const start = Date.now();
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const val = await fn();
          if (predicate(val)) return val;
          if (Date.now() - start > timeoutMs) throw new Error('Wallet connect timed out');
          await new Promise(r => setTimeout(r, intervalMs));
        }
      };

      // Wait until AppKit actually has an EIP-1193 provider
      eip1193 = await waitFor(
        () => appKit.getProvider(),
        (p) => !!p
      );

      // Build ethers objects
      browserProvider = new ethers.BrowserProvider(eip1193);
      signer = await browserProvider.getSigner();

      // Wait until the wallet returns at least one account
      accounts = await waitFor(
        () => eip1193.request({ method: 'eth_accounts' }).catch(() => []),
        (arr) => Array.isArray(arr) && arr.length > 0
      );

      // Get chainId (hex string like "0x1")
      chainId = await eip1193.request({ method: 'eth_chainId' });

      // Hook up listeners once we’re sure we have the provider
      attachListeners();

      // Optional: small debug
      console.debug('[walletService] connected', { accounts, chainId });

      return {
        success: true,
        accounts,
        chainId,
        address: accounts[0] ?? null,
        signer
      };
    } catch (err) {
      // Optional: small debug
      console.warn('[walletService] connect error:', err?.message || err);
      return { success: false, error: err?.message || 'Connect failed' };
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
    try { return await eip1193.request({ method: 'eth_accounts' }) }
    catch { return [] }
  },

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