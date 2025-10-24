import { createAppKit } from '@reown/appkit'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { ethers } from 'ethers'
import { projectId, metadata, reownNetworks, SUPPORTED_CHAINS } from '../config/walletConnectConfig'

const toHexChainId = (id) => '0x' + Number(id).toString(16)

// --- AppKit (single instance) ---
const appKit = createAppKit({
  adapters: [new EthersAdapter()],
  networks: reownNetworks, // array from @reown/appkit/networks
  metadata,
  projectId
})

// Internal state
let eip1193 = null // AppKit gives an EIP-1193 provider after connect
let browserProvider = null
let signer = null
let accounts = []
let chainId = null

// Event callbacks (wired by WalletContext)
let onAccChanged = null
let onChainChanged = null
let onDisconnect = null

function attachListeners() {
  if (!eip1193) return
  eip1193.removeListener?.('accountsChanged', handleAccounts)
  eip1193.removeListener?.('chainChanged', handleChain)
  eip1193.removeListener?.('disconnect', handleDisc)
  eip1193.on?.('accountsChanged', handleAccounts)
  eip1193.on?.('chainChanged', handleChain)
  eip1193.on?.('disconnect', handleDisc)
}

function handleAccounts(accs) {
  accounts = Array.isArray(accs) ? accs : []
  onAccChanged && onAccChanged(accounts)
}
function handleChain(hexId) {
  chainId = hexId
  onChainChanged && onChainChanged(hexId)
}
function handleDisc(err) {
  accounts = []
  chainId = null
  signer = null
  browserProvider = null
  onDisconnect && onDisconnect(err)
}

// Public API used by WalletContext
const walletService = {
  // expose AppKit if you need to open the modal yourself elsewhere
  getAppKit: () => appKit,

  async init() {
    // Nothing heavy to do here; AppKit instance is already created.
    return
  },

  async connect() {
    try {
      // Open the modal – user picks a wallet/chain
      await appKit.open()

      // Once connected, get the EIP-1193 provider
      eip1193 = await appKit.getProvider() // provided by EthersAdapter
      if (!eip1193) {
        return { success: false, error: 'No provider from AppKit' }
      }

      // Wrap with ethers
      browserProvider = new ethers.BrowserProvider(eip1193)
      signer = await browserProvider.getSigner()

      accounts = await eip1193.request({ method: 'eth_accounts' })
      chainId = await eip1193.request({ method: 'eth_chainId' })

      attachListeners()

      return {
        success: true,
        accounts,
        chainId,
        address: accounts[0] ?? null
      }
    } catch (err) {
      return { success: false, error: err?.message || 'Connect failed' }
    }
  },

  async disconnect() {
    try {
      // Close session (AppKit handles supported connectors)
      await appKit.disconnect?.()
    } finally {
      handleDisc()
    }
    return { success: true }
  },

  async getAccounts() {
    try {
      if (!eip1193) return []
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
      const sig = await signer.signMessage(message)
      return { success: true, signature: sig }
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

  onAccountsChanged(cb) { onAccChanged = cb },
  onChainChanged(cb) { onChainChanged = cb },
  onDisconnect(cb) { onDisconnect = cb },

  destroy() {
    if (eip1193) {
      eip1193.removeListener?.('accountsChanged', handleAccounts)
      eip1193.removeListener?.('chainChanged', handleChain)
      eip1193.removeListener?.('disconnect', handleDisc)
    }
    eip1193 = null
    browserProvider = null
    signer = null
    accounts = []
    chainId = null
  }
}

export default walletService