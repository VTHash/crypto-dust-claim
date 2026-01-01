// src/contexts/WalletContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
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
  const [chainId, setChainId] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pendingRequest, setPendingRequest] = useState(null)
  const [error, setError] = useState(null)

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const safeSet = (fn) => {
    if (!mountedRef.current) return
    fn()
  }
  
  const manualDisconnectAtRef = useRef(0)
  const MANUAL_DISCONNECT_COOLDOWN_MS = 8000

  const connectInFlightRef = useRef(null)
  const txQueueRef = useRef(Promise.resolve())

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  const refreshFromProvider = async () => {
    try {
      const addr = await walletService.getAddress?.()
      const cid = await walletService.getChainId?.()
      const accs = (await walletService.getAccounts?.()) || (addr ? [addr] : [])
      safeSet(() => {
        setAccounts(accs || [])
        setAddress(addr || accs?.[0] || null)
        setChainId(cid || null)
        setIsConnected(!!(addr || accs?.[0]))
      })
      return { address: addr || accs?.[0] || null, chainId: cid || null, accounts: accs || [] }
    } catch {
      return null
    }
  }

  const clearPending = () => safeSet(() => setPendingRequest(null))
  const setPending = (type, message) =>
    safeSet(() => setPendingRequest({ type, message, startedAt: Date.now() }))

  // Subscribe to wallet events from walletService
  useEffect(() => {
    walletService.onAccountsChanged((accs) => {
      safeSet(() => {
        setAccounts(accs || [])
        const addr = accs?.[0] || null
        setAddress(addr)
        setIsConnected(!!addr)
      })
    })

    walletService.onChainChanged((cid) => {
      safeSet(() => setChainId(cid || null))
    })

    walletService.onDisconnect(() => {
      safeSet(() => {
        setAccounts([])
        setAddress(null)
        setChainId(null)
        setIsConnected(false)
        setPendingRequest(null)
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Restore session
    useEffect(() => {
      let cancelled = false
      ;(async () => {
        try {
          const s = await walletService.restoreSession?.()
          const since = Date.now() - (manualDisconnectAtRef.current || 0)
  
          // If cancelled, no session, or user recently disconnected, do not auto-restore
          if (cancelled) return 
          if (since < MANUAL_DISCONNECT_COOLDOWN_MS) return
          if (!s) {
            await refreshFromProvider()
            return
          }
  
          safeSet(() => {
            setAccounts(s.accounts || [])
            setAddress(s.address || s.account || s.accounts?.[0] || null)
            setChainId(s.chainId || null)
            setIsConnected(!!(s.address || s.account || s.accounts?.[0]))
          })
  
          setTimeout(() => {
            if (cancelled) return
            const since2 = Date.now() - (manualDisconnectAtRef.current || 0)
            if (since2 < MANUAL_DISCONNECT_COOLDOWN_MS) {
              // User recently disconnected, do not auto-restore
              return
            }
            refreshFromProvider()
          }, 600)
        } catch (err) {
          // On error, attempt a provider refresh and ignore
          try { await refreshFromProvider() } catch { }
        }
      })()
      return () => {
        cancelled = true
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

  // Single-flight connect
  const connect = async () => {
    if (connectInFlightRef.current) return connectInFlightRef.current

    const p = (async () => {
      safeSet(() => {
        setLoading(true)
        setError(null)
      })

      try {
        setPending('connect', 'Approve the connection request in your wallet, then return to the browser.')

        const res = await walletService.connect()

        // Even if WalletConnect provider hydration is slow, keep trying to refresh state
        // This prevents "connected in wallet, timed out in app"
        const start = Date.now()
        const maxMs = 90_000 // UI wait (provider may already be connected in AppKit)
        let last = null

        while (Date.now() - start < maxMs) {
          last = await refreshFromProvider()
          if (last?.address) break
          await sleep(500)
        }

        clearPending()
        safeSet(() => setLoading(false))

        // If we still do not have an address, surface a meaningful error
        if (!last?.address) {
          safeSet(() => setError(res?.error || 'Wallet connected in modal, but provider did not return to the app. Please return to the browser tab and try again.'))
          return { success: false, error: res?.error || 'Wallet connect timed out' }
        }

  return { success: true, ...res }
} catch (err) {
  clearPending()
  safeSet(() => {
    setError(err?.message || 'Connect failed')
    setLoading(false)
  })
  return { success: false, error: err?.message || 'Connect failed' }
} finally {
  connectInFlightRef.current = null
}
})()

    connectInFlightRef.current = p
    return p
  }

  const disconnect = async () => {
    manualDisconnectAtRef.current = Date.now()

  safeSet(() => {
    setLoading(true)
    setError(null)
    setPendingRequest(null)
  })

  try {
    await walletService.disconnect()
  } finally {
    // hard reset UI state
    safeSet(() => {
      setAccounts([])
      setAddress(null)
      setChainId(null)
      setIsConnected(false)
      setLoading(false)
    })

    // Do not refresh right away, as some wallets take a moment to process the disconnect
    // WalletConnect/AppKit can report still connected immediately after disconnect
    await sleep(800)
    try { await refreshFromProvider() } catch { /* ignore */ }
  }
  }

  const switchChain = async (targetId) => {
    safeSet(() => setError(null))
    try {
      setPending('switchChain', 'Confirm the network switch in your wallet.')
      const res = await walletService.switchChain(targetId)
      if (!res?.success) {
        clearPending()
        safeSet(() => setError(res?.error || 'Failed to switch chain'))
        return res
      }
      await refreshFromProvider()
      clearPending()
      return res
    } catch (err) {
      clearPending()
      safeSet(() => setError(err?.message || 'Failed to switch chain'))
      return { success: false, error: err?.message || 'Failed to switch chain' }
    }
  }

  const signMessage = async (msg) => {
    safeSet(() => setError(null))
    try {
      if (!(await walletService.isConnected?.())) {
        const c = await connect()
        if (!c?.success) return c
      }
      setPending('sign', 'Approve the signature request in your wallet.')
      const res = await walletService.signMessage(msg)
      clearPending()
      if (!res?.success) safeSet(() => setError(res?.error || 'Sign failed'))
      return res
    } catch (err) {
      clearPending()
      safeSet(() => setError(err?.message || 'Sign failed'))
      return { success: false, error: err?.message || 'Sign failed' }
    }
  }

  const sendTransaction = async (tx) => {
    const job = async () => {
      safeSet(() => setError(null))
      try {
        if (!(await walletService.isConnected?.())) {
          const c = await connect()
          if (!c?.success) return c
        }

        setPending('transaction', 'Confirm the transaction in your wallet.')
        const res = await walletService.sendTransaction(tx)
        clearPending()

        if (!res?.success) {
          safeSet(() => setError(res?.error || 'Transaction failed'))
          return res
        }

        await refreshFromProvider()
        return res
      } catch (err) {
        clearPending()
        const msg = err?.message || 'Transaction failed'
        safeSet(() => setError(msg))
        return { success: false, error: msg }
      }
    }

    const queued = txQueueRef.current.then(job, job)
    txQueueRef.current = queued.catch(() => undefined)
    return queued
  }

  const value = useMemo(
    () => ({
      isConnected,
      loading,
      error,
      pendingRequest,
      chainId,
      account: address,
      address,
      accounts,
      connect,
      disconnect,
      switchChain,
      signMessage,
      sendTransaction,
      clearError: () => setError(null),
      clearPending: () => setPendingRequest(null),
      refresh: refreshFromProvider
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isConnected, loading, error, pendingRequest, chainId, address, accounts]
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}