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
  const [chainId, setChainId] = useState(null) // hex like "0x1"
  const [isConnected, setIsConnected] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pendingRequest, setPendingRequest] = useState(null) // { type, message, startedAt }
  const [error, setError] = useState(null)

  // Prevent setState on unmounted component
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

  // ---- single-flight guards ----
  const connectInFlightRef = useRef(null) // Promise
  const txQueueRef = useRef(Promise.resolve()) // serialized queue

  // ---- helpers ----
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

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  // IMPORTANT: WalletConnect wallets can take a long time to hydrate accounts.
  // This loop polls until accounts appear, without blocking the UI indefinitely.
  const hydrateUntilAccounts = async (timeoutMs = 180000, intervalMs = 750) => {
    const start = Date.now()

    while (Date.now() - start < timeoutMs) {
      const snap = await refreshFromProvider()
      if (snap?.address || snap?.accounts?.length) return { success: true, ...snap }

      // If the provider reports "connected" but accounts are empty, keep waiting.
      await sleep(intervalMs)
    }

    return {
      success: false,
      error:
        'WalletConnect approved in your wallet, but accounts were not returned to the browser. Return to this tab and try again.'
    }
  }

  // ---- init once ----
  useEffect(() => {
    walletService.init?.().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refresh when user returns from a wallet app
  useEffect(() => {
    const onReturn = () => {
      refreshFromProvider().catch(() => {})
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onReturn)
      window.addEventListener('pageshow', onReturn)
    }

    const onVis = () => {
      if (document.visibilityState === 'visible') onReturn()
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onReturn)
        window.removeEventListener('pageshow', onReturn)
      }
      document.removeEventListener('visibilitychange', onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Subscribe to wallet events from walletService (authoritative)
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

  // Restore a previous session
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const s = await walletService.restoreSession?.()
        if (cancelled || !s) {
          await refreshFromProvider()
          return
        }

        safeSet(() => {
          setAccounts(s.accounts || [])
          setAddress(s.address || s.account || s.accounts?.[0] || null)
          setChainId(s.chainId || null)
          setIsConnected(!!(s.accounts?.length))
        })

        setTimeout(() => {
          if (!cancelled) refreshFromProvider()
        }, 600)
      } catch {
        setTimeout(() => {
          if (!cancelled) refreshFromProvider()
        }, 600)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------- Actions ----------------

  // KEY CHANGE:
  // - Do NOT allow UI to wait forever on walletService.connect() for WC wallets.
  // - If walletService.connect() stalls, we stop loading and keep polling hydration.
  const connect = async () => {
    if (connectInFlightRef.current) return connectInFlightRef.current

    const p = (async () => {
      safeSet(() => {
        setLoading(true)
        setError(null)
      })

      setPending(
        'connect',
        'Approve the connection in your wallet. If using WalletConnect, return to this browser tab after approving.'
      )

      // Start connect, but do not allow it to freeze the UI forever.
      const CONNECT_UI_TIMEOUT_MS = 12000

      try {
        const connectPromise = walletService.connect()

        // If connect resolves quickly (MetaMask / fast wallets), use it.
        // If it does not, we stop the spinner and switch to hydration polling mode.
        const res = await Promise.race([
          connectPromise,
          (async () => {
            await sleep(CONNECT_UI_TIMEOUT_MS)
            return { success: null, pending: true }
          })()
        ])

        // Pending = WalletConnect / slow wallet path
        if (res?.pending) {
          safeSet(() => setLoading(false))
          // Keep pending overlay; hydration loop will eventually flip UI to connected.
          const settled = await hydrateUntilAccounts(180000, 750)
          clearPending()

          if (settled?.success) return { success: true, ...settled }

          safeSet(() => setError(settled?.error || 'Connect pending'))
          return { success: false, error: settled?.error || 'Connect pending' }
        }

        // Normal path (connect returned)
        if (res?.success) {
          // Even after success, WC wallets may return accounts late
          const settled = await hydrateUntilAccounts(180000, 750)
          clearPending()

          safeSet(() => setLoading(false))

          if (settled?.success) return { success: true, ...settled }

          safeSet(() => setError(settled?.error || 'Connect pending'))
          return { success: false, error: settled?.error || 'Connect pending' }
        }

        // Connect returned failure
        clearPending()
        safeSet(() => {
          setError(res?.error || 'Connect failed')
          setLoading(false)
        })
        return res
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
    safeSet(() => {
      setLoading(true)
      setError(null)
      setPendingRequest(null)
    })
    try {
      await walletService.disconnect()
    } finally {
      safeSet(() => {
        setAccounts([])
        setAddress(null)
        setChainId(null)
        setIsConnected(false)
        setLoading(false)
      })
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