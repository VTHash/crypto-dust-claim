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
 * 3) Provide "pendingRequest" state to drive an overlay.
 * 4) Keep React state authoritative (refresh from provider after actions).
 *
 * WC/mobile reality:
 * - Some wallets approve in-app, but the dApp only receives accounts after:
 *   - returning to the browser tab, OR
 *   - a short delay, OR
 *   - a few eth_accounts polls.
 * So we add a post-connect hydration loop (non-invasive).
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

      return {
        address: addr || accs?.[0] || null,
        chainId: cid || null,
        accounts: accs || []
      }
    } catch {
      return null
    }
  }

  const clearPending = () => safeSet(() => setPendingRequest(null))
  const setPending = (type, message) =>
    safeSet(() => setPendingRequest({ type, message, startedAt: Date.now() }))

  // --- NEW: post-connect hydration loop (critical for WalletConnect mobile) ---
  const waitForConnected = async ({
    timeoutMs = 90000,
    intervalMs = 500
  } = {}) => {
    const start = Date.now()

    // quick immediate refresh first
    await refreshFromProvider()

    while (Date.now() - start < timeoutMs) {
      // If already connected in state, stop
      if (mountedRef.current && (address || accounts?.length)) return true

      // Ask walletService directly (some WC providers hydrate there first)
      try {
        const ok = await walletService.isConnected?.()
        if (ok) {
          await refreshFromProvider()
          const nowAddr = await walletService.getAddress?.()
          if (nowAddr) return true
        } else {
          // Even if isConnected is false, accounts can still arrive late:
          // do a passive refresh anyway.
          await refreshFromProvider()
        }
      } catch {
        // ignore transient provider errors during WC handshake
      }

      await new Promise((r) => setTimeout(r, intervalMs))
    }

    return false
  }

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

        // Post-hydration refresh
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

  // --- NEW: mobile return-to-tab hydration triggers ---
  useEffect(() => {
    const onFocus = () => {
      // WalletConnect often completes while you're in the wallet app
      // and only becomes visible when focus returns.
      refreshFromProvider()
    }

    const onPageShow = () => refreshFromProvider()

    const onVis = () => {
      if (document.visibilityState === 'visible') refreshFromProvider()
    }

    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVis)

    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------- Actions ----------------

  // Single-flight connect prevents duplicate prompts/modals
  const connect = async () => {
    if (connectInFlightRef.current) return connectInFlightRef.current

    const p = (async () => {
      safeSet(() => {
        setLoading(true)
        setError(null)
      })

      try {
        setPending('connect', 'Approve the connection request in your wallet.')
        const res = await walletService.connect()

        // Even if walletService returns success, some WC wallets do not
        // immediately expose accounts to the dApp. We must hydrate.
        if (res?.success) {
          const ok = await waitForConnected({ timeoutMs: 90000, intervalMs: 500 })

          clearPending()
          safeSet(() => setLoading(false))

          if (!ok) {
            // Do not “crash”; just inform user and keep UI usable.
            safeSet(() => setError('Wallet connected in app, but did not sync to browser. Please return to the browser tab and try again.'))
            return { success: false, error: 'Wallet connected but not synced' }
          }

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
      // state
      isConnected,
      loading,
      error,
      pendingRequest,
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
