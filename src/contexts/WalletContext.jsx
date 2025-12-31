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
 * 3) Provide "pendingRequest" state to drive an overlay: user must return to wallet/dApp.
 * 4) Keep React state authoritative (refresh from provider after actions).
 *
 * WalletConnect mobile reality:
 * - User approves in the wallet app
 * - Wallet often does NOT auto-redirect back to the dApp tab
 * - Provider/accounts can appear only AFTER user returns to the browser tab
 * => We must "post-connect poll" + refresh on focus/pageshow/visibilitychange.
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

  // 1) INIT wallet service once (important for AppKit/WC session behavior + reconciler)
  useEffect(() => {
    walletService.init?.().catch(() => {})
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

  // 2) Refresh aggressively when the user returns to the tab (WalletConnect mobile)
  useEffect(() => {
    const onReturn = () => {
      // This is the moment WC wallets finally hydrate the provider/accounts in the browser tab.
      refreshFromProvider().catch(() => {})
    }

    window.addEventListener('focus', onReturn)
    window.addEventListener('pageshow', onReturn)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') onReturn()
    })

    return () => {
      window.removeEventListener('focus', onReturn)
      window.removeEventListener('pageshow', onReturn)
      // visibilitychange listener is anonymous; ok to leave (or refactor to named if you prefer)
    }
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

        setTimeout(() => {
          if (!cancelled) refreshFromProvider()
        }, 800)
      } catch {
        setTimeout(() => {
          if (!cancelled) refreshFromProvider()
        }, 800)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 3) WalletConnect “post-connect poll”
  // Why: some wallets show “connected” but the dApp only sees accounts after the user returns to the browser tab.
  const waitUntilConnected = async ({
    timeoutMs = 180000, // 3 minutes
    intervalMs = 750
  } = {}) => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const ok = await walletService.isConnected?.().catch(() => false)
      if (ok) {
        const snap = await refreshFromProvider()
        if (snap?.address) return { success: true, ...snap }
      }
      await new Promise((r) => setTimeout(r, intervalMs))
    }
    return { success: false, error: 'Wallet connection pending — return to this tab to finish.' }
  }

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
        setPending(
          'connect',
          'Approve the connection in your wallet. If you used WalletConnect, return to this browser tab after approving.'
        )

        // Open modal / connect flow
        const res = await walletService.connect()

        // MetaMask injected usually resolves immediately; WC wallets often need “return to tab”.
        // So we ALWAYS do a post-connect poll.
        const settled = await waitUntilConnected({ timeoutMs: 180000, intervalMs: 750 })

        if (settled?.success) {
          clearPending()
          safeSet(() => setLoading(false))
          return { success: true, ...settled }
        }

        // If walletService.connect returned success but accounts didn't hydrate yet,
        // we should NOT hard-fail immediately; keep a helpful message.
        clearPending()
        safeSet(() => {
          setLoading(false)
          setError(
            res?.error ||
              settled?.error ||
              'Wallet connected in your wallet app, but not yet detected here. Return to this tab and wait a moment.'
          )
        })
        return { success: false, error: res?.error || settled?.error || 'Connect pending' }
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
