import React, { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ethers } from 'ethers'
import { useWallet } from '../contexts/WalletContext'
import { useScan } from '../contexts/ScanContext'
import { executeChainPlan } from '../services/claimExecutor'
import permSvc from '../services/permissionlessContractService' // kept (not used)
import { buildDustClaimBatch } from '../services/dustClaimService' // kept (fallback only)
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
  const {
    claimPlan = [],
    batchTransactions = [],
    batchSavings = null
  } = location.state || {}

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
    : new Set(dustResults.map(r => r.chainId)).size

  const defaultChainId =
    claimPlan?.[0]?.chainId || dustResults?.[0]?.chainId || 1

  // ---------------- UI state ----------------
  const [claiming, setClaiming] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [claimResults, setClaimResults] = useState([])
  const [error, setError] = useState(null)

  const getChainInfo = (chainId) =>
    SUPPORTED_CHAINS?.[Number(chainId)] || { name: 'Unknown', explorer: '' }

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

    const results = []

    try {
      for (let i = 0; i < claimPlan.length; i++) {
        const chainPlan = claimPlan[i]
        setCurrentStep(i + 1)

        try {
  const receipts = await executeChainPlan(chainPlan, address)

  const approvalsOk = receipts.filter(r => r.type === 'approval' && r.ok).length
  const swapsOk = receipts.filter(r => r.type === 'swap' && r.ok && r.txHash).length
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


        await new Promise(r => setTimeout(r, 150))
      }

      setClaimResults(results)
    } catch (err) {
      setError(err?.message || 'Claim execution error')
    } finally {
      setClaiming(false)
      setCurrentStep(0)
    }
  }

  // ---------------- render helpers ----------------
  const successful = claimResults.filter(r => r.success).length
  const failed = claimResults.length - successful

  const usdFmt = (n) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(Number(n || 0))

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
              <div className="summary-value">
                {usdFmt(computedTotalDustValue)}
              </div>
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
                <div className="summary-value">
                  {batchSavings.savingsPercentage}%
                </div>
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
              const logo =
                meta.logo ||
                NATIVE_LOGOS[r.chainId] ||
                '/logos/chains/generic.png'

              return (
                <div key={idx} className="chain-card">
                  <div className="chain-header">
                    <div className="chain-info">
                      <img src={logo} className="chain-logo" alt={meta.name} />
                      <div>
                        <h3>{meta.name}</h3>
                        <p className="chain-value">
                          {usdFmt(r.totalValue || 0)}
                        </p>
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
        <button
          onClick={handleExecuteClaim}
          disabled={claiming}
          className="execute-button"
        >
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
            return (
              <div key={i} className={r.success ? 'success' : 'error'}>
                <strong>{info.name}</strong>
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
