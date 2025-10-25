import React, { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ethers } from 'ethers'
import { useWallet } from '../contexts/WalletContext'
import { executeChainPlan } from '../services/claimExecutor'
import permSvc from '../services/permissionlessContractService'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import './ClaimScreen.css'

const ClaimScreen = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { address, isConnected, loading: walletLoading } = useWallet()

  // -------- incoming data from DustScanner (use whatever you already pass) --------
  const {
    // your previous optimized plan for the legacy executor
    claimPlan = [],

    // legacy batch structure (kept for backward compatibility)
    batchTransactions = [],

    // optional helpers from your scanner if you compute 1inch/uni quotes client side
    oneInchSingle = null, // { token, quotedMinOutWei, calldata }
    oneInchBatch = null, // { tokens, minOutsWei, datas }
    uniswapSingle = null, // { token, fee, minOutWei, ttlSec }

    // display/summary
    dustResults = [],
    totalDustValue = 0,
    batchSavings = null
  } = location.state || {}

  // -------- local UI state --------
  const [claiming, setClaiming] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [claimResults, setClaimResults] = useState([])
  const [error, setError] = useState(null)

  const totalChains = useMemo(
    () => (claimPlan && claimPlan.length ? claimPlan.length : 1),
    [claimPlan]
  )

  const getChainInfo = (chainId) =>
    SUPPORTED_CHAINS?.[Number(chainId)] || { name: 'Unknown', explorer: '' }

  // ============================================================================
  // A) Your existing “optimized plan” path (uses executeChainPlan)
  // ============================================================================
  const handleExecuteClaim = async () => {
    setClaiming(true)
    setError(null)
    setClaimResults([])

    try {
      const allResults = []
      const planToRun =
        claimPlan && claimPlan.length
          ? claimPlan
          : batchTransactions.length
          ? [{ chainId: batchTransactions[0]?.chainId, steps: batchTransactions }]
          : []

      if (!planToRun.length) {
        throw new Error('Nothing to execute: missing plan/transactions')
      }

      for (let i = 0; i < planToRun.length; i++) {
        const chainPlan = planToRun[i]
        setCurrentStep(i + 1)
        try {
          const receipts = await executeChainPlan(chainPlan, address)
          allResults.push({ chainId: chainPlan.chainId, success: true, receipts })
        } catch (e) {
          allResults.push({
            chainId: chainPlan.chainId,
            success: false,
            error: e?.message || 'Execution failed'
          })
        }
        // tiny pause keeps UI feeling responsive
        await new Promise((r) => setTimeout(r, 300))
      }

      setClaimResults(allResults)
    } catch (e) {
      setError(e?.message || 'Claim execution error')
    } finally {
      setClaiming(false)
      setCurrentStep(0)
    }
  }

  // ============================================================================
  // B) New permissionless contract paths
  // ============================================================================

  // 1) Single token via 1inch
  const handleOneInchSingle = async () => {
    if (!oneInchSingle) return
    setClaiming(true); setError(null)
    try {
      const { token, quotedMinOutWei, calldata } = oneInchSingle
      const res = await permSvc.claimDust1inch(
        token,
        ethers.toBigInt(quotedMinOutWei),
        calldata
      )
      setClaimResults([{ chainId: (await permSvc.getReadonlyProvider)?.chainId, success: res.success, receipts: [{ txHash: res.txHash }] }])
    } catch (e) {
      setError(e?.message || '1inch swap failed')
    } finally {
      setClaiming(false)
    }
  }

  // 2) Batch via 1inch
  const handleOneInchBatch = async () => {
    if (!oneInchBatch) return
    setClaiming(true); setError(null)
    try {
      const { tokens, minOutsWei, datas } = oneInchBatch
      const res = await permSvc.claimDustBatch1inch(
        tokens,
        minOutsWei.map(ethers.toBigInt),
        datas
      )
      setClaimResults([{ success: res.success, receipts: [{ txHash: res.txHash }] }])
    } catch (e) {
      setError(e?.message || 'Batch 1inch swap failed')
    } finally {
      setClaiming(false)
    }
  }

  // 3) Single token via Uniswap V3
  const handleUniswapSingle = async () => {
    if (!uniswapSingle) return
    setClaiming(true); setError(null)
    try {
      const { token, fee = 3000, minOutWei, ttlSec = 900 } = uniswapSingle
      const deadline = Math.floor(Date.now() / 1000) + Number(ttlSec || 900)
      const res = await permSvc.claimDustUniswap(
        token,
        fee,
        ethers.toBigInt(minOutWei),
        deadline
      )
      setClaimResults([{ success: res.success, receipts: [{ txHash: res.txHash }] }])
    } catch (e) {
      setError(e?.message || 'Uniswap swap failed')
    } finally {
      setClaiming(false)
    }
  }

  // ----------------------------------------------------------------------------

  const successful = claimResults.filter((r) => r.success).length
  const failed = Math.max(0, claimResults.length - successful)

  return (
    <div className="claim-screen">
      <div className="claim-header">
        <h1>Batch Dust Claim</h1>
        <p>Execute optimized multi-chain claims with minimal gas</p>
      </div>

      {/* Summary */}
      <div className="summary-card">
        <div className="summary-grid">
          <div className="summary-item">
            <div className="summary-icon">💰</div>
            <div className="summary-content">
              <h3>Total Value</h3>
              <div className="summary-value">
                ${Number(totalDustValue || 0).toFixed(4)}
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

      {/* Actions */}
      <div className="action-section">
        {/* Legacy “optimized plan” executor */}
        <button
          onClick={handleExecuteClaim}
          disabled={claiming || walletLoading || !isConnected}
          className="execute-button"
        >
          {claiming ? '⏳ Executing…' : '🚀 Execute Optimized Claim'}
        </button>

        {/* Permissionless quick actions (only render if we have inputs) */}
        {oneInchSingle && (
          <button
            onClick={handleOneInchSingle}
            disabled={claiming || walletLoading || !isConnected}
            className="secondary-button"
          >
            🔁 1inch (single)
          </button>
        )}

        {oneInchBatch && (
          <button
            onClick={handleOneInchBatch}
            disabled={claiming || walletLoading || !isConnected}
            className="secondary-button"
          >
            🧺 1inch (batch)
          </button>
        )}

        {uniswapSingle && (
          <button
            onClick={handleUniswapSingle}
            disabled={claiming || walletLoading || !isConnected}
            className="secondary-button"
          >
            ♻️ Uniswap V3 (single)
          </button>
        )}

        {!isConnected && (
          <p className="action-hint">Connect your wallet to start claiming.</p>
        )}

        {error && <div className="error-message">{error}</div>}
      </div>

      {/* Progress bar */}
      {claiming && (
        <div className="claiming-progress">
          <div className="progress-info">
            <div className="spinner" />
            <span>
              Processing {Math.min(currentStep, totalChains)}/{totalChains}
            </span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(currentStep / totalChains) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Results */}
      {claimResults.length > 0 && (
        <div className="results-card">
          <h3>Results Summary</h3>
          <div className="results-summary">
            <div className="result-success">✅ {successful} succeeded</div>
            <div className="result-failed">❌ {failed} failed</div>
          </div>

          <div className="results-details">
            {claimResults.map((result, idx) => {
              const info =
                getChainInfo(result.chainId) ||
                { explorer: '', name: 'Unknown' }
              return (
                <div
                  key={idx}
                  className={`result-item ${result.success ? 'success' : 'error'}`}
                >
                  <div className="result-header">
                    <strong>{info.name}</strong>
                  </div>

                  {result.success && result.receipts?.length > 0 ? (
                    result.receipts.map((r, i) => {
                      const tx = r.txHash || r.hash
                      return tx ? (
                        <div key={i} className="tx-item">
                          <a
                            href={
                              info.explorer
                                ? `${info.explorer}/tx/${tx}`
                                : `#`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            TX {tx.slice(0, 10)}…{tx.slice(-8)}
                          </a>
                        </div>
                      ) : (
                        <div key={i} className="tx-item">
                          ✅ Step {i + 1} completed
                        </div>
                      )
                    })
                  ) : (
                    <p>{result.error || 'Failed on this chain'}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Security note */}
      <div className="security-notice">
        <h4>🔒 Security Check</h4>
        <ul>
          <li>All transactions use aggregator/router calldata you provide.</li>
          <li>No custody — swaps pay back directly to your wallet.</li>
          <li>Permit/EIP-2612 is used where supported to cut approvals.</li>
          <li>Gas is estimated per chain before you sign.</li>
        </ul>
      </div>

      {/* Back */}
      <div className="footer-actions">
        <button onClick={() => navigate('/scanner')} className="btn btn-outline">
          ← Back to Scanner
        </button>
      </div>
    </div>
  )
}

export default ClaimScreen