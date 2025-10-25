import { createAppKit } from '@reown/appkit'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { ethers } from 'ethers'
import { projectId, metadata, reownNetworks, SUPPORTED_CHAINS } from '../config/walletConnectConfig'

const toHexChainId = (id) => '0x' + Number(id).toString(16)

// Single AppKit instance
const appKit = createAppKit({
  adapters: [new EthersAdapter()],
  networks: reownNetworks,
  metadata,
  projectId
})

// ---- internal state ----
let eip1193 = null
let browserProvider = null
let signer = null
let accounts = []
let chainId = null

// callbacks set by WalletContext
let onAccChanged = null
let onChainChanged = null
let onDisconnected = null

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

async function buildSignerFrom(eipProvider) {
  browserProvider = new ethers.BrowserProvider(eipProvider)
  signer = await browserProvider.getSigner()
  const addr = await signer.getAddress()
  const hex = await eipProvider.request({ method: 'eth_chainId' })
  accounts = [addr]
  chainId = hex
  return { addr, hex }
}

const walletService = {
  // Expose for debugging if needed
  getAppKit: () => appKit,

  async init() { /* nothing heavy here */ },

  // >>> The critical connect path
  async connect() {
    try {
      // Open modal
      await appKit.open()

      // Provider from AppKit
      eip1193 = await appKit.getProvider()
      if (!eip1193) return { success: false, error: 'No provider from AppKit' }

      // Make sure wallet actually exposes accounts (some wallets need this call)
      try {
        await eip1193.request({ method: 'eth_requestAccounts' })
      } catch {
        // ignore; some wallets already granted
      }

      // Always derive address from signer (reliable)
      const { addr, hex } = await buildSignerFrom(eip1193)

      attachListeners()

      return {
        success: true,
        accounts: [addr],
        account: addr,
        address: addr,
        chainId: hex,
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

  // Rebuild signer/address after refresh if wallet is still authorized
  async restoreSession() {
    try {
      const prov = await appKit.getProvider()
      if (!prov) return null

      eip1193 = prov
      const { addr, hex } = await buildSignerFrom(eip1193)
      attachListeners()
      return { accounts: [addr], account: addr, chainId: hex }
    } catch {
      return null
    }
  },

  async getAccounts() {
    if (!eip1193) return []
    try {
      const addr = accounts?.[0]
      return addr ? [addr] : []
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

  // event subscriptions from WalletContext
  onAccountsChanged(cb) { onAccChanged = cb },
  onChainChanged(cb) { onChainChanged = cb },
  onDisconnect(cb) { onDisconnected = cb },

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