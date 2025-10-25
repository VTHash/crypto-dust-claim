import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import walletService from '../services/walletService'

const WalletContext = createContext(null)
export const useWallet = () => {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider')
  return ctx
}

export const WalletProvider = ({ children }) => {
  const [account, setAccount] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [chainId, setChainId] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    walletService.init()

    walletService.onAccountsChanged((accs) => {
      if (!mounted) return
      setAccounts(accs || [])
      const addr = accs?.[0] ?? null
      setAccount(addr)
      setIsConnected(!!addr)
    })

    walletService.onChainChanged((cid) => {
      if (!mounted) return
      setChainId(cid)
    })

    walletService.onDisconnect(() => {
      if (!mounted) return
      setAccounts([])
      setAccount(null)
      setChainId(null)
      setIsConnected(false)
    })

    // Restore previous session if wallet already authorized
    ;(async () => {
      const s = await walletService.restoreSession()
      if (!mounted || !s) return
      setAccounts(s.accounts || [])
      setAccount(s.address || s.account || null)
      setChainId(s.chainId || null)
      setIsConnected(!!(s.accounts && s.accounts.length))
    })()

    return () => {
      mounted = false
      walletService.destroy()
    }
  }, [])

  // actions
  const connect = async () => {
    setLoading(true)
    setError(null)
    const res = await walletService.connect()
    if (res.success) {
      setAccounts(res.accounts || [])
      setAccount(res.address || res.account || null) // <- important
      setChainId(res.chainId || null)
      setIsConnected(true)
    } else {
      setError(res.error)
    }
    setLoading(false)
    return res
  }

  const disconnect = async () => {
    setLoading(true)
    setError(null)
    const res = await walletService.disconnect()
    if (res.success) {
      setAccounts([])
      setAccount(null)
      setChainId(null)
      setIsConnected(false)
    }
    setLoading(false)
    return res
  }

  const switchChain = async (targetId) => {
    setError(null)
    const res = await walletService.switchChain(targetId)
    if (!res.success) setError(res.error)
    return res
  }

  const signMessage = async (msg) => {
    const res = await walletService.signMessage(msg)
    if (!res.success) setError(res.error)
    return res
  }

  const sendTransaction = async (tx) => {
    const res = await walletService.sendTransaction(tx)
    if (!res.success) setError(res.error)
    return res
  }

  const value = useMemo(
    () => ({
      // state
      isConnected,
      account,
      accounts,
      address: account,
      chainId,
      loading,
      error,

      // actions
      connect,
      disconnect,
      switchChain,
      signMessage,
      sendTransaction,

      // helpers
      clearError: () => setError(null),
    }),
    [isConnected, account, accounts, chainId, loading, error]
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}