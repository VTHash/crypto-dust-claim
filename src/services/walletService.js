import { createAppKit } from '@reown/appkit'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { ethers } from 'ethers'
import { projectId, metadata, reownNetworks, SUPPORTED_CHAINS } from '../config/walletConnectConfig'

const toHexChainId = (id) => '0x' + Number(id).toString(16)

// --- AppKit (single instance) ---
const appKit = createAppKit({
  adapters: [new EthersAdapter()],
  networks: reownNetworks,
  metadata,
  projectId
})

// ---- internal state ----
let eip1193 = null // EIP-1193 provider from AppKit
let browserProvider = null // ethers.BrowserProvider
let signer = null // ethers.Signer
let accounts = [] // string[]
let chainId = null // hex string like "0x1"

// callbacks wired from context/UI
let onAccChanged = null
let onChainChanged = null
let onDisconnected = null

function handleAccounts(accs = []) {
  accounts = Array.isArray(accs) ? accs : []
  if (onAccChanged) onAccChanged(accounts)
}

function handleChain(hexId) {
  chainId = hexId
  if (onChainChanged) onChainChanged(hexId)
}

function handleDisconnect(err) {
  accounts = []
  chainId = null
  signer = null
  browserProvider = null
  if (onDisconnected) onDisconnected(err)
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

const walletService = {
  // -------- getters / helpers --------
  getAppKit: () => appKit,
  async getProvider() { return eip1193 },
  async getBrowserProvider() { return browserProvider },
  async getSigner() { return signer },
  async getAddress() { return accounts?.[0] ?? null },
  async getChainId() { return chainId },
  async isConnected() { return !!(accounts?.length && signer) },
  openModal() { return appKit.open?.() },
  closeModal() { return appKit.close?.() },

  // -------- lifecycle --------
  async init() {
    // nothing heavy; instance is created above
    return
  },

  async connect() {
    try {
      await appKit.open() // user picks wallet/chain

      eip1193 = await appKit.getProvider()
      if (!eip1193) return { success: false, error: 'No provider from AppKit' }

      browserProvider = new ethers.BrowserProvider(eip1193)
      signer = await browserProvider.getSigner()

      accounts = await eip1193.request({ method: 'eth_accounts' })
      chainId = await eip1193.request({ method: 'eth_chainId' })

      attachListeners()

      return { success: true, accounts, chainId, address: accounts[0] ?? null, signer }
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

  // -------- actions --------
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

  // -------- subscriptions --------
  onAccountsChanged(cb) { onAccChanged = cb },
  onChainChanged(cb) { onChainChanged = cb },
  onDisconnect(cb) { onDisconnected = cb },

  // -------- cleanup --------
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
