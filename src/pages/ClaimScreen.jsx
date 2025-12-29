// src/pages/ClaimScreen.jsx
import React, { useMemo, useEffect, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useWallet } from '../contexts/WalletContext'
import { useScan } from '../contexts/ScanContext'
import { prepareChainPlanWithFlow, executeApprovalsWithFlow, executeSwapsWithFlow } from '../services/claimExecutor'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import { NATIVE_LOGOS } from '../services/logoService'
import TokenRow from '../components/TokenRow'
import './ClaimScreen.css'

const SS_PLAN = 'dustclaim:lastClaimPlan'
const SS_SAVINGS = 'dustclaim:lastBatchSavings'
const SS_DEVICE = 'dustclaim:lastDevice'
const SS_LASTSCAN = 'dustclaim:lastScan'

function safeJsonParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

const ClaimScreen = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { address, isConnected } = useWallet()
  const { results: scanResults } = useScan()

  const state = location.state || {}

  const claimPlan = useMemo(() => {
    const fromState = Array.isArray(state.claimPlan) && state.claimPlan.length > 0 ? state.claimPlan : null
    if (fromState) return fromState
    const fromSession = safeJsonParse(sessionStorage.getItem(SS_PLAN), [])
    return Array.isArray(fromSession) ? fromSession : []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  const batchSavings = useMemo(() => {
    if (state.batchSavings !== undefined) return state.batchSavings
    return safeJsonParse(sessionStorage.getItem(SS_SAVINGS), null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  const device = useMemo(() => {
    if (state.device) return state.device
    const d = sessionStorage.getItem(SS_DEVICE)
    return d || 'desktop'
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  useEffect(() => {
    try {
      if (Array.isArray(claimPlan) && claimPlan.length > 0) {
        sessionStorage.setItem(
          SS_PLAN,
          JSON.stringify(claimPlan, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
        )
      }
      sessionStorage.setItem(SS_SAVINGS, JSON.stringify(batchSavings ?? null))
      sessionStorage.setItem(SS_DEVICE, String(device || 'desktop'))
    } catch {}
  }, [claimPlan, batchSavings, device])

  const [scanSnapshot] = useState(() => {
    if (state?.dustResults?.length) {
      return { dustResults: state.dustResults, totalDustValue: Number(state.totalDustValue || 0) }
    }
    if (scanResults?.length) {
      const total = scanResults.reduce((s, x) => s + Number(x.totalValue || 0), 0)
      return { dustResults: scanResults, totalDustValue: total }
    }
    const parsed = safeJsonParse(sessionStorage.getItem(SS_LASTSCAN), null)
    if (parsed?.dustResults?.length) {
      return { dustResults: parsed.dustResults || [], totalDustValue: Number(parsed.total || 0) }
    }
    return { dustResults: [], totalDustValue: 0 }
  })

  const { dustResults, totalDustValue } = scanSnapshot

  const computedTotalDustValue = useMemo(() => {
    if (totalDustValue > 0) return totalDustValue
    return dustResults.reduce((s, r) => s + Number(r.totalValue || 0), 0)
  }, [dustResults, totalDustValue])

  const planAvailable = Array.isArray(claimPlan) && claimPlan.length > 0
  const totalChains = planAvailable ? claimPlan.length : new Set(dustResults.map((r) => r.chainId)).size
  const defaultChainId = claimPlan?.[0]?.chainId || dustResults?.[0]?.chainId || 1

  const getChainInfo = (chainId) => SUPPORTED_CHAINS?.[Number(chainId)] || { name: 'Unknown', explorer: '' }
  const usdFmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n || 0))

  // ---- Prepared contexts
  const [preparing, setPreparing] = useState(false)
  const [preparedByChain, setPreparedByChain] = useState({})
  const [prepareErrors, setPrepareErrors] = useState({})
  const [error, setError] = useState(null)

  const [approving, setApproving] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [actionResults, setActionResults] = useState([])

  const preparedCount = useMemo(() => Object.keys(preparedByChain || {}).length, [preparedByChain])

  const approvalsRemaining = useMemo(() => {
    let n = 0
    for (const cid of Object.keys(preparedByChain || {})) {
      const ctx = preparedByChain[cid]
      const arr = Array.isArray(ctx?.approvalsNeeded) ? ctx.approvalsNeeded : []
      n += arr.filter((x) => x && x.amountWei && String(x.amountWei) !== '0').length
    }
    return n
  }, [preparedByChain])

  const swappableSteps = useMemo(() => {
    let n = 0
    for (const cid of Object.keys(preparedByChain || {})) {
      const ctx = preparedByChain[cid]
      n += Number(ctx?.swappableCount || 0)
    }
    return n
  }, [preparedByChain])

  /**
   * IMPORTANT:
   * - Must return the computed prepared map, because React state updates are async.
   * - Handlers should use the returned map rather than relying on state immediately after setting it.
   */
  const ensurePrepared = useCallback(async () => {
    if (!isConnected) throw new Error('Connect your wallet first.')
    if (!planAvailable) throw new Error('No claim plan available. Go back to Scanner and run Batch Claim.')
    if (preparedCount > 0) return { preparedMap: preparedByChain, errorsMap: prepareErrors }

    setPreparing(true)
    setError(null)
    setPrepareErrors({})
    setActionResults([])

    const nextPrepared = {}
    const nextErrors = {}

    try {
      // Prepare sequentially (MetaMask Mobile safe)
      for (let i = 0; i < claimPlan.length; i++) {
        const chainPlan = claimPlan[i]
        const chainId = Number(chainPlan.chainId)

        try {
          const ctx = await Promise.race([
            prepareChainPlanWithFlow(chainPlan, address),
            new Promise((_, rej) => setTimeout(() => rej(new Error(`Prepare chain ${chainId} timed out`)), 60_000))
          ])
          nextPrepared[chainId] = ctx
        } catch (e) {
          nextErrors[chainId] = e?.message || 'Prepare failed'
        }

        await new Promise((r) => setTimeout(r, 150))
      }
    } finally {
      setPreparedByChain(nextPrepared)
      setPrepareErrors(nextErrors)
      setPreparing(false)

      const totalSwaps = Object.values(nextPrepared).reduce((s, ctx) => s + Number(ctx?.swappableCount || 0), 0)
      if (totalSwaps === 0) {
        setError('No 0x routes available for the selected tokens (all steps returned “no route”).')
      }
    }

    return { preparedMap: nextPrepared, errorsMap: nextErrors }
  }, [isConnected, planAvailable, preparedCount, claimPlan, address, preparedByChain, prepareErrors])

  const handleApprove = async () => {
    try {
      setError(null)
      setActionResults([])

      const { preparedMap } = await ensurePrepared()
      const chainIds = Object.keys(preparedMap || {}).map(Number)
      if (chainIds.length === 0) throw new Error('Nothing prepared (all chains failed to prepare).')

      setApproving(true)

      const results = []
      for (const chainId of chainIds) {
        const ctx = preparedMap[chainId]
        try {
          const { receipts } = await executeApprovalsWithFlow(ctx)
          const ok = receipts?.some((r) => r.type === 'approval' && (r.ok || r.skipped))
          results.push({ chainId, action: 'approval', success: !!ok, receipts })
        } catch (e) {
          results.push({ chainId, action: 'approval', success: false, error: e?.message || 'Approval failed' })
          break
        }
        await new Promise((r) => setTimeout(r, 250))
      }

      setActionResults(results)
    } catch (e) {
      setError(e?.message || 'Approve failed')
    } finally {
      setApproving(false)
    }
  }

  const handleClaim = async () => {
    try {
      setError(null)
      setActionResults([])

      const { preparedMap } = await ensurePrepared()
      const chainIds = Object.keys(preparedMap || {}).map(Number)
      if (chainIds.length === 0) throw new Error('Nothing prepared (all chains failed to prepare).')

      setClaiming(true)

      const results = []
      for (const chainId of chainIds) {
        const ctx = preparedMap[chainId]
        try {
          const { receipts } = await executeSwapsWithFlow(ctx)
          const ok = receipts?.some((r) => r.type === 'swap' && r.ok && r.txHash)
          results.push({ chainId, action: 'swap', success: !!ok, receipts })
        } catch (e) {
          results.push({ chainId, action: 'swap', success: false, error: e?.message || 'Swap failed' })
          break
        }
        await new Promise((r) => setTimeout(r, 250))
      }

      setActionResults(results)
    } catch (e) {
      setError(e?.message || 'Claim failed')
    } finally {
      setClaiming(false)
    }
  }

  const busy = preparing || approving || claiming

  return (
    <div className="claim-screen">
      <div className="claim-header">
        <h1>Dust Claim</h1>
        <p>
          0x v2 Allowance Holder routes + DustClaimV3.claimDustUsingAggregator
          {device === 'mobile' ? ' (Mobile mode)' : ''}
        </p>
      </div>

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

      <div className="action-section" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={handleApprove}
          disabled={busy || !planAvailable}
          className="execute-button"
          title="Approve required tokens to DustClaimV3 (user -> DustClaimV3)."
        >
          {preparing ? 'Preparing…' : approving ? 'Approving…' : 'Approve Tokens'}
        </button>

        <button
          onClick={handleClaim}
          disabled={busy || !planAvailable}
          className="execute-button"
          title="Execute DustClaimV3 swaps (AllowanceHolder route)."
        >
          {preparing ? 'Preparing…' : claiming ? 'Claiming…' : 'Claim Dust'}
        </button>

        {!planAvailable && (
          <div className="error-message" style={{ width: '100%' }}>
            No claim plan available on this screen. Go back to Scanner, tap “Batch Claim”, then open Claim again.
          </div>
        )}

        {error && (
          <div className="error-message" style={{ width: '100%' }}>
            {error}
          </div>
        )}
      </div>

      {actionResults.length > 0 && (
        <div className="results-card" style={{ marginTop: 16 }}>
          <h3>Results</h3>
          {actionResults.map((r, i) => {
            const info = getChainInfo(r.chainId || defaultChainId)
            return (
              <div key={i} className={r.success ? 'success' : 'error'}>
                <strong>
                  {info.name} · {String(r.action || 'tx').toUpperCase()}
                </strong>
                {r.error && <p>{r.error}</p>}
              </div>
            )
          })}
        </div>
      )}

      <div className="footer-actions">
        <button onClick={() => navigate('/scanner')} className="btn btn-outline">
          ← Back to Scanner
        </button>
      </div>
    </div>
  )
}

export default ClaimScreen