import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import walletService from '../services/walletService'

const WalletContext = createContext(null)
export const useWallet = () => useContext(WalletContext)

export const WalletProvider = ({ children }) => {
  const [account, setAccount] = useState(null)
  const [chainId, setChainId] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    walletService.onAccountsChanged((accs) => {
      const addr = accs?.[0] ?? null
      setAccount(addr)
      setIsConnected(!!addr)
    })
    walletService.onChainChanged((cid) => setChainId(cid))
    walletService.onDisconnect(() => {
      setAccount(null)
      setIsConnected(false)
      setChainId(null)
    })
  }, [])

  const connect = async () => {
    setLoading(true); setError(null)
    const res = await walletService.connect()
    setLoading(false)
    if (!res.success) { setError(res.error); return res }
    setAccount(res.account)
    setChainId(res.chainId)
    setIsConnected(true)
    return res
  }

  const disconnect = async () => {
    setLoading(true)
    await walletService.disconnect()
    setAccount(null); setIsConnected(false); setChainId(null)
    setLoading(false)
  }

  const value = useMemo(() => ({
    address: account,
    account,
    chainId,
    isConnected,
    loading,
    error,
    connect,
    disconnect,
    switchChain: walletService.switchChain
  }), [account, chainId, isConnected, loading, error])

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}