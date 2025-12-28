import React, { useMemo, useEffect, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useWallet } from '../contexts/WalletContext'
import { useScan } from '../contexts/ScanContext'
import walletService from '../services/walletService'
import {
  prepareChainPlanWithFlow,
  executeApprovalsWithFlow,
  executeSwapsWithFlow
} from '../services/claimExecutor'
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
  const { claimPlan = [], batchSavings = null, device = 'desktop' } = location.state || {}

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

  // ---------------- TX reconciliation UI state ----------------
  const [txFeed, setTxFeed] = useState([])
  const [reconciling, setReconciling] = useState(false)

  const refreshTxFeed = useCallback(async () => {
    try {
      const list = await walletService.listTransactions?.()
      if (Array.isArray(list)) {
        const sorted = [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        setTxFeed(sorted)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    let timer = null
    let mounted = true

    const boot = async () => {
      try {
        walletService.startTxReconciler?.()
      } catch {}
      await refreshTxFeed()
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

  const hasPending = useMemo(() => {
    return txFeed.some((t) => {
      const st = String(t.status || '').toLowerCase()
      return st === 'pending' || st === 'submitted' || st === 'broadcast'
    })
  }, [txFeed])

  useEffect(() => {
    if (!hasPending) return
    let stopped = false

    const loop = async () => {
      setReconciling(true)
      try {
        while (!stopped) {
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
  // NEW: Prepared context cache (per chain) – prevents re-quoting on Approve
  // ============================================================================
  const [preparing, setPreparing] = useState(false)
  const [preparedByChain, setPreparedByChain] = useState({}) // { [chainId]: preparedCtx }
  const [prepareErrors, setPrepareErrors] = useState({}) // { [chainId]: string }
  const [error, setError] = useState(null)

  const [approving, setApproving] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [actionResults, setActionResults] = useState([])

  const prepareAllChains = useCallback(async () => {
    if (!isConnected) {
      setError('Connect your wallet to prepare the claim plan.')
      return
    }
    if (!planAvailable) {
      setError('No swap plan available. Please rescan.')
      return
    }

    setPreparing(true)
    setError(null)
    setPrepareErrors({})
    setCurrentStep(0)

    const nextPrepared = {}
    const nextErrors = {}

    try {
      for (let i = 0; i < claimPlan.length; i++) {
        const chainPlan = claimPlan[i]
        const chainId = Number(chainPlan.chainId)
        setCurrentStep(i + 1)

        try {
          const ctx = await prepareChainPlanWithFlow(chainPlan, address)
          nextPrepared[chainId] = ctx
        } catch (e) {
          nextErrors[chainId] = e?.message || 'Prepare failed'
        }

        // slight pacing for MM mobile/webview
        await new Promise((r) => setTimeout(r, 150))
      }
    } finally {
      setPreparedByChain(nextPrepared)
      setPrepareErrors(nextErrors)
      setPreparing(false)
      setCurrentStep(0)
      await refreshTxFeed()
    }
  }, [isConnected, planAvailable, claimPlan, address, refreshTxFeed])

  // Auto-prepare once when entering screen (optional but recommended)
  useEffect(() => {
    if (!planAvailable) return
    if (!isConnected) return
    // if already prepared, do not repeat
    const already = Object.keys(preparedByChain || {}).length > 0
    if (already) return
    prepareAllChains().catch(() => null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planAvailable, isConnected])

  const allPreparedChainIds = useMemo(() => Object.keys(preparedByChain || {}).map(Number), [preparedByChain])
  const preparedCount = allPreparedChainIds.length

  const approvalsRemaining = useMemo(() => {
    // Count tokens needing approval across all prepared ctxs (best-effort)
    let n = 0
    for (const cid of allPreparedChainIds) {
      const ctx = preparedByChain[cid]
      const arr = Array.isArray(ctx?.approvalsNeeded) ? ctx.approvalsNeeded : []
      // only count those with >0
      n += arr.filter((x) => x && x.amountWei && String(x.amountWei) !== '0').length
    }
    return n
  }, [allPreparedChainIds, preparedByChain])

  const swappableSteps = useMemo(() => {
    let n = 0
    for (const cid of allPreparedChainIds) {
      const ctx = preparedByChain[cid]
      n += Number(ctx?.swappableCount || 0)
    }
    return n
  }, [allPreparedChainIds, preparedByChain])

  // ============================================================================
  // ACTION 1: Approvals ONLY (NO quote calls here)
  // ============================================================================
  const handleApproveOnly = async () => {
    if (!isConnected) {
      setError('Connect your wallet to approve.')
      return
    }
    if (!planAvailable) {
      setError('No swap plan available. Please rescan.')
      return
    }

    // Must be prepared first (otherwise approvalsNeeded may be missing)
    if (preparedCount === 0) {
      setError('Preparing is required before approvals. Click “Prepare Plan” first.')
      return
    }

    setApproving(true)
    setError(null)
    setActionResults([])
    setCurrentStep(0)

    const results = []

    try {
      const chainIds = Object.keys(preparedByChain).map(Number)

      for (let i = 0; i < chainIds.length; i++) {
        const chainId = chainIds[i]
        const ctx = preparedByChain[chainId]
        setCurrentStep(i + 1)

        try {
          const { receipts } = await executeApprovalsWithFlow(ctx)

          const ok = receipts?.some((r) => r.type === 'approval' && r.ok)
          results.push({
            chainId,
            action: 'approval',
            success: !!ok,
            receipts
          })
        } catch (e) {
          results.push({
            chainId,
            action: 'approval',
            success: false,
            error: e?.message || 'Approval failed'
          })
          // stop early on failure (mobile safe)
          break
        }

        await new Promise((r) => setTimeout(r, 200))
      }

      setActionResults(results)
      await refreshTxFeed()
    } finally {
      setApproving(false)
      setCurrentStep(0)
    }
  }

  // ============================================================================
  // ACTION 2: Swaps ONLY (DustClaimV3.claimDustUsingAggregator)
  // ============================================================================
  const handleClaimOnly = async () => {
    if (!isConnected) {
      setError('Connect your wallet to claim.')
      return
    }
    if (!planAvailable) {
      setError('No swap plan available. Please rescan.')
      return
    }
    if (preparedCount === 0) {
      setError('Preparing is required before claiming. Click “Prepare Plan” first.')
      return
    }

    setClaiming(true)
    setError(null)
    setActionResults([])
    setCurrentStep(0)

    const results = []

    try {
      const chainIds = Object.keys(preparedByChain).map(Number)

      for (let i = 0; i < chainIds.length; i++) {
        const chainId = chainIds[i]
        const ctx = preparedByChain[chainId]
        setCurrentStep(i + 1)

        try {
          const { receipts } = await executeSwapsWithFlow(ctx)

          const ok = receipts?.some((r) => r.type === 'swap' && r.ok && r.txHash)
          results.push({
            chainId,
            action: 'swap',
            success: !!ok,
            receipts
          })
        } catch (e) {
          results.push({
            chainId,
            action: 'swap',
            success: false,
            error: e?.message || 'Swap failed'
          })
          // do not necessarily stop — but mobile safe is to stop
          break
        }

        await new Promise((r) => setTimeout(r, 200))
      }

      setActionResults(results)
      await refreshTxFeed()
    } finally {
      setClaiming(false)
      setCurrentStep(0)
    }
  }

  const successful = actionResults.filter((r) => r.success).length
  const failed = actionResults.length - successful

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

  const busy = preparing || approving || claiming
  const progressTotal = planAvailable ? claimPlan.length : totalChains

  return (
    <div className="claim-screen">
      <div className="claim-header">
        <h1>Dust Claim</h1>
        <p>
          0x routes + DustClaimV3.claimDustUsingAggregator
          {device === 'mobile' ? ' (Mobile mode)' : ''}
        </p>
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

          <div className="summary-item">
            <div className="summary-icon">🧾</div>
            <div className="summary-content">
              <h3>Prepared</h3>
              <div className="summary-value">
                {preparedCount}/{planAvailable ? claimPlan.length : totalChains}
              </div>
            </div>
          </div>

          <div className="summary-item">
            <div className="summary-icon">✅</div>
            <div className="summary-content">
              <h3>Approvals Needed</h3>
              <div className="summary-value">{approvalsRemaining}</div>
            </div>
          </div>

          <div className="summary-item">
            <div className="summary-icon">🔁</div>
            <div className="summary-content">
              <h3>Swaps Available</h3>
              <div className="summary-value">{swappableSteps}</div>
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
              const tokens = (r.tokenDetails || r.tokenDust || []).slice(0, 3)

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

                  {tokens.map((t, i) => (
                    <TokenRow key={`${r.chainId}-${i}`} token={t} />
                  ))}

                  {/* Prepare error per chain (if in plan) */}
                  {prepareErrors?.[Number(r.chainId)] && (
                    <div className="error-message" style={{ marginTop: 10 }}>
                      Prepare error: {prepareErrors[Number(r.chainId)]}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ACTIONS */}
      <div className="action-section" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={prepareAllChains}
          disabled={busy || !planAvailable}
          className="execute-button"
          title="Fetch 0x routes once and cache them (no transactions)"
        >
          {preparing ? '⏳ Preparing…' : '🧠 Prepare Plan (0x Routes)'}
        </button>

        <button
          onClick={handleApproveOnly}
          disabled={busy || preparedCount === 0}
          className="execute-button"
          title="Send ONLY approval transactions (no 0x quote calls here)"
        >
          {approving ? '⏳ Approving…' : '✅ Approve Required Tokens'}
        </button>

        <button
          onClick={handleClaimOnly}
          disabled={busy || preparedCount === 0}
          className="execute-button"
          title="Send ONLY DustClaimV3 claimDustUsingAggregator swaps"
        >
          {claiming ? '⏳ Claiming…' : '🚀 Claim Dust (Execute Swaps)'}
        </button>

        {error && <div className="error-message" style={{ width: '100%' }}>{error}</div>}
      </div>

      {/* Progress */}
      {busy && progressTotal > 0 && (
        <div className="claiming-progress">
          <span>
            Processing {currentStep}/{progressTotal}
          </span>
        </div>
      )}

      {/* Results */}
      {actionResults.length > 0 && (
        <div className="results-card">
          <h3>Results</h3>
          <div className="results-summary">
            <div>✅ {successful} succeeded</div>
            <div>❌ {failed} failed</div>
          </div>

          {actionResults.map((r, i) => {
            const info = getChainInfo(r.chainId || defaultChainId)
            return (
              <div key={i} className={r.success ? 'success' : 'error'}>
                <strong>
                  {info.name} · {String(r.action || 'tx').toUpperCase()}
                </strong>
                {r.error && <p>{r.error}</p>}

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
                          {rcpt.error && (
                            <div style={{ marginTop: 2, opacity: 0.85 }}>{rcpt.error}</div>
                          )}
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

      {/* Transaction Activity */}
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
              const txHash = t.txHash || t.hash || null
              const url = explorerTxUrl(chainId, txHash)
              const st = normalizeStatusLabel(t.status)
              const kind = t.kind || t.type || 'tx'

              return (
                <div
                  key={t.id || txHash || `${t.to}-${t.createdAt}`}
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
                    {txHash ? (
                      url ? (
                        <a href={url} target="_blank" rel="noreferrer">
                          {txHash}
                        </a>
                      ) : (
                        <span>{txHash}</span>
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