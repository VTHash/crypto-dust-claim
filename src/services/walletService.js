import { createAppKit } from '@reown/appkit'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { ethers } from 'ethers'
import { projectId, metadata, reownNetworks, SUPPORTED_CHAINS } from '../config/walletConnectConfig'

const toHexChainId = (id) => '0x' + Number(id).toString(16)

const appKit = createAppKit({
  adapters: [new EthersAdapter()],
  networks: reownNetworks,
  metadata,
  projectId
})

let eip1193 = null
let browserProvider = null
let signer = null
let accounts = []
let chainId = null

let onAccChanged = null
let onChainChanged = null
let onDisconnected = null

function handleAccounts(accs = []) {
  accounts = Array.isArray(accs) ? accs : []
  onAccChanged && onAccChanged(accounts)
}
function handleChain(cid) {
  chainId = cid
  onChainChanged && onChainChanged(cid)
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

async function waitForProvider() {
  for (let i = 0; i < 20; i++) {
    const p = await appKit.getProvider?.()
    if (p) return p
    await new Promise((r) => setTimeout(r, 150))
  }
  if (typeof window !== 'undefined' && window.ethereum) return window.ethereum
  return null
}

const walletService = {
  getAppKit: () => appKit,
  async getSigner() { return signer },
  async getProvider() { return eip1193 },

  async connect() {
    try {
      await appKit.open()
      eip1193 = await waitForProvider()
      if (!eip1193) return { success: false, error: 'No provider from AppKit' }

      browserProvider = new ethers.BrowserProvider(eip1193)
      signer = await browserProvider.getSigner()

      try {
        accounts = await eip1193.request({ method: 'eth_requestAccounts' })
      } catch {
        accounts = await eip1193.request?.({ method: 'eth_accounts' }) ?? []
      }
      chainId = await eip1193.request?.({ method: 'eth_chainId' })
      attachListeners()

      return { success: true, accounts, account: accounts[0] ?? null, chainId, signer }
    } catch (err) {
      return { success: false, error: err?.message || 'Connect failed' }
    }
  },

  async disconnect() {
    try { await appKit.disconnect?.() } finally { handleDisconnect() }
    return { success: true }
  },

  async switchChain(targetId) {
    if (!eip1193) return { success: false, error: 'Wallet not connected' }
    const hex = toHexChainId(targetId)
    try {
      await eip1193.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] })
      return { success: true }
    } catch (err) {
      if (err.code === 4902) {
        const c = SUPPORTED_CHAINS[targetId]
        if (!c) return { success: false, error: 'Unsupported chain' }
        await eip1193.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: hex,
            chainName: c.name,
            nativeCurrency: { name: c.symbol, symbol: c.symbol, decimals: 18 },
            rpcUrls: [c.rpcUrl],
            blockExplorerUrls: [c.explorer]
          }]
        })
        return { success: true, added: true }
      }
      return { success: false, error: err.message }
    }
  },

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