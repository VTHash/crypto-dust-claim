import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../contexts/WalletContext'
import web3Service from '../services/web3Service'
import batchService from '../services/batchService'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import './DustScanner.css'
import ChainLogo from '../components/ChainLogo'
// Optional aggregator (1inch/Uni). If you don't have it yet, this import is fine;
// calls are guarded so the app won’t crash.
import * as dexAggregatorService from '../services/dexAggregatorService'

const DustScanner = () => {
  const { address } = useWallet()
  const navigate = useNavigate()

  const [scanning, setScanning] = useState(false)
  const [dustResults, setDustResults] = useState([])
  const [totalDustValue, setTotalDustValue] = useState(0)
  const [batchSavings, setBatchSavings] = useState(null)
  const [quickOneInchSingle, setQuickOneInchSingle] = useState(null)
  const [quickOneInchBatch, setQuickOneInchBatch] = useState(null)
  const [quickUniswapSingle, setQuickUniswapSingle] = useState(null)

  const [selectedChains, setSelectedChains] = useState(
    Object.keys(SUPPORTED_CHAINS).reduce((acc, chainId) => {
      acc[chainId] = true
      return acc
    }, {})
  )

  useEffect(() => {
    if (address) scanForDust()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  const buildQuickActions = async (enriched) => {
    // Reset first
    setQuickOneInchSingle(null)
    setQuickOneInchBatch(null)
    setQuickUniswapSingle(null)

    // If no aggregator service available, stop quietly
    if (!dexAggregatorService || typeof dexAggregatorService !== 'object') return

    // Find a “best candidate” token for single-swap helpers (highest USD value, if you computed it; else first)
    const withAnyToken = enriched
      .map(r => ({
        ...r,
        tokenDust: (r.tokenDust || []).map(t => ({
          ...t,
          // attempt a value estimate if not present
          _usd: typeof t.usd === 'number' ? t.usd : 0
        }))
      }))
      .filter(r => r.tokenDust && r.tokenDust.length > 0)

    const top =
      withAnyToken
        .map(r => {
          const best = [...r.tokenDust].sort((a, b) => (b._usd ?? 0) - (a._usd ?? 0))[0]
          return best ? { chainId: r.chainId, token: best } : null
        })
        .filter(Boolean)[0] || null

    // 1) Single token via 1inch
    try {
      if (top && typeof dexAggregatorService.quoteOneInchSingle === 'function') {
        // You may change target to WETH / ETH as your service expects
        const single = await dexAggregatorService.quoteOneInchSingle({
          chainId: Number(top.chainId),
          tokenIn: top.token.address,
          amount: top.token.balance // string/decimal; service should handle decimals
        })
        // Expecting: { calldata, quotedMinOutWei }
        if (single?.calldata && single?.quotedMinOutWei) {
          setQuickOneInchSingle({
            token: top.token.address,
            quotedMinOutWei: single.quotedMinOutWei,
            calldata: single.calldata
          })
        }
      }
    } catch (_) {}

    // 2) Batch via 1inch
    try {
      if (withAnyToken.length && typeof dexAggregatorService.quoteOneInchBatch === 'function') {
        const flat = withAnyToken.flatMap(r =>
          r.tokenDust.map(t => ({
            chainId: Number(r.chainId),
            token: t.address,
            amount: t.balance
          }))
        )

        const batch = await dexAggregatorService.quoteOneInchBatch(flat)
        // Expecting: { tokens, minOutsWei, datas }
        if (batch?.tokens?.length && batch?.minOutsWei?.length && batch?.datas?.length) {
          setQuickOneInchBatch({
            tokens: batch.tokens,
            minOutsWei: batch.minOutsWei,
            datas: batch.datas
          })
        }
      }
    } catch (_) {}

    // 3) Single token via Uniswap V3
    try {
      if (top && typeof dexAggregatorService.quoteUniswapSingle === 'function') {
        const uni = await dexAggregatorService.quoteUniswapSingle({
          chainId: Number(top.chainId),
          tokenIn: top.token.address,
          amount: top.token.balance
        })
        // Expecting: { fee, minOutWei, ttlSec }
        if (uni?.minOutWei) {
          setQuickUniswapSingle({
            token: top.token.address,
            fee: uni.fee ?? 3000,
            minOutWei: uni.minOutWei,
            ttlSec: uni.ttlSec ?? 900
          })
        }
      }
    } catch (_) {}
  }

  const scanForDust = async () => {
    if (!address) return
    setScanning(true)
    setDustResults([])
    try {
      const chainsToScan = Object.keys(selectedChains).filter((id) => selectedChains[id])

      const scanPromises = chainsToScan.map((chainId) =>
        web3Service.checkForDust(chainId, address)
      )

      const settled = await Promise.allSettled(scanPromises)
      const valid = settled
        .filter((r) => r.status === 'fulfilled' && r.value?.hasDust)
        .map((r) => r.value)

      // attach USD values + labels
      const enriched = await Promise.all(
        valid.map(async (r) => {
          const usdValue = await web3Service.getUSDValue(
            r.chainId,
            r.nativeBalance,
            r.tokenDust
          )
          const meta = SUPPORTED_CHAINS[r.chainId] || {}
          return {
            ...r,
            usdValue,
            chainName: meta.name,
            symbol: meta.symbol,
          }
        })
      )

      setDustResults(enriched)
      setTotalDustValue(enriched.reduce((sum, r) => sum + (r.usdValue || 0), 0))

      // estimate savings (optional)
      try {
        const allTokenDust = enriched.flatMap((r) => r.tokenDust)
        const savings =
          (batchService.calculateGasSavings &&
            (await batchService.calculateGasSavings(allTokenDust, enriched))) ||
          null
        setBatchSavings(savings)
      } catch {
        setBatchSavings(null)
      }

      // prepare quick-action payloads for ClaimScreen (optional)
      await buildQuickActions(enriched)
    } catch (err) {
      console.error('Error scanning for dust:', err)
    } finally {
      setScanning(false)
    }
  }

  const handleBatchClaim = async () => {
    try {
      // Build a normalized claim inputs list
      const claims = dustResults.flatMap((r) =>
        (r.tokenDust || []).map((t) => ({
          chainId: r.chainId,
          tokenAddress: t.address,
          tokenSymbol: t.symbol,
          amount: t.balance,
          recipient: address,
        }))
      )

      // Prefer an optimized multi-step plan when available
      let claimPlan = []
      try {
        if (typeof batchService.buildClaimPlan === 'function') {
          claimPlan = await batchService.buildClaimPlan(claims)
        }
      } catch (e) {
        console.warn('buildClaimPlan failed or not available, falling back:', e?.message)
      }

      // Legacy fallback – create raw per-chain tx set
      let batchTransactions = []
      if (!claimPlan?.length) {
        if (typeof batchService.createBatchDustClaim === 'function') {
          batchTransactions = await batchService.createBatchDustClaim(claims)
        } else {
          batchTransactions = []
        }
      }

      navigate('/claim', {
        state: {
          // new optimized route
          claimPlan,
          // legacy route for compatibility
          batchTransactions,
          // context for UI
          dustResults,
          totalDustValue,
          batchSavings,

          // NEW: quick-action payloads (ClaimScreen shows buttons only if these exist)
          oneInchSingle: quickOneInchSingle,
          oneInchBatch: quickOneInchBatch,
          uniswapSingle: quickUniswapSingle
        },
      })
    } catch (err) {
      console.error('Claim preparation error:', err)
    }
  }

  const toggleChainSelection = (chainId) => {
    setSelectedChains((prev) => ({ ...prev, [chainId]: !prev[chainId] }))
  }

  const selectAllChains = () => {
    setSelectedChains(
      Object.keys(SUPPORTED_CHAINS).reduce((acc, id) => ((acc[id] = true), acc), {})
    )
  }

  const deselectAllChains = () => {
    setSelectedChains(
      Object.keys(SUPPORTED_CHAINS).reduce((acc, id) => ((acc[id] = false), acc), {})
    )
  }

  const selectedChainCount = Object.values(selectedChains).filter(Boolean).length

  return (
    <div className="dust-scanner">
      <div className="scanner-header">
        <h1>Multi-Chain Dust Scanner</h1>
        <p>Scan across multiple blockchains for claimable dust</p>
      </div>

      {/* Chain Selection */}
      <div className="chain-selection-card">
        <div className="chain-selection-header">
          <h3>Select Chains to Scan</h3>
          <div className="selection-actions">
            <button onClick={selectAllChains} className="btn btn-outline btn-sm">
              Select All
            </button>
            <button onClick={deselectAllChains} className="btn btn-outline btn-sm">
              Deselect All
            </button>
          </div>
        </div>

        <div className="chains-grid-selection">
          {Object.entries(SUPPORTED_CHAINS).map(([chainId, chain]) => (
            <div
              key={chainId}
              className={`chain-selector ${selectedChains[chainId] ? 'selected' : ''}`}
              onClick={() => toggleChainSelection(chainId)}
            >
              <span className="chain-logo">{chain.logo}</span>
              <span className="chain-name">{chain.name}</span>
              <div className="checkbox">{selectedChains[chainId] && <div className="checkmark">✓</div>}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Scan Controls */}
      <div className="scan-controls">
        <button
          onClick={scanForDust}
          disabled={scanning || selectedChainCount === 0}
          className="scan-button"
        >
          {scanning ? (
            <>
              <div className="spinner"></div>
              Scanning {selectedChainCount} Chains...
            </>
          ) : (
            <>🔍 Scan {selectedChainCount} Selected Chains</>
          )}
        </button>
      </div>

      {/* Results */}
      {dustResults.length > 0 && (
        <div className="results-section">
          <div className="results-header">
            <h2>Dust Found: ${totalDustValue.toFixed(4)}</h2>
            {batchSavings && (
              <div className="savings-badge">
                🎯 Batch Claim will save ~{batchSavings.savingsPercentage}% in gas fees
              </div>
            )}
          </div>

          <div className="dust-results">
            {dustResults.map((r, idx) => (
              <div key={idx} className="chain-result-card">
                <div className="chain-result-header">
                  <div className="chain-info">
                   <ChainLogo
                   src={SUPPORTED_CHAINS[chain.chainId]?.logo}
                   alt={SUPPORTED_CHAINS[chain.chainId]?.name}
                   />
                    <div>
                      <h3>{r.chainName}</h3>
                      <p className="chain-value">${r.usdValue.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="dust-stats">
                    <span className="dust-count">
                      {r.tokenDust.length} token{r.tokenDust.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                <div className="dust-details">
                  <div className="native-dust">
                    <span className="dust-label">Native:</span>
                    <span className="dust-amount">
                      {parseFloat(r.nativeBalance).toFixed(6)} {r.symbol}
                    </span>
                  </div>

                  {r.tokenDust.slice(0, 5).map((t, i) => (
                    <div key={i} className="token-dust">
                      <span className="dust-label">{t.symbol}:</span>
                      <span className="dust-amount">{parseFloat(t.balance).toFixed(6)}</span>
                    </div>
                  ))}

                  {r.tokenDust.length > 5 && (
                    <div className="more-tokens">+{r.tokenDust.length - 5} more tokens</div>
                  )}
                </div>

                <div className="claim-indicator">🧹 {r.tokenDust.length} claimable tokens</div>
              </div>
            ))}
          </div>

          {/* Batch Claim Action */}
          <div className="claim-actions">
            <button onClick={handleBatchClaim} className="claim-button">
              🧹 Batch Claim All (${totalDustValue.toFixed(2)})
            </button>
            <p className="claim-note">
              Claim all dust across {dustResults.length} chains in optimized transactions
            </p>
          </div>
        </div>
      )}

      {/* Empty States */}
      {!scanning && dustResults.length === 0 && selectedChainCount > 0 && (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <h3>No Dust Found</h3>
          <p>We scanned {selectedChainCount} chains but didn't find any claimable dust.</p>
          <button onClick={scanForDust} className="btn btn-outline">
            Try Scanning Again
          </button>
        </div>
      )}

      {selectedChainCount === 0 && (
        <div className="empty-state">
          <div className="empty-icon">⚙️</div>
          <h3>No Chains Selected</h3>
          <p>Please select at least one blockchain to scan for dust.</p>
        </div>
      )}
    </div>
  )
}

export default DustScanner