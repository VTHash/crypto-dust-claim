// src/contexts/WalletContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import walletService from '../services/walletService'

const WalletContext = createContext(null)

export const useWallet = () => {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider')
  return ctx
}

export const WalletProvider = ({ children }) => {
  const [address, setAddress] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [chainId, setChainId] = useState(null) // hex like "0x1"
  const [isConnected, setIsConnected] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Subscribe to wallet events from walletService
  useEffect(() => {
    walletService.onAccountsChanged((accs) => {
      setAccounts(accs || [])
      const addr = accs?.[0] || null
      setAddress(addr)
      setIsConnected(!!addr)
    })

    walletService.onChainChanged((cid) => {
      setChainId(cid || null)
    })

    walletService.onDisconnect(() => {
      setAccounts([])
      setAddress(null)
      setChainId(null)
      setIsConnected(false)
    })
  }, [])

  // Try to restore a previous session (uses walletService.restoreSession)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const s = await walletService.restoreSession?.()
        if (!mounted || !s) return
        setAccounts(s.accounts || [])
        setAddress(s.address || s.account || null)
        setChainId(s.chainId || null)
        setIsConnected(!!(s.accounts?.length))
      } catch (e) {
        // non-fatal
        console.debug('restoreSession skipped:', e?.message)
      }
    })()
    return () => { mounted = false }
  }, [])

  // Actions
  const connect = async () => {
    setLoading(true)
    setError(null)
    const res = await walletService.connect()
    if (res?.success) {
      setAccounts(res.accounts || [])
      setAddress(res.address || res.accounts?.[0] || null)
      setChainId(res.chainId || null)
      setIsConnected(true)
    } else {
      setError(res?.error || 'Connect failed')
    }
    setLoading(false)
    return res
  }

  const disconnect = async () => {
    setLoading(true)
    setError(null)
    await walletService.disconnect()
    setAccounts([])
    setAddress(null)
    setChainId(null)
    setIsConnected(false)
    setLoading(false)
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
      loading,
      error,
      chainId,
      account: address,
      address,
      accounts,

      // actions
      connect,
      disconnect,
      switchChain,
      signMessage,
      sendTransaction,

      // helpers
      clearError: () => setError(null),
    }),
    [isConnected, loading, error, chainId, address, accounts]
  )

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  )
}
