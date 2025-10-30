import React, { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ethers } from 'ethers'
import { useWallet } from '../contexts/WalletContext'
import { executeChainPlan } from '../services/claimExecutor'
import permSvc from '../services/permissionlessContractService'
import { buildDustClaimBatch } from '../services/dustClaimService'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import { NATIVE_LOGOS } from '../services/logoService'
import TokenRow from '../components/TokenRow'
import './ClaimScreen.css'

const ClaimScreen = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { address, isConnected, loading: walletLoading } = useWallet()

  // -------- incoming data from DustScanner --------
  const {
    claimPlan = [],
    batchTransactions = [],
    oneInchSingle = null,
    oneInchBatch = null,
    uniswapSingle = null,
    dustResults = [],
    totalDustValue = 0,
    batchSavings = null
  } = location.state || {}

  // ✅ Determine if we have something to execute
  const planAvailable = useMemo(() => {
    if (Array.isArray(claimPlan) && claimPlan.length > 0) return true
    if (Array.isArray(batchTransactions) && batchTransactions.length > 0) return true
    return false
  }, [claimPlan, batchTransactions])

  // ✅ Live chain count (dust found)
  const realTimeChains = useMemo(() => {
    const s = new Set()
    for (const r of (dustResults || [])) {
      const hasNative = Number(r?.nativeBalance || '0') > 0
      const hasTokens = Array.isArray(r?.tokenDust) && r.tokenDust.length > 0
      if (hasNative || hasTokens) s.add(Number(r.chainId))
    }
    return s.size
  }, [dustResults])

  // ✅ Chain count used for progress bar
  const totalChains = useMemo(() => {
    if (planAvailable && claimPlan.length) return claimPlan.length
    if (planAvailable && batchTransactions.length) return 1
    return realTimeChains
  }, [planAvailable, claimPlan, batchTransactions, realTimeChains])

  // ✅ Smart chainId fallback for explorer
  const defaultChainId = useMemo(() => {
    const fromPlan = claimPlan?.[0]?.chainId
    const fromBatch = batchTransactions?.[0]?.chainId
    const fromDust = dustResults?.[0]?.chainId
    return Number(fromPlan || fromBatch || fromDust || 1)
  }, [claimPlan, batchTransactions, dustResults])

  // -------- Local UI state --------
  const [claiming, setClaiming] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [claimResults, setClaimResults] = useState([])
  const [error, setError] = useState(null)

  const getChainInfo = (chainId) =>
    SUPPORTED_CHAINS?.[Number(chainId)] || { name: 'Unknown', explorer: '' }

  // ============================================================================
  // A) Execute optimized claim plan (preferred path)
  // ============================================================================
  const handleExecuteClaim = async () => {
    setClaiming(true)
    setError(null)
    setClaimResults([])

    try {
      if (planAvailable) {
        const allResults = []
        const planToRun =
          claimPlan && claimPlan.length
            ? claimPlan
            : batchTransactions.length
            ? [{ chainId: batchTransactions[0]?.chainId, steps: batchTransactions }]
            : []

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
          await new Promise((r) => setTimeout(r, 200))
        }

        setClaimResults(allResults)
        return
      }

      // Fallback: build contract transactions manually
      if (!dustResults || dustResults.length === 0)
        throw new Error('Nothing to execute: no dust found')

      if (typeof window === 'undefined' || !window.ethereum)
        throw new Error('No wallet provider in browser')

      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()

      const txs = await buildDustClaimBatch(dustResults, signer)
      if (!txs.length) throw new Error('Nothing to execute: no ERC-20 dust tokens')

      const results = []
      for (let i = 0; i < txs.length; i++) {
        const tx = txs[i]
        setCurrentStep(i + 1)
        try {
          const sent = await signer.sendTransaction({
            to: tx.to,
            data: tx.data,
            value: tx.value ?? 0n
          })
          const r = await sent.wait()
          results.push({ chainId: tx.chainId, success: true, receipts: [{ hash: r.hash }] })
        } catch (e) {
          results.push({
            chainId: tx.chainId,
            success: false,
            error: e?.message || 'Transaction failed'
          })
        }
        await new Promise((r) => setTimeout(r, 120))
      }

      setClaimResults(results)
    } catch (e) {
      setError(e?.message || 'Claim execution error')
    } finally {
      setClaiming(false)
      setCurrentStep(0)
    }
  }

  // ============================================================================
  // B) Quick actions (permissionless 1inch + Uniswap)
  // ============================================================================
  const handleOneInchSingle = async () => {
    if (!oneInchSingle) return
    setClaiming(true); setError(null)
    try {
      const { token, quotedMinOutWei, calldata } = oneInchSingle
      const res = await permSvc.claimDust1inch(token, ethers.toBigInt(quotedMinOutWei), calldata)
      setClaimResults([{ chainId: defaultChainId, success: !!res.success, receipts: [{ txHash: res.txHash }] }])
    } catch (e) {
      setError(e?.message || '1inch swap failed')
    } finally {
      setClaiming(false)
    }
  }

  const handleOneInchBatch = async () => {
    if (!oneInchBatch) return
    setClaiming(true); setError(null)
    try {
      const { tokens, minOutsWei, datas } = oneInchBatch
      const res = await permSvc.claimDustBatch1inch(tokens, minOutsWei.map(ethers.toBigInt), datas)
      setClaimResults([{ chainId: defaultChainId, success: !!res.success, receipts: [{ txHash: res.txHash }] }])
    } catch (e) {
      setError(e?.message || 'Batch 1inch swap failed')
    } finally {
      setClaiming(false)
    }
  }

  const handleUniswapSingle = async () => {
    if (!uniswapSingle) return
    setClaiming(true); setError(null)
    try {
      const { token, fee = 3000, minOutWei, ttlSec = 900 } = uniswapSingle
      const deadline = Math.floor(Date.now() / 1000) + Number(ttlSec || 900)
      const res = await permSvc.claimDustUniswap(token, fee, ethers.toBigInt(minOutWei), deadline)
      setClaimResults([{ chainId: defaultChainId, success: !!res.success, receipts: [{ txHash: res.txHash }] }])
    } catch (e) {
      setError(e?.message || 'Uniswap swap failed')
    } finally {
      setClaiming(false)
    }
  }

  // ============================================================================
  // Render
  // ============================================================================
  const successful = claimResults.filter((r) => r.success).length
  const failed = Math.max(0, claimResults.length - successful)
  const fmt = (n) => Number(n || 0).toFixed(6)
  const usd = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n || 0))

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
              <div className="summary-value">{usd(totalDustValue)}</div>
            </div>
          </div>
          <div className="summary-item">
            <div className="summary-icon">🌐</div>
            <div className="summary-content">
              <h3>Chains</h3>
              <div className="summary-value">{totalChains}</div>
              {!planAvailable && <div className="summary-sub">live from scan</div>}
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

      {/* Chain Overview from dustResults */}
      {dustResults?.length > 0 && (
        <div className="chains-section">
          <h2>Detected Chains</h2>
          <div className="chains-grid">
            {dustResults.map((r, idx) => {
              const meta = SUPPORTED_CHAINS[r.chainId] || {}
              const nativeLogo = meta.logo || NATIVE_LOGOS[r.chainId] || '/logos/chains/generic.png'
              return (
                <div key={idx} className="chain-card">
                  <div className="chain-header">
                    <div className="chain-info">
                      <img className="chain-logo" src={nativeLogo} alt={meta.name} />
                      <div>
                        <h3>{meta.name}</h3>
                        <p className="chain-value">{usd(r.totalValue || 0)}</p>
                      </div>
                    </div>
                    <div className="chain-balance">
                      <div className="native-balance">
                        {fmt(r.nativeBalance)} {meta.symbol}
                      </div>
                      {!!(r.tokenDust?.length) && (
                        <div className="token-count">+{r.tokenDust.length} tokens</div>
                      )}
                    </div>
                  </div>

                  <div className="price-details">
                    <div className="price-item">
                      <span>Native:</span>
                      <span>
                        {fmt(r.nativeBalance)} {meta.symbol} ({usd(r.nativeValue || 0)})
                      </span>
                    </div>

                    {(r.tokenDust || []).slice(0, 3).map((t, i) => (
                      <TokenRow key={`${r.chainId}-${t.address}-${i}`} token={t} />
                    ))}

                    {(r.tokenDust?.length || 0) > 3 && (
                      <div className="price-item more">
                        +{r.tokenDust.length - 3} more tokens
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Claim Actions */}
      <div className="action-section">
        <button
          onClick={handleExecuteClaim}
          disabled={claiming || walletLoading || !isConnected}
          className="execute-button"
        >
          {claiming ? '⏳ Executing…' : '🚀 Execute Optimized Claim'}
        </button>

        {!planAvailable && (
          <div className="hint-banner">
            No prepared plan from the scanner. We’ll build contract calls directly for each ERC-20 dust item.
          </div>
        )}

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

        {!isConnected && <p className="action-hint">Connect your wallet to start claiming.</p>}
        {error && <div className="error-message">{error}</div>}
      </div>

      {/* Progress bar */}
      {claiming && totalChains > 0 && (
        <div className="claiming-progress">
          <div className="progress-info">
            <div className="spinner" />
            <span>Processing {Math.min(currentStep, totalChains)}/{totalChains}</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${(currentStep / Math.max(totalChains, 1)) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Results Summary */}
      {claimResults.length > 0 && (
        <div className="results-card">
          <h3>Results Summary</h3>
          <div className="results-summary">
            <div className="result-success">✅ {successful} succeeded</div>
            <div className="result-failed">❌ {failed} failed</div>
          </div>

          <div className="results-details">
            {claimResults.map((result, idx) => {
              const info = getChainInfo(result.chainId || defaultChainId)
              return (
                <div key={idx} className={`result-item ${result.success ? 'success' : 'error'}`}>
                  <div className="result-header"><strong>{info.name}</strong></div>
                  {result.success && result.receipts?.length > 0 ? (
                    result.receipts.map((r, i) => {
                      const tx = r.txHash || r.hash
                      return tx ? (
                        <div key={i} className="tx-item">
                          <a
                            href={info.explorer ? `${info.explorer}/tx/${tx}` : '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            TX {tx.slice(0, 10)}…{tx.slice(-8)}
                          </a>
                        </div>
                      ) : (
                        <div key={i} className="tx-item">✅ Step {i + 1} completed</div>
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

      {/* Security notice */}
      <div className="security-notice">
        <h4>🔒 Security Check</h4>
        <ul>
          <li>All transactions use aggregator/router calldata you provide.</li>
          <li>No custody — swaps pay back directly to your wallet.</li>
          <li>Permit/EIP-2612 is used where supported to reduce approvals.</li>
          <li>Gas is estimated per chain before signing.</li>
        </ul>
      </div>

      {/* Footer */}
      <div className="footer-actions">
        <button onClick={() => navigate('/scanner')} className="btn btn-outline">
          ← Back to Scanner
        </button>
      </div>
    </div>
  )
}

export default ClaimScreen