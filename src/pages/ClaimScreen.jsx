// src/screens/ClaimScreen.jsx
import React, { useMemo, useEffect, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useWallet } from '../contexts/WalletContext'
import { useScan } from '../contexts/ScanContext'
import {
  executeChainPlan,
  prepareChainPlanWithFlow,
  executeApprovalsWithFlow,
  executeSwapsWithFlow
} from '../services/claimExecutor'
import walletService from '../services/walletService'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import { NATIVE_LOGOS } from '../services/logoService'
import TokenRow from '../components/TokenRow'
import './ClaimScreen.css'

const STORAGE_KEY = 'dustclaim:lastClaimPlan'

const isProbablyMobileUA = () => {
  if (typeof navigator === 'undefined') return false
  const ua = (navigator.userAgent || '').toLowerCase()
  if (/metamaskmobile/.test(ua)) return true
  if (/android|iphone|ipad|ipod|iemobile|windows phone|mobile/.test(ua)) return true
  return false
}

const ClaimScreen = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { address, isConnected } = useWallet()
  const { results: scanResults } = useScan()

  // ---------------- state from scanner ----------------
  const inbound = location.state || {}
  const inboundClaimPlan = inbound.claimPlan || []
  const batchSavings = inbound.batchSavings ?? null
  const inboundDevice = inbound.device // optional: scanner can pass 'mobile'|'desktop'

  // ---------------- persist/restore claimPlan to prevent “kicked out” on desktop ----------------
  const [claimPlan, setClaimPlan] = useState(() => {
    if (Array.isArray(inboundClaimPlan) && inboundClaimPlan.length) return inboundClaimPlan
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed?.claimPlan) ? parsed.claimPlan : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      if (Array.isArray(inboundClaimPlan) && inboundClaimPlan.length) {
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(
            { claimPlan: inboundClaimPlan },
            (_k, v) => (typeof v === 'bigint' ? v.toString() : v)
          )
        )
        setClaimPlan(inboundClaimPlan)
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inboundClaimPlan?.length])

  const planAvailable = Array.isArray(claimPlan) && claimPlan.length > 0

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

  const totalChains = planAvailable ? claimPlan.length : new Set(dustResults.map((r) => r.chainId)).size
  const defaultChainId = claimPlan?.[0]?.chainId || dustResults?.[0]?.chainId || 1

  const getChainInfo = (chainId) =>
    SUPPORTED_CHAINS?.[Number(chainId)] || { name: 'Unknown', explorer: '' }

  const usdFmt = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n || 0))

  // ---------------- device mode ----------------
  const device = useMemo(() => {
    // Priority: inbound param (scanner), else UA heuristic
    if (inboundDevice === 'mobile' || inboundDevice === 'desktop') return inboundDevice
    return isProbablyMobileUA() ? 'mobile' : 'desktop'
  }, [inboundDevice])

  // ============================================================================
  // DEVICE-AWARE EXECUTION STATE
  // ============================================================================
  const [claiming, setClaiming] = useState(false)
  const [phase, setPhase] = useState('idle') // idle | approving | readyToClaim | swapping | done | error
  const [currentStep, setCurrentStep] = useState(0)

  const [preparedPlans, setPreparedPlans] = useState([]) // [{ chainId, preparedCtx, approvalsReceipt, swapsReceipt }]
  const [claimResults, setClaimResults] = useState([]) // per-chain summary
  const [error, setError] = useState(null)

  // ---------------- TX reconciliation UI state ----------------
  const [txFeed, setTxFeed] = useState([]) // unified tx store view
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
      } catch {
        // ignore
      }
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
  // DESKTOP: One-click execute (approve + swap), using device-aware executor
  // ============================================================================
  const handleExecuteDesktop = async () => {
    if (!isConnected) {
      setError('Connect your wallet to execute the claim.')
      return
    }
    if (!planAvailable) {
      setError('No swap plan available. Please rescan.')
      return
    }

    setClaiming(true)
    setPhase('swapping')
    setError(null)
    setClaimResults([])
    setPreparedPlans([])
    setCurrentStep(0)

    const results = []

    try {
      for (let i = 0; i < claimPlan.length; i++) {
        const chainPlan = claimPlan[i]
        setCurrentStep(i + 1)

        try {
          // executeChainPlan is still supported; on desktop the executor will run approve+swap
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

        await new Promise((r) => setTimeout(r, 250))
      }

      setClaimResults(results)
      setPhase('done')
      await refreshTxFeed()
    } catch (err) {
      setError(err?.message || 'Claim execution error')
      setPhase('error')
    } finally {
      setClaiming(false)
      setCurrentStep(0)
    }
  }

  // ============================================================================
  // MOBILE: Step 1 — Prepare + Approve (NO swaps)
  // ============================================================================
  const handleApproveMobile = async () => {
    if (!isConnected) {
      setError('Connect your wallet to approve tokens.')
      return
    }
    if (!planAvailable) {
      setError('No swap plan available. Please rescan.')
      return
    }

    setClaiming(true)
    setPhase('approving')
    setError(null)
    setClaimResults([])
    setPreparedPlans([])
    setCurrentStep(0)

    const preparedList = []
    const results = []

    try {
      for (let i = 0; i < claimPlan.length; i++) {
        const chainPlan = claimPlan[i]
        setCurrentStep(i + 1)

        // 1) Prepare (quotes, routes, approvalsNeeded)
        let preparedCtx = null
        try {
          preparedCtx = await prepareChainPlanWithFlow(chainPlan, address)
        } catch (err) {
          results.push({
            chainId: chainPlan.chainId,
            success: false,
            stage: 'prepare',
            error: err?.message || 'Failed to prepare routes'
          })
          continue
        }

        // 2) Approvals only
        try {
          const approvals = await executeApprovalsWithFlow(preparedCtx)
          const receipts = approvals?.receipts || []

          const approvalsOk = receipts.filter((r) => r.type === 'approval' && r.ok && r.txHash).length
          const approvalsSkipped = receipts.filter((r) => r.type === 'approval' && r.ok && r.skipped).length
          const approvalsFailed = receipts.filter((r) => r.type === 'approval' && !r.ok).length

          preparedList.push({
            chainId: preparedCtx.chainId,
            preparedCtx,
            approvalsReceipts: receipts
          })

          results.push({
            chainId: preparedCtx.chainId,
            success: approvalsFailed === 0,
            stage: 'approval',
            approvalsOk,
            approvalsSkipped,
            approvalsFailed,
            receipts
          })
        } catch (err) {
          results.push({
            chainId: preparedCtx?.chainId || chainPlan.chainId,
            success: false,
            stage: 'approval',
            error: err?.message || 'Approval step failed'
          })
        }

        await new Promise((r) => setTimeout(r, 250))
      }

      setPreparedPlans(preparedList)
      setClaimResults(results)

      // If we have any prepared routes that are swappable, enable Claim Dust
      const anySwappable = preparedList.some((p) => Number(p?.preparedCtx?.swappableCount || 0) > 0)
      setPhase(anySwappable ? 'readyToClaim' : 'done')

      await refreshTxFeed()
    } catch (err) {
      setError(err?.message || 'Approval execution error')
      setPhase('error')
    } finally {
      setClaiming(false)
      setCurrentStep(0)
    }
  }

  // ============================================================================
  // MOBILE: Step 2 — Claim Dust (swaps only) using DustClaimV3.claimDustUsingAggregator
  // ============================================================================
  const handleClaimDustMobile = async () => {
    if (!isConnected) {
      setError('Connect your wallet to claim dust.')
      return
    }
    if (!Array.isArray(preparedPlans) || preparedPlans.length === 0) {
      setError('Nothing prepared. Please run approvals first.')
      return
    }

    setClaiming(true)
    setPhase('swapping')
    setError(null)
    setCurrentStep(0)

    const results = []
    try {
      for (let i = 0; i < preparedPlans.length; i++) {
        const p = preparedPlans[i]
        const preparedCtx = p?.preparedCtx
        setCurrentStep(i + 1)

        if (!preparedCtx) {
          results.push({
            chainId: p?.chainId,
            success: false,
            stage: 'swap',
            error: 'Missing prepared context'
          })
          continue
        }

        try {
          const swaps = await executeSwapsWithFlow(preparedCtx)
          const receipts = swaps?.receipts || []

          const swapsOk = receipts.filter((r) => r.type === 'swap' && r.ok && r.txHash).length
          const swapsSkipped = receipts.filter((r) => r.type === 'swap' && r.ok && r.skipped).length
          const swapsFailed = receipts.filter((r) => r.type === 'swap' && !r.ok).length
          const anyOk = swapsOk > 0

          results.push({
            chainId: preparedCtx.chainId,
            success: anyOk && swapsFailed === 0,
            stage: 'swap',
            swapsOk,
            swapsSkipped,
            swapsFailed,
            receipts
          })
        } catch (err) {
          results.push({
            chainId: preparedCtx.chainId,
            success: false,
            stage: 'swap',
            error: err?.message || 'Swap execution failed'
          })
        }

        await new Promise((r) => setTimeout(r, 250))
      }

      // merge swap results into claimResults (append)
      setClaimResults((prev) => [...(Array.isArray(prev) ? prev : []), ...results])
      setPhase('done')
      await refreshTxFeed()
    } catch (err) {
      setError(err?.message || 'Claim dust execution error')
      setPhase('error')
    } finally {
      setClaiming(false)
      setCurrentStep(0)
    }
  }

  // ---------------- render helpers ----------------
  const successful = claimResults.filter((r) => r.success).length
  const failed = claimResults.length - successful

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

  // UX helpers for mobile
  const mobileCanClaim =
    device === 'mobile' &&
    phase === 'readyToClaim' &&
    !claiming &&
    Array.isArray(preparedPlans) &&
    preparedPlans.some((p) => Number(p?.preparedCtx?.swappableCount || 0) > 0)

  const mobileApproveDisabled =
    claiming || !planAvailable || !isConnected || phase === 'swapping'

  const desktopExecuteDisabled =
    claiming || !planAvailable || !isConnected

  return (
    <div className="claim-screen">
      <div className="claim-header">
        <h1>Dust Claim</h1>
        <p>
          Execute optimized multi-chain swaps via 0x
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
                    <TokenRow key={`${r.chainId}-${i}`} token={{ ...t, chainId: r.chainId }} />
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ACTIONS */}
      <div className="action-section">
        {device === 'mobile' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={handleApproveMobile}
              disabled={mobileApproveDisabled}
              className="execute-button"
              title="Step 1: Approve tokens (required on mobile)"
            >
              {claiming && (phase === 'approving' || phase === 'idle')
                ? '⏳ Approving…'
                : '1) Approve Tokens'}
            </button>

            <button
              onClick={handleClaimDustMobile}
              disabled={!mobileCanClaim}
              className="execute-button"
              title={
                mobileCanClaim
                  ? 'Step 2: Claim Dust (swap) via DustClaimV3'
                  : 'Run Approve Tokens first'
              }
              style={{
                opacity: mobileCanClaim ? 1 : 0.6
              }}
            >
              {claiming && phase === 'swapping' ? '⏳ Claiming Dust…' : '2) Claim Dust'}
            </button>

            <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.35 }}>
              Mobile mode uses a two-step flow to avoid overlapping MetaMask prompts.
            </div>
          </div>
        ) : (
          <button onClick={handleExecuteDesktop} disabled={desktopExecuteDisabled} className="execute-button">
            {claiming ? '⏳ Executing…' : '🚀 Execute Swap & Claim'}
          </button>
        )}

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

      {/* Results */}
      {claimResults.length > 0 && (
        <div className="results-card">
          <h3>Results</h3>
          <div className="results-summary">
            <div>✅ {successful} succeeded</div>
            <div>❌ {failed} failed</div>
          </div>

          {claimResults.map((r, i) => {
            const info = getChainInfo(r.chainId || defaultChainId)
            const title =
              r.stage === 'prepare'
                ? 'Prepare'
                : r.stage === 'approval'
                  ? 'Approvals'
                  : r.stage === 'swap'
                    ? 'Swaps'
                    : 'Result'

            return (
              <div key={i} className={r.success ? 'success' : 'error'}>
                <strong>
                  {info.name} · {title}
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
                            : rcpt.type === 'ux'
                              ? 'Next'
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
                          ) : rcpt.type === 'ux' ? (
                            <span>{rcpt.message || 'Continue'}</span>
                          ) : (
                            <span>{rcpt.ok ? 'OK' : 'Not submitted'}</span>
                          )}
                          {rcpt.error && (
                            <div style={{ marginTop: 2, opacity: 0.85 }}>{rcpt.error}</div>
                          )}
                          {rcpt.warning && (
                            <div style={{ marginTop: 2, opacity: 0.8 }}>{rcpt.warning}</div>
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