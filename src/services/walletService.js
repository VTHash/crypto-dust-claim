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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

// ---- internal helpers ----
async function rebuildEthersObjects() {
  if (!eip1193) {
    browserProvider = null
    signer = null
    return
  }

  // Recreate BrowserProvider + Signer (critical after chain changes)
  browserProvider = new ethers.BrowserProvider(eip1193)

  // Ensure we have accounts
  const accs = await eip1193.request?.({ method: 'eth_accounts' }).catch(() => [])
  accounts = Array.isArray(accs) ? accs : []

  // signer must be rebuilt after chain change (prevents “phantom approvals / no hash” issues)
  signer = accounts.length ? await browserProvider.getSigner() : null

  chainId = await eip1193.request?.({ method: 'eth_chainId' }).catch(() => null)
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

// ---- event handlers ----
function handleAccounts(accs = []) {
  accounts = Array.isArray(accs) ? accs : []
  // If accounts changed, rebuild signer to match current account
  ;(async () => {
    try {
      await rebuildEthersObjects()
    } catch (e) {
      console.warn('[walletService] rebuild after accountsChanged failed:', e)
    }
  })()

  onAccChanged?.(accounts)
}

function handleChain(hexId) {
  chainId = hexId

  // CRITICAL: rebuild ethers objects on chain change
  ;(async () => {
    try {
      await rebuildEthersObjects()
    } catch (e) {
      console.warn('[walletService] rebuild after chainChanged failed:', e)
    }
  })()

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

// Helpful error formatting (MetaMask / WalletConnect)

function normalizeTxError(err) {
  const code = err?.code
  const msg = err?.shortMessage ||
  err?.reason ||
  err?.message ||
  'Transaction failed'
  
  if (code === 4001) {
    return 'User rejected the request (4001)'
    if (code === -32002) {
      return 'Another request is already pending in MetaMask (-32002)'
    }
    return code ? `${msg} (${code})` : msg
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
      const maybeProvider = await appKit.getProvider?.()
      const injected = typeof window !== 'undefined' ? window.ethereum : null
      const prov = maybeProvider || injected
      if (!prov) return null

      const accs = await prov.request?.({ method: 'eth_accounts' })
      if (!accs || accs.length === 0) return null

      eip1193 = prov
      attachListeners()
      await rebuildEthersObjects()

      return {
        accounts,
        account: accounts[0],
        chainId,
        address: accounts[0],
        connected: true
      }
    } catch (err) {
      console.warn('[walletService] restoreSession error:', err)
      return null
    }
  },

  // Open modal and connect
  async connect() {
    try {
      await appKit.open()

      // Wait for provider to exist
      const waitFor = async (fn, predicate, timeoutMs = 30000, intervalMs = 250) => {
        const start = Date.now()
        while (true) {
          const val = await fn().catch(() => null)
          if (predicate(val)) return val
          if (Date.now() - start > timeoutMs) throw new Error('Wallet connect timed out')
          await sleep(intervalMs)
        }
      }

      eip1193 = await waitFor(() => appKit.getProvider(), (p) => !!p)

      attachListeners()

      // Force accounts to appear
      await waitFor(
        () => eip1193.request({ method: 'eth_accounts' }).catch(() => []),
        (arr) => Array.isArray(arr) && arr.length > 0
      )

      await rebuildEthersObjects()

      console.debug('[walletService] connected', { accounts, chainId })

      return {
        success: true,
        accounts,
        chainId,
        address: accounts[0] ?? null,
        signer
      }
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

  async getAccounts() {
    if (!eip1193) return []
    try {
      return await eip1193.request({ method: 'eth_accounts' })
    } catch {
      return []
    }
  },

  // IMPORTANT: always uses a fresh signer after chain changes
  async sendTransaction(tx) {
    try {
      if (!eip1193 || !signer || !accounts?.length) {
        const res = await this.connect()
        if (!res.success) return { success: false, error: res.error }
      }

      // Ensure signer is fresh for current chain/session
      await rebuildEthersObjects()
      if (!signer) return { success: false, error: 'No signer available' }

      const from = await signer.getAddress()
      const txFrom = tx?.from ? String(tx.from).toLowerCase() : null

      // If caller provided from, it must match signer address (prevents silent failures)
      if (txFrom && txFrom !== from.toLowerCase()) {
        return {
          success: false,
          error: `Tx "from" mismatch. Signer=${from} tx.from=${tx.from}`
        }
      }

      const req = {
        ...tx,
        from // always set from explicitly
      }

      console.debug('[walletService] sendTransaction', {
        chainId,
        from,
        to: req.to,
        hasData: !!req.data,
        value: req.value?.toString?.() ?? String(req.value ?? ''),
        gasLimit: req.gasLimit?.toString?.() ?? String(req.gasLimit ?? '')
      })

      const resp = await signer.sendTransaction(req)

      // Hard guard: if no hash, treat as not submitted
      if (!resp?.hash) {
        return {
          success: false,
          error: 'Wallet did not return a tx hash (transaction not submitted)'
        }
      }

      return { success: true, txHash: resp.hash }
    } catch (err) {
      return { success: false, error: normalizeTxError(err) }
    }
  },

  async signMessage(message) {
    try {
      if (!signer) {
        const res = await this.connect()
        if (!res.success) return { success: false, error: res.error }
      }
      await rebuildEthersObjects()
      if (!signer) return { success: false, error: 'No signer available' }

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

      // Give wallets a moment, then rebuild provider/signer
      await sleep(200)
      await rebuildEthersObjects()

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

          await sleep(200)
          await rebuildEthersObjects()

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
