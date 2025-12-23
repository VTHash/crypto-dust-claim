import React, { useMemo, useEffect, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useWallet } from '../contexts/WalletContext'
import { useScan } from '../contexts/ScanContext'
import { executeChainPlan } from '../services/claimExecutor'
import walletService from '../services/walletService'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import { NATIVE_LOGOS } from '../services/logoService'
import TokenRow from '../components/TokenRow'
import './ClaimScreen.css'

const ClaimScreen = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { address, isConnected } = useWallet()
  const { results: scanResults } = useScan()

  // ---------------- state from scanner ----------------
  const { claimPlan = [], batchSavings = null } = location.state || {}

  // ---------------- hydrate scan snapshot ----------------
  const [scanSnapshot] = useState(() => {
    if (location.state?.dustResults?.length) {
      return {
        dustResults: location.state.dustResults,
        totalDustValue: Number(location.state.totalDustValue || 0)
      }
    }

    if (scanResults?.length) {
      const total = scanResults.reduce((s, x) => s + Number(x.totalValue || 0), 0)
      return { dustResults: scanResults, totalDustValue: total }
    }

    try {
      const raw = sessionStorage.getItem('dustclaim:lastScan')
      if (raw) {
        const parsed = JSON.parse(raw)
        return {
          dustResults: parsed.dustResults || [],
          totalDustValue: Number(parsed.total || 0)
        }
      }
    } catch {}

    return { dustResults: [], totalDustValue: 0 }
  })

  const { dustResults, totalDustValue } = scanSnapshot

  // ---------------- derived ----------------
  const computedTotalDustValue = useMemo(() => {
    if (totalDustValue > 0) return totalDustValue
    return dustResults.reduce((s, r) => s + Number(r.totalValue || 0), 0)
  }, [dustResults, totalDustValue])

  const planAvailable = Array.isArray(claimPlan) && claimPlan.length > 0

  const totalChains = planAvailable
    ? claimPlan.length
    : new Set(dustResults.map((r) => r.chainId)).size

  const defaultChainId = claimPlan?.[0]?.chainId || dustResults?.[0]?.chainId || 1

  const getChainInfo = (chainId) =>
    SUPPORTED_CHAINS?.[Number(chainId)] || { name: 'Unknown', explorer: '' }

  const usdFmt = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n || 0))

  // ---------------- UI state ----------------
  const [claiming, setClaiming] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [claimResults, setClaimResults] = useState([])
  const [error, setError] = useState(null)

  // ---------------- TX reconciliation UI state ----------------
  const [txFeed, setTxFeed] = useState([]) // unified tx store view
  const [reconciling, setReconciling] = useState(false)

  const refreshTxFeed = useCallback(async () => {
    try {
      const list = await walletService.listTransactions?.()
      if (Array.isArray(list)) {
        // newest first
        const sorted = [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        setTxFeed(sorted)
      }
    } catch {
      // ignore
    }
  }, [])

  // Start reconciler and keep UI in sync
  useEffect(() => {
    let timer = null
    let mounted = true

    const boot = async () => {
      try {
        walletService.startTxReconciler?.()
      } catch {
        // ignore
      }
      await refreshTxFeed()

      // Light polling to update statuses in UI (mobile-friendly)
      timer = setInterval(async () => {
        if (!mounted) return
        await refreshTxFeed()
      }, 2000)
    }

    boot()

    return () => {
      mounted = false
      if (timer) clearInterval(timer)
    }
  }, [refreshTxFeed])

  // Helper: should we keep reconciling?
  const hasPending = useMemo(() => {
    return txFeed.some((t) => {
      const st = String(t.status || '').toLowerCase()
      return st === 'pending' || st === 'submitted' || st === 'broadcast'
    })
  }, [txFeed])

  // Best-effort: force reconcile pass while there are pending txs (esp. after execution)
  useEffect(() => {
    if (!hasPending) return
    let stopped = false

    const loop = async () => {
      setReconciling(true)
      try {
        while (!stopped) {
          // If your walletService exposes reconcileOnce, use it; otherwise startTxReconciler handles it.
          await walletService.reconcileOnce?.().catch(() => null)
          await refreshTxFeed()
          await new Promise((r) => setTimeout(r, 3000))
          if (!hasPending) break
        }
      } finally {
        if (!stopped) setReconciling(false)
      }
    }

    loop()
    return () => {
      stopped = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPending, refreshTxFeed])

  const explorerTxUrl = (chainId, txHash) => {
    const info = getChainInfo(chainId || defaultChainId)
    if (!info?.explorer || !txHash) return null
    // explorer may be a base url, ensure /tx/
    const base = String(info.explorer).replace(/\/$/, '')
    return `${base}/tx/${txHash}`
  }

  const normalizeStatusLabel = (s) => {
    const st = String(s || '').toLowerCase()
    if (!st) return 'Unknown'
    if (st === 'confirmed' || st === 'success') return 'Confirmed'
    if (st === 'failed') return 'Failed'
    if (st === 'replaced') return 'Replaced'
    if (st === 'dropped') return 'Dropped'
    if (st === 'submitted' || st === 'broadcast') return 'Submitted'
    if (st === 'pending') return 'Pending'
    return s
  }

  // ============================================================================
  // MAIN EXECUTION — 0x ONLY
  // ============================================================================
  const handleExecuteClaim = async () => {
    if (!isConnected) {
      setError('Connect your wallet to execute the claim.')
      return
    }

    if (!planAvailable) {
      setError('No swap plan available. Please rescan.')
      return
    }

    setClaiming(true)
    setError(null)
    setClaimResults([])
    setCurrentStep(0)

    const results = []

    try {
      for (let i = 0; i < claimPlan.length; i++) {
        const chainPlan = claimPlan[i]
        setCurrentStep(i + 1)

        try {
          // Execute chain plan (now uses sendTransactionWithReceipt and persists hashes)
          const receipts = await executeChainPlan(chainPlan, address)

          const approvalsOk = receipts.filter((r) => r.type === 'approval' && r.ok).length
          const swapsOk = receipts.filter((r) => r.type === 'swap' && r.ok && r.txHash).length
          const anyOk = approvalsOk > 0 || swapsOk > 0

          results.push({
            chainId: chainPlan.chainId,
            success: anyOk,
            receipts,
            approvalsOk,
            swapsOk,
            error: anyOk ? null : 'No transactions were sent (wallet rejected or tx request invalid)'
          })
        } catch (err) {
          results.push({
            chainId: chainPlan.chainId,
            success: false,
            error: err?.message || 'Execution failed'
          })
        }

        // small pacing helps MM mobile
        await new Promise((r) => setTimeout(r, 250))
      }

      setClaimResults(results)

      // Immediately refresh tx feed so UI shows txs right away
      await refreshTxFeed()
    } catch (err) {
      setError(err?.message || 'Claim execution error')
    } finally {
      setClaiming(false)
      setCurrentStep(0)
    }
  }

  // ---------------- render helpers ----------------
  const successful = claimResults.filter((r) => r.success).length
  const failed = claimResults.length - successful

  // Recent txs relevant to this address (optional filter)
  const relevantTxs = useMemo(() => {
    const addr = (address || '').toLowerCase()
    return txFeed.filter((t) => {
      const from = String(t.from || '').toLowerCase()
      const to = String(t.to || '').toLowerCase()
      return addr && (from === addr || to === addr)
    })
  }, [txFeed, address])

  const pendingCount = relevantTxs.filter((t) => {
    const st = String(t.status || '').toLowerCase()
    return st === 'pending' || st === 'submitted' || st === 'broadcast'
  }).length

  return (
    <div className="claim-screen">
      <div className="claim-header">
        <h1>Dust Claim</h1>
        <p>Execute optimized multi-chain swaps via 0x</p>
      </div>

      {/* Summary */}
      <div className="summary-card">
        <div className="summary-grid">
          <div className="summary-item">
            <div className="summary-icon">💰</div>
            <div className="summary-content">
              <h3>Total Value</h3>
              <div className="summary-value">{usdFmt(computedTotalDustValue)}</div>
            </div>
          </div>

          <div className="summary-item">
            <div className="summary-icon">🌐</div>
            <div className="summary-content">
              <h3>Chains</h3>
              <div className="summary-value">{totalChains}</div>
            </div>
          </div>

          {batchSavings && (
            <div className="summary-item highlight">
              <div className="summary-icon">🎯</div>
              <div className="summary-content">
                <h3>Gas Savings</h3>
                <div className="summary-value">{batchSavings.savingsPercentage}%</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chains */}
      {dustResults.length > 0 && (
        <div className="chains-section">
          <h2>Detected Chains</h2>
          <div className="chains-grid">
            {dustResults.map((r, idx) => {
              const meta = SUPPORTED_CHAINS[r.chainId] || {}
              const logo = meta.logo || NATIVE_LOGOS[r.chainId] || '/logos/chains/generic.png'

              return (
                <div key={idx} className="chain-card">
                  <div className="chain-header">
                    <div className="chain-info">
                      <img src={logo} className="chain-logo" alt={meta.name} />
                      <div>
                        <h3>{meta.name}</h3>
                        <p className="chain-value">{usdFmt(r.totalValue || 0)}</p>
                      </div>
                    </div>
                  </div>

                  {(r.tokenDust || []).slice(0, 3).map((t, i) => (
                    <TokenRow key={`${r.chainId}-${i}`} token={t} />
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ACTION */}
      <div className="action-section">
        <button onClick={handleExecuteClaim} disabled={claiming} className="execute-button">
          {claiming ? '⏳ Executing…' : '🚀 Execute Swap & Claim'}
        </button>

        {error && <div className="error-message">{error}</div>}
      </div>

      {/* Progress */}
      {claiming && totalChains > 0 && (
        <div className="claiming-progress">
          <span>
            Processing {currentStep}/{totalChains}
          </span>
        </div>
      )}

      {/* Results (per chain plan execution) */}
      {claimResults.length > 0 && (
        <div className="results-card">
          <h3>Results</h3>
          <div className="results-summary">
            <div>✅ {successful} succeeded</div>
            <div>❌ {failed} failed</div>
          </div>

          {claimResults.map((r, i) => {
            const info = getChainInfo(r.chainId || defaultChainId)
            return (
              <div key={i} className={r.success ? 'success' : 'error'}>
                <strong>{info.name}</strong>
                {r.error && <p>{r.error}</p>}

                {/* Inline receipts */}
                {Array.isArray(r.receipts) && r.receipts.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {r.receipts.map((rcpt, j) => {
                      const url = explorerTxUrl(r.chainId, rcpt.txHash)
                      const label =
                        rcpt.type === 'approval'
                          ? 'Approval'
                          : rcpt.type === 'swap'
                            ? 'Swap'
                            : rcpt.type || 'Tx'

                      return (
                        <div key={j} style={{ fontSize: 13, opacity: 0.95, marginTop: 6 }}>
                          <span style={{ fontWeight: 600 }}>{label}:</span>{' '}
                          {rcpt.txHash ? (
                            url ? (
                              <a href={url} target="_blank" rel="noreferrer">
                                {rcpt.txHash.slice(0, 10)}…{rcpt.txHash.slice(-8)}
                              </a>
                            ) : (
                              <span>
                                {rcpt.txHash.slice(0, 10)}…{rcpt.txHash.slice(-8)}
                              </span>
                            )
                          ) : (
                            <span>{rcpt.ok ? 'OK' : 'Not submitted'}</span>
                          )}
                          {rcpt.error && <div style={{ marginTop: 2, opacity: 0.85 }}>{rcpt.error}</div>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Transaction Activity (authoritative: reconciled store) */}
      <div className="results-card" style={{ marginTop: 16 }}>
        <h3>
          Transaction Activity{pendingCount > 0 ? ` (Pending: ${pendingCount})` : ''}
        </h3>

        <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 10 }}>
          {reconciling || hasPending ? 'Reconciling receipts…' : 'Up to date.'}
        </div>

        {relevantTxs.length === 0 ? (
          <div style={{ opacity: 0.85 }}>No transactions recorded yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {relevantTxs.slice(0, 20).map((t) => {
              const chainId = t.chainId || defaultChainId
              const info = getChainInfo(chainId)
              const url = explorerTxUrl(chainId, t.hash)
              const st = normalizeStatusLabel(t.status)
              const kind = t.kind || t.type || 'tx'

              return (
                <div
                  key={t.id || t.hash}
                  style={{
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    padding: 12
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontWeight: 700 }}>
                      {info?.name || 'Chain'} · {String(kind).toUpperCase()}
                    </div>
                    <div style={{ fontWeight: 700 }}>{st}</div>
                  </div>

                  <div style={{ marginTop: 8, fontSize: 13, opacity: 0.95 }}>
                    {t.hash ? (
                      url ? (
                        <a href={url} target="_blank" rel="noreferrer">
                          {t.hash}
                        </a>
                      ) : (
                        <span>{t.hash}</span>
                      )
                    ) : (
                      <span>Hash not available</span>
                    )}
                  </div>

                  {t.error && (
                    <div style={{ marginTop: 6, fontSize: 13, opacity: 0.85 }}>
                      {t.error}
                    </div>
                  )}

                  {t.blockNumber && (
                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                      Block: {t.blockNumber}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="footer-actions">
        <button onClick={() => navigate('/scanner')} className="btn btn-outline">
          ← Back to Scanner
        </button>
      </div>
    </div>
  )
}

export default ClaimScreen