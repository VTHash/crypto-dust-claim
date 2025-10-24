import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useWallet } from '../contexts/WalletContext'
import { executeChainPlan } from '../services/claimExecutor'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import './ClaimScreen.css'

const ClaimScreen = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { address } = useWallet()

  // From DustScanner
  const {
    claimPlan = [], // new optimized plan
    batchTransactions = [],
    dustResults = [],
    totalDustValue = 0,
    batchSavings = null
  } = location.state || {}

  const [claiming, setClaiming] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [claimResults, setClaimResults] = useState([])

  const handleExecuteClaim = async () => {
    setClaiming(true)
    setClaimResults([])
    try {
      const allResults = []

      const planToRun = claimPlan.length > 0
        ? claimPlan
        : [{ chainId: batchTransactions[0]?.chainId, steps: batchTransactions }]

      for (let i = 0; i < planToRun.length; i++) {
        const chainPlan = planToRun[i]
        setCurrentStep(i + 1)

        try {
          console.log(`Executing plan on chain ${chainPlan.chainId}...`)
          const receipts = await executeChainPlan(chainPlan, address)
          allResults.push({ chainId: chainPlan.chainId, success: true, receipts })
        } catch (error) {
          console.error(`Plan failed on chain ${chainPlan.chainId}:`, error)
          allResults.push({
            chainId: chainPlan.chainId,
            success: false,
            error: error.message
          })
        }

        await new Promise((r) => setTimeout(r, 1000)) // small pause
      }

      setClaimResults(allResults)
    } catch (error) {
      console.error('Claim execution error:', error)
    } finally {
      setClaiming(false)
      setCurrentStep(0)
    }
  }

  const getChainInfo = (chainId) =>
    SUPPORTED_CHAINS[chainId] || { name: 'Unknown', logo: '❓', explorer: '' }

  const totalChains = claimPlan.length || 1
  const successful = claimResults.filter((r) => r.success).length
  const failed = claimResults.length - successful

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
              <div className="summary-value">${totalDustValue.toFixed(4)}</div>
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

      {/* Claim Execution */}
      <div className="action-section">
        {!claiming ? (
          <button
            onClick={handleExecuteClaim}
            disabled={claiming}
            className="execute-button"
          >
            🚀 Execute Optimized Claim
          </button>
        ) : (
          <div className="claiming-progress">
            <div className="progress-info">
              <div className="spinner"></div>
              <span>
                Processing {currentStep}/{totalChains}
              </span>
            </div>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${(currentStep / totalChains) * 100}%`
                }}
              ></div>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {claimResults.length > 0 && (
        <div className="results-card">
          <h3>Results Summary</h3>
          <div className="results-summary">
            <div className="result-success">✅ {successful} succeeded</div>
            <div className="result-failed">❌ {failed} failed</div>
          </div>
          <div className="results-details">
            {claimResults.map((result, index) => {
              const chain = getChainInfo(result.chainId)
              return (
                <div
                  key={index}
                  className={`result-item ${
                    result.success ? 'success' : 'error'
                  }`}
                >
                  <div className="result-header">
                    <span>{chain.logo}</span>
                    <strong>{chain.name}</strong>
                  </div>
                  {result.success && result.receipts?.length > 0 ? (
                    result.receipts.map((r, i) => (
                      <div key={i} className="tx-item">
                        {r.txHash ? (
                          <a
                            href={`${chain.explorer}/tx/${r.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            TX {r.txHash.slice(0, 10)}...{r.txHash.slice(-8)}
                          </a>
                        ) : (
                          <span>✅ Step {i + 1} completed</span>
                        )}
                      </div>
                    ))
                  ) : (
                    <p>{result.error || 'Failed on this chain'}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Security */}
      <div className="security-notice">
        <h4>🔒 Security Check</h4>
        <ul>
          <li>All transactions are pre-verified via aggregator APIs</li>
          <li>No custom approvals unless strictly required</li>
          <li>Claim process uses EIP-2612 permits when possible</li>
          <li>Gas fees are estimated per chain before confirmation</li>
        </ul>
      </div>

      {/* Back Button */}
      <div className="footer-actions">
        <button onClick={() => navigate('/scanner')} className="btn btn-outline">
          ← Back to Scanner
        </button>
      </div>
    </div>
  )
}

export default ClaimScreen