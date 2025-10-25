import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
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

    // subscribe events
    walletService.onAccountsChanged((accs) => {
      if (!mounted) return
      setAccounts(accs || [])
      setAccount(accs?.[0] ?? null)
      setIsConnected(!!(accs && accs.length))
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

    // hydrate prior session
    ;(async () => {
      const s = await walletService.restoreSession()
      if (!mounted || !s) return
      setAccounts(s.accounts)
      setAccount(s.account)
      setChainId(s.chainId)
      setIsConnected(true)
    })()

    return () => {
      mounted = false
      walletService.destroy()
    }
  }, [])

  const connect = async () => {
    setLoading(true); setError(null)
   const res = await walletService.connect()
if (res.success) {
  setAccounts(res.accounts)
  setAccount(res.account || res.address) // <— keep this
  setChainId(res.chainId)
  setIsConnected(true)
} else {
  setError(res.error)
}
    setLoading(false)
    return res
  }

  const disconnect = async () => {
    setLoading(true); setError(null)
    const res = await walletService.disconnect()
    if (res.success) {
      setAccounts([])
      setAccount(null)
      setChainId(null)
      setIsConnected(false)
    } else {
      setError(res.error)
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
      isConnected,
      account,
      accounts,
      address: account,
      chainId,
      loading,
      error,
      connect,
      disconnect,
      switchChain,
      signMessage,
      sendTransaction,
      clearError: () => setError(null),
    }),
    [isConnected, account, accounts, chainId, loading, error]
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}