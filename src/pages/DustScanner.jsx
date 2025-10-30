// src/pages/DustScanner.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../contexts/WalletContext'
import { useScan } from '../contexts/ScanContext'
import { useSettings } from '../contexts/SettingsContext'
import web3Service from '../services/web3Service'
import batchService from '../services/batchService'
import dexAggregatorService from '../services/dexAggregatorService'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import { NATIVE_LOGOS } from '../services/logoService'
import TokenRow from '../components/TokenRow'
import './DustScanner.css'

const DustScanner = () => {
  const { address } = useWallet()
  const navigate = useNavigate()
  const { results, setResults } = useScan()
  const { settings } = useSettings()

  const [scanning, setScanning] = useState(false)
  const [selectedChains, setSelectedChains] = useState(
    Object.keys(SUPPORTED_CHAINS).reduce((acc, id) => ((acc[id] = true), acc), {})
  )

  const selectedIds = useMemo(
    () => Object.keys(selectedChains).filter((id) => selectedChains[id]).map(Number),
    [selectedChains]
  )

  // hydrate from last run for immediate Dashboard/Scanner parity
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem('dustclaim:lastScan')
      if (cached) {
        const { dustResults = [] } = JSON.parse(cached)
        if (dustResults.length > 0) setResults(dustResults)
      }
    } catch {}
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // auto scan when address arrives and nothing loaded
  useEffect(() => {
    if (address && results.length === 0) handleScan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  const handleScan = async () => {
    if (!address) return
    setScanning(true)
    try {
      const scan = await web3Service.scanChains(selectedIds, address)
      setResults(scan)

      const total = scan.reduce((s, x) => s + (x.totalValue || 0), 0)
      sessionStorage.setItem('dustclaim:lastScan', JSON.stringify({ dustResults: scan, total }))
    } finally {
      setScanning(false)
    }
  }

  const totalValue = useMemo(
    () => results.reduce((s, r) => s + (r.totalValue || 0), 0),
    [results]
  )

  const totalClaimableCount = useMemo(
    () => results.reduce((s, r) => s + (r.claimableTokens?.length || 0), 0),
    [results]
  )

  /**
   * Build the list of items to act on based on settings:
   * - includeNonDust: include all tokens (not just "dust")
   * - tokenMinUSD/tokenMaxUSD: USD filter window for "dust" when includeNonDust=false
   */
  const buildActionUniverse = useMemo(() => {
    const list = []
    for (const chain of results) {
      const chainId = chain.chainId
      const tokenList = chain.tokenDetails || []

      for (const t of tokenList) {
        const usd = Number(t.value || 0)

        if (settings.includeNonDust) {
          // include everything non-zero
          if (Number(t.balance) > 0) {
            list.push({
              chainId,
              symbol: t.symbol,
              address: t.address,
              balance: t.balance,
              usd
            })
          }
        } else {
          // enforce dust window
          if (usd >= Number(settings.tokenMinUSD || 0) &&
              usd <= Number(settings.tokenMaxUSD || Infinity)) {
            list.push({
              chainId,
              symbol: t.symbol,
              address: t.address,
              balance: t.balance,
              usd
            })
          }
        }
      }
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, settings.includeNonDust, settings.tokenMinUSD, settings.tokenMaxUSD])

  /**
   * Fully wired batch-claim navigator
   * - If settings.mode === 'contract-native': try your legacy plan creator first; else fallback
   * - If settings.mode === 'swap-token': create 1inch batch quotes per chain (tokens → wrapped-native),
   * and also provide a "single best" helper for UX. We pass these to ClaimScreen.
   */
  const handleBatchClaim = async () => {
    // 1) Build base claims (for "contract-native" path or legacy fallback)
    const claims = buildActionUniverse.map((it) => ({
      chainId: it.chainId,
      tokenAddress: it.address,
      tokenSymbol: it.symbol,
      amount: it.balance,
      recipient: address
    }))

    let claimPlan = []
    let batchTransactions = []
    let oneInchSingle = null
    let oneInchBatch = null
    let uniswapSingle = null
    let batchSavings = null

    try {
      if (settings.mode === 'contract-native') {
        // A) Try optimized plan first
        try {
          if (typeof batchService.buildClaimPlan === 'function') {
            claimPlan = await batchService.buildClaimPlan(claims)
          }
        } catch {}
        // B) Fallback: create simple per-token txs
        if (!claimPlan?.length && typeof batchService.createBatchDustClaim === 'function') {
          batchTransactions = await batchService.createBatchDustClaim(claims, address)
        }
        // Optionally compute savings (safe to leave null if your impl is partial)
        try {
          if (Array.isArray(batchTransactions) && batchTransactions.length &&
              typeof batchService.calculateGasSavings === 'function') {
            const indiv = claims.map(c => ({ to: c.tokenAddress, data: '0x' })) // heuristic
            batchSavings = batchService.calculateGasSavings(indiv, batchTransactions)
          }
        } catch {}
      } else if (settings.mode === 'swap-token') {
        // Build 1inch helpers:
        // - "Single best" (highest USD) to give the user a simple action
        // - "Batch" list across all selected tokens
        const byValueDesc = [...buildActionUniverse].sort((a, b) => Number(b.usd) - Number(a.usd))
        const best = byValueDesc[0] || null

        // 1) Single (if we have a best token)
        if (best) {
          try {
            const q1 = await dexAggregatorService.quoteOneInchSingle({
              chainId: Number(best.chainId),
              tokenIn: best.address,
              amount: best.balance,
              slippageBps: 100 // 1%
            })
            if (q1?.quotedMinOutWei) {
              oneInchSingle = {
                token: best.address,
                quotedMinOutWei: q1.quotedMinOutWei,
                calldata: q1.calldata // null on purpose (backendless)
              }
            }
          } catch {}
        }

        // 2) Batch (group all items, but 1inch expects a flat list — our service handles loops)
        try {
          const items = buildActionUniverse.map((it) => ({
            chainId: Number(it.chainId),
            token: it.address,
            amount: it.balance
          }))
          const qb = await dexAggregatorService.quoteOneInchBatch(items, 100) // 1%
          if (qb?.tokens?.length) {
            oneInchBatch = {
              tokens: qb.tokens,
              minOutsWei: qb.minOutsWei,
              datas: qb.datas // '0x' placeholders as discussed
            }
          }
        } catch {}

        // 3) Optional: Uniswap single helper (same "best" token)
        if (best) {
          try {
            const qu = await dexAggregatorService.quoteUniswapSingle({
              chainId: Number(best.chainId),
              tokenIn: best.address,
              amount: best.balance,
              fee: 3000,
              ttlSec: 900
            })
            if (qu) {
              uniswapSingle = {
                token: best.address,
                fee: qu.fee ?? 3000,
                minOutWei: qu.minOutWei, // '0' sentinel (no slippage protection in-browser)
                ttlSec: qu.ttlSec ?? 900
              }
            }
          } catch {}
        }

        // Keep claimPlan/batchTransactions empty so ClaimScreen uses quick-action path
        claimPlan = []
        batchTransactions = []
      }
    } finally {
      navigate('/claim', {
        state: {
          claimPlan,
          batchTransactions,
          // quick action payloads (available only in swap-token mode or when you choose to provide them)
          oneInchSingle,
          oneInchBatch,
          uniswapSingle,
          // context for UI
          dustResults: results,
          totalDustValue: totalValue,
          batchSavings
        }
      })
    }
  }

  const toggleChain = (id) => setSelectedChains((prev) => ({ ...prev, [id]: !prev[id] }))

  const fmt = (n) => Number(n || 0).toFixed(6)
  const usd = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n || 0))

  return (
    <div className="dust-scanner">
      <div className="scanner-header">
        <h1>Multi-Chain Dust Scanner</h1>
        <p>Scan across 15+ blockchains for claimable tokens & dust</p>
      </div>

      {/* Chain selection */}
      <div className="chain-selection-card">
        <div className="chains-grid-selection">
          {Object.entries(SUPPORTED_CHAINS).map(([id, chain]) => {
            const nativeLogo = chain.logo || NATIVE_LOGOS[id] || '/logos/chains/generic.png'
            return (
              <div
                key={id}
                className={`chain-selector ${selectedChains[id] ? 'selected' : ''}`}
                onClick={() => toggleChain(id)}
              >
                <img className="chain-logo" src={nativeLogo} alt={chain.name} />
                <span className="chain-name">{chain.name}</span>
                <div className="checkbox">{selectedChains[id] && <div className="checkmark">✓</div>}</div>
              </div>
            )
          })}
        </div>

        <div className="scan-controls">
          <button
            className="scan-button"
            disabled={scanning || selectedIds.length === 0}
            onClick={handleScan}
          >
            {scanning
              ? `Scanning ${selectedIds.length} Chains…`
              : `🔍 Scan ${selectedIds.length} Selected Chains`}
          </button>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="results-section">
          <div className="results-header">
            <h2>Dust Found: {usd(totalValue)}</h2>
            <div className="savings-badge">🧹 {totalClaimableCount} claimable tokens</div>
          </div>

          <div className="dust-results">
            {results.map((r) => {
              const meta = SUPPORTED_CHAINS[r.chainId] || {}
              const nativeLogo = meta.logo || NATIVE_LOGOS[r.chainId] || '/logos/chains/generic.png'
              return (
                <div key={r.chainId} className="chain-result-card">
                  <div className="chain-result-header">
                    <div className="chain-info">
                      <img className="chain-logo" src={nativeLogo} alt={meta.name} />
                      <div>
                        <h3>{r.chainName}</h3>
                        <p className="chain-value">{usd(r.totalValue)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="dust-details">
                    {/* Native */}
                    <div className="native-dust">
                      <span className="dust-label">Native:</span>
                      <span className="dust-amount">
                        {fmt(r.nativeBalance)} {r.symbol}{' '}
                        {r.nativeValue ? `(${usd(r.nativeValue)})` : ''}
                      </span>
                      {parseFloat(r.nativeBalance) > 0 &&
                        parseFloat(r.nativeBalance) < 0.001 && (
                          <span className="dust-badge">dust</span>
                        )}
                    </div>

                    {/* Tokens with real logos */}
                    {(r.tokenDetails || []).slice(0, 5).map((t, i) => (
                      <TokenRow key={`${r.chainId}-${t.address}-${i}`} token={t} />
                    ))}

                    {(r.tokenDetails?.length || 0) > 5 && (
                      <div className="more-tokens">
                        +{r.tokenDetails.length - 5} more tokens
                      </div>
                    )}
                  </div>

                  <div className="claim-indicator">
                    🧹 {r.claimableTokens?.length || 0} claimable
                  </div>
                </div>
              )
            })}
          </div>

          <div className="claim-actions">
            <button
              onClick={handleBatchClaim}
              className="claim-button"
              disabled={buildActionUniverse.length === 0}
              title={
                buildActionUniverse.length === 0
                  ? 'Nothing to claim/swap given your current settings'
                  : settings.mode === 'swap-token'
                  ? 'Prepare 1inch/Uniswap helpers to swap selected tokens into your chosen stable/asset'
                  : 'Prepare batch claim transactions'
              }
            >
              {settings.mode === 'swap-token'
                ? `💱 Swap & Claim (${usd(totalValue)})`
                : `🧹 Batch Claim All (${usd(totalValue)})`}
            </button>
            {buildActionUniverse.length === 0 && (
              <p className="claim-note">
                Nothing matched your current settings. Try enabling “Include non-dust” or widening
                the USD window in Settings.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default DustScanner