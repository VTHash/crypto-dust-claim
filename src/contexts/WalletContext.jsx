// src/contexts/WalletContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import walletService from '../services/walletService'

const WalletContext = createContext(null)

export const useWallet = () => {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider')
  return ctx
}

/**
 * WalletProvider goals:
 * 1) Never double-open MetaMask/AppKit prompts (single-flight connect).
 * 2) Never send concurrent EIP-1193 requests that trigger -32002 on mobile (tx queue).
 * 3) Provide "pendingRequest" state to drive an overlay: user must return to MetaMask.
 * 4) Keep React state authoritative (refresh from provider after actions).
 */
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

  // Restore a previous session (mobile often needs a short delay to hydrate)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Attempt restore
        const s = await walletService.restoreSession?.()
        if (cancelled || !s) {
          // Even if restoreSession returns null, try a passive refresh (eth_accounts can work)
          await refreshFromProvider()
          return
        }

        safeSet(() => {
          setAccounts(s.accounts || [])
          setAddress(s.address || s.account || s.accounts?.[0] || null)
          setChainId(s.chainId || null)
          setIsConnected(!!(s.accounts?.length))
        })

        // Post-hydration refresh (MetaMask mobile can lag)
        setTimeout(() => {
          if (!cancelled) refreshFromProvider()
        }, 600)
      } catch (e) {
        // non-fatal
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

  /**
   * Single-flight connect prevents duplicate prompts/modals
   *
   * NEW (safe): connect(options?)
   * - options is forwarded to walletService.connect(options)
   * - keeps backwards compatibility: connect() behaves exactly the same
   */
  const connect = async (options) => {
    if (connectInFlightRef.current) return connectInFlightRef.current

    const p = (async () => {
      safeSet(() => {
        setLoading(true)
        setError(null)
      })

      try {
        setPending('connect', 'Approve the connection request in your wallet.')

        // ✅ forward connect preferences (modal/injected/auto) without breaking existing calls
        const res = await walletService.connect(options)

        if (res?.success) {
          // Refresh from provider to be authoritative (addresses/chain may differ)
          await refreshFromProvider()
          clearPending()
          safeSet(() => setLoading(false))
          return res
        }

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

      // MetaMask mobile can report chainChanged late; force refresh
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

  /**
   * sendTransaction is serialized to avoid:
   * - MetaMask mobile concurrent prompt bugs
   * - -32002 "request already pending"
   */
  const sendTransaction = async (tx) => {
    const job = async () => {
      safeSet(() => setError(null))

      try {
        // Ensure connected (but do not double prompt)
        if (!(await walletService.isConnected?.())) {
          const c = await connect()
          if (!c?.success) return c
        }

        setPending('transaction', 'Confirm the transaction in your wallet.')

        const res = await walletService.sendTransaction(tx)

        // IMPORTANT: clear pending even if failed, so UI unblocks
        clearPending()

        if (!res?.success) {
          safeSet(() => setError(res?.error || 'Transaction failed'))
          return res
        }

        // After broadcast, force refresh (addresses/chain remain consistent)
        await refreshFromProvider()

        return res
      } catch (err) {
        clearPending()
        const msg = err?.message || 'Transaction failed'
        safeSet(() => setError(msg))
        return { success: false, error: msg }
      }
    }

    // Serialize jobs
    const queued = txQueueRef.current.then(job, job)
    // Keep queue alive even if one fails
    txQueueRef.current = queued.catch(() => undefined)
    return queued
  }

  const value = useMemo(
    () => ({
      // state
      isConnected,
      loading,
      error,
      pendingRequest, // { type, message, startedAt }
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
      clearPending: () => setPendingRequest(null),
      refresh: refreshFromProvider
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isConnected, loading, error, pendingRequest, chainId, address, accounts]
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}