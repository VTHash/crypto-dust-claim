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

export const WalletProvider = ({ children }) => {
  const [address, setAddress] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [chainId, setChainId] = useState(null) // hex
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

  // Manual disconnect cooldown (prevents immediate auto-restore)
  const manualDisconnectAtRef = useRef(0)
  const MANUAL_DISCONNECT_COOLDOWN_MS = 8000

  // ---- single-flight guards ----
  const connectInFlightRef = useRef(null) // Promise
  const txQueueRef = useRef(Promise.resolve()) // serialized queue

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  const clearPending = () => safeSet(() => setPendingRequest(null))
  const setPending = (type, message) =>
    safeSet(() => setPendingRequest({ type, message, startedAt: Date.now() }))

  // Fast “connected?” signal from AppKit (mobile WC wallets lag on eth_accounts)
  const fastSession = () => {
    const connected = !!walletService.getIsConnected?.()
    const modalAddr = walletService.getModalAddress?.() || null
    return { connected, modalAddr }
  }

  // Authoritative refresh (EIP-1193 first, then AppKit modal fallback)
  const refreshFromProvider = async () => {
    try {
      const addr = await walletService.getAddress?.()
      const cid = await walletService.getChainId?.()
      const accs = (await walletService.getAccounts?.()) || (addr ? [addr] : [])

      const { connected: appKitConnected, modalAddr } = fastSession()
      const effectiveAddr = addr || accs?.[0] || modalAddr || null
      const effectiveConnected = !!effectiveAddr || !!appKitConnected

      safeSet(() => {
        setAccounts(accs || (effectiveAddr ? [effectiveAddr] : []))
        setAddress(effectiveAddr)
        setChainId(cid || null)
        setIsConnected(effectiveConnected)
      })

      return {
        address: effectiveAddr,
        chainId: cid || null,
        accounts: accs || (effectiveAddr ? [effectiveAddr] : []),
        connected: effectiveConnected
      }
    } catch {
      // Even if provider calls fail, we can still unlock based on AppKit session
      const { connected: appKitConnected, modalAddr } = fastSession()
      safeSet(() => {
        setIsConnected(!!appKitConnected || !!modalAddr)
        if (modalAddr) setAddress(modalAddr)
      })
      return {
        address: modalAddr || null,
        chainId: null,
        accounts: modalAddr ? [modalAddr] : [],
        connected: !!appKitConnected || !!modalAddr
      }
    }
  }

  // Subscribe to wallet events from walletService (authoritative)
  useEffect(() => {
    walletService.onAccountsChanged((accs) => {
      safeSet(() => {
        const list = Array.isArray(accs) ? accs : []
        setAccounts(list)
        const addr = list?.[0] || walletService.getModalAddress?.() || null
        setAddress(addr)
        setIsConnected(!!addr || !!walletService.getIsConnected?.())
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

  // Restore session on mount (but respect manual disconnect cooldown)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const since = Date.now() - (manualDisconnectAtRef.current || 0)
        const s = await walletService.restoreSession?.()

        if (cancelled) return

        // If user recently disconnected, don't restore
        if (since < MANUAL_DISCONNECT_COOLDOWN_MS) {
          await refreshFromProvider()
          return
        }

        // If restore returns something OR AppKit already says connected, hydrate immediately
        const { connected: appKitConnected, modalAddr } = fastSession()
        if (s || appKitConnected || modalAddr) {
          safeSet(() => {
            const addr = s?.address || s?.account || s?.accounts?.[0] || modalAddr || null
            const accs = s?.accounts?.length ? s.accounts : (addr ? [addr] : [])
            setAccounts(accs)
            setAddress(addr)
            setChainId(s?.chainId || null)
            setIsConnected(!!addr || !!appKitConnected)
          })

          // follow-up refresh to pick up real eth_accounts/chainId when it becomes available
          setTimeout(() => {
            if (cancelled) return
            const since2 = Date.now() - (manualDisconnectAtRef.current || 0)
            if (since2 < MANUAL_DISCONNECT_COOLDOWN_MS) return
            refreshFromProvider().catch(() => {})
          }, 500)

          return
        }

        // Nothing to restore
        await refreshFromProvider()
      } catch {
        await refreshFromProvider().catch(() => {})
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------- Actions ----------------

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

        // 1) IMMEDIATE UNLOCK if AppKit says connected / has address (mobile WC wallets)
        const { connected: appKitConnected, modalAddr } = fastSession()
        if (appKitConnected || modalAddr) {
          safeSet(() => {
            const addr = modalAddr || null
            if (addr) {
              setAddress(addr)
              setAccounts((prev) => (prev?.length ? prev : [addr]))
            }
            setIsConnected(true)
          })
        }

        // 2) Background hydration loop (does not block UI)
        // Goal: get real eth_accounts/provider as soon as wallet returns to dapp.
        const start = Date.now()
        const maxMs = 180000 // allow slow wallets; UI is already unlocked
        while (Date.now() - start < maxMs) {
          const st = await refreshFromProvider()
          if (st?.address) break
          await sleep(600)
        }

        clearPending()
        safeSet(() => setLoading(false))

        // If connect call itself failed and we don't even have AppKit connection, surface error
        const { connected: finalConnected, modalAddr: finalAddr } = fastSession()
        if (!finalConnected && !finalAddr && !res?.success) {
          safeSet(() => setError(res?.error || 'Connect failed'))
          return res
        }

        // If walletService returned failure but AppKit is connected, treat as connected with warning
        if (!res?.success && (finalConnected || finalAddr)) {
          return {
            success: true,
            warning: res?.error || 'Connected, waiting for wallet provider to hydrate.',
            address: finalAddr || null
          }
        }

        return res?.success ? res : { success: true }
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
      // hard reset UI state immediately
      safeSet(() => {
        setAccounts([])
        setAddress(null)
        setChainId(null)
        setIsConnected(false)
        setLoading(false)
      })

      // Do not auto-restore right after manual disconnect
      // But do a passive refresh so injected wallets don't appear "sticky"
      try {
        const since = Date.now() - (manualDisconnectAtRef.current || 0)
        if (since >= MANUAL_DISCONNECT_COOLDOWN_MS) {
          await refreshFromProvider()
        }
      } catch {
        // ignore
      }
    }

    return { success: true }
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

  // Serialized tx sending to avoid mobile -32002
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