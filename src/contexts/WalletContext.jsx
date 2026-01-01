// src/contexts/WalletContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import walletService from '../services/walletService'

const WalletContext = createContext(null)

export const useWallet = () => {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider')
  return ctx
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * WalletProvider goals:
 * 1) Never double-open prompts/modals (single-flight connect).
 * 2) Never send concurrent EIP-1193 requests that trigger -32002 on mobile (tx queue).
 * 3) Provide pendingRequest state for overlays (user must return to wallet).
 * 4) Keep React state authoritative (refresh from provider after actions).
 * 5) WalletConnect mobile: reconcile AFTER user approves in wallet and returns to dapp tab.
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

  // ---- WalletConnect reconcile window ----
  const reconcileRef = useRef({
    active: false,
    startedAt: 0,
    // how long we keep trying after user approves in wallet
    maxMs: 120000, // 2 min
    pollMs: 700
  })

  const clearPending = () => safeSet(() => setPendingRequest(null))
  const setPending = (type, message) =>
    safeSet(() => setPendingRequest({ type, message, startedAt: Date.now() }))

  const stopReconcile = () => {
    reconcileRef.current.active = false
  }

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

  const isActuallyConnected = async () => {
    try {
      const ok = await walletService.isConnected?.()
      if (ok) return true
      // fallback: some providers return false but still have accounts later
      const accs = await walletService.getAccounts?.()
      return Array.isArray(accs) && accs.length > 0
    } catch {
      return false
    }
  }

  /**
   * Critical piece:
   * after user approves in Trust/Uniswap/etc, the provider/accounts may appear later.
   * This loop keeps checking restoreSession + eth_accounts for a window.
   */
  const reconcileUntilConnected = async () => {
    const st = reconcileRef.current
    if (!st.active) return false

    const deadline = st.startedAt + st.maxMs
    while (st.active && Date.now() < deadline) {
      try {
        // restoreSession is safe and can hydrate WC providers
        await walletService.restoreSession?.()
      } catch {
        // ignore
      }

      const ok = await isActuallyConnected()
      if (ok) {
        await refreshFromProvider()
        return true
      }

      await sleep(st.pollMs)
    }

    return false
  }

  // ---- subscribe to walletService events (authoritative) ----
  useEffect(() => {
    walletService.onAccountsChanged((accs) => {
      safeSet(() => {
        const a = Array.isArray(accs) ? accs : []
        setAccounts(a)
        setAddress(a?.[0] || null)
        setIsConnected(!!a?.[0])
      })
    })

    walletService.onChainChanged((cid) => {
      safeSet(() => setChainId(cid || null))
    })

    walletService.onDisconnect(() => {
      stopReconcile()
      safeSet(() => {
        setAccounts([])
        setAddress(null)
        setChainId(null)
        setIsConnected(false)
        setPendingRequest(null)
        setLoading(false)
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- restore session on load ----
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const s = await walletService.restoreSession?.()
        if (cancelled) return

        if (!s) {
          await refreshFromProvider()
          return
        }

        safeSet(() => {
          setAccounts(s.accounts || [])
          setAddress(s.address || s.account || s.accounts?.[0] || null)
          setChainId(s.chainId || null)
          setIsConnected(!!(s.accounts?.length))
        })

        // post-hydration refresh
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

  // ---- key: when user returns from wallet app, try to finalize connection ----
  useEffect(() => {
    const onReturn = async () => {
      // If we are in a connect flow, try to reconcile to completion.
      if (reconcileRef.current.active) {
        const ok = await reconcileUntilConnected()
        if (ok) {
          stopReconcile()
          clearPending()
          safeSet(() => setLoading(false))
          return
        }
      }

      // Always do a passive refresh on return; this alone fixes many WC cases.
      await refreshFromProvider()
    }

    const onVis = () => {
      if (document.visibilityState === 'visible') onReturn()
    }

    window.addEventListener('focus', onReturn)
    window.addEventListener('pageshow', onReturn)
    document.addEventListener('visibilitychange', onVis)

    return () => {
      window.removeEventListener('focus', onReturn)
      window.removeEventListener('pageshow', onReturn)
      document.removeEventListener('visibilitychange', onVis)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------- Actions ----------------

  /**
   * connect(prefer)
   * Optional prefer (only if you later want it):
   * - 'auto' (default)
   * - 'modal'
   * - 'injected'
   *
   * Your WalletScreen calls connect() with no args — this keeps behavior identical,
   * but fixes WC "approved in wallet, app still loading" by reconciling after return.
   */
  const connect = async (prefer) => {
    if (connectInFlightRef.current) return connectInFlightRef.current

    const p = (async () => {
      safeSet(() => {
        setLoading(true)
        setError(null)
      })

      // Start WC reconcile window immediately.
      reconcileRef.current.active = true
      reconcileRef.current.startedAt = Date.now()

      try {
        setPending(
          'connect',
          'Approve the connection request in your wallet, then return to this tab.'
        )

        // call walletService.connect; if you added options support there, pass it through
        const res =
          typeof prefer === 'string'
            ? await walletService.connect({ prefer })
            : await walletService.connect()

        // If immediate success: refresh + finish.
        if (res?.success) {
          await refreshFromProvider()
          stopReconcile()
          clearPending()
          safeSet(() => setLoading(false))
          return res
        }

        // If connect returned failure/timeout: DO NOT stop here.
        // WalletConnect wallets often complete after the user returns.
        const ok = await reconcileUntilConnected()
        if (ok) {
          stopReconcile()
          clearPending()
          safeSet(() => setLoading(false))
          return { success: true, recovered: true }
        }

        // reconcile window ended: now we truly fail.
        stopReconcile()
        clearPending()
        safeSet(() => {
          setError(res?.error || 'Wallet connect timed out')
          setLoading(false)
        })
        return res
      } catch (err) {
        // still try reconcile before failing
        const ok = await reconcileUntilConnected()
        if (ok) {
          stopReconcile()
          clearPending()
          safeSet(() => setLoading(false))
          return { success: true, recovered: true }
        }

        stopReconcile()
        clearPending()
        safeSet(() => {
          setError(err?.message || 'Wallet connect timed out')
          setLoading(false)
        })
        return { success: false, error: err?.message || 'Wallet connect timed out' }
      } finally {
        connectInFlightRef.current = null
      }
    })()

    connectInFlightRef.current = p
    return p
  }

  const disconnect = async () => {
    stopReconcile()
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
      if (!(await isActuallyConnected())) {
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
   * - mobile concurrent prompt bugs
   * - -32002 "request already pending"
   */
  const sendTransaction = async (tx) => {
    const job = async () => {
      safeSet(() => setError(null))
      try {
        if (!(await isActuallyConnected())) {
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