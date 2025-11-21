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
    Object.keys(SUPPORTED_CHAINS).reduce((acc, id) => {
      acc[id] = true
      return acc
    }, {})
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
    if (address && results.length === 0) {
      handleScan()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, settings])

  const handleScan = async () => {
    if (!address) return
    setScanning(true)
    try {
      // Pass settings as optional 3rd arg (web3Service can ignore it or use it)
      const scan = await web3Service.scanChains(selectedIds, address, settings)
      setResults(scan)

      const total = scan.reduce((s, x) => s + (x.totalValue || 0), 0)
      sessionStorage.setItem('dustclaim:lastScan', JSON.stringify({ dustResults: scan, total }))

      // --- NEW: report scan statistics to Netlify (global stats / top chains) ---
      try {
        const usedChainIdsArray = selectedIds
            .map((c) => Number(c.chainId))
            .filter((id) => Number.isFinite(id) && id > 0)
      
        if (usedChainIdsArray.length > 0) {
          await fetch('/.netlify/functions/stats-scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chains: usedChainIdsArray,
            }),
          }).catch(() => {})
        }
      } catch {
        // stats reporting should never break the scanner
      }
      // --- END NEW PART ---
    } finally {
      setScanning(false)
    }
  }

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
        const balance = Number(t.balance || 0)

        if (balance <= 0) continue

        if (settings.includeNonDust) {
          list.push({
            chainId,
            symbol: t.symbol,
            address: t.address,
            balance: t.balance,
            usd
          })
        } else {
          const min = Number(settings.tokenMinUSD || 0)
          const max = Number(
            settings.tokenMaxUSD === 0 || settings.tokenMaxUSD === undefined
              ? Infinity
              : settings.tokenMaxUSD
          )
          if (usd >= min && usd <= max) {
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
   * Aggregate action universe by chain so UI counts & totals reflect settings.
   */
  const actionByChain = useMemo(() => {
    const m = {}
    for (const item of buildActionUniverse) {
      const key = String(item.chainId)
      if (!m[key]) m[key] = { value: 0, count: 0 }
      m[key].value += Number(item.usd || 0)
      m[key].count += 1
    }
    return m
  }, [buildActionUniverse])

  const totalValue = useMemo(
    () => Object.values(actionByChain).reduce((s, x) => s + x.value, 0),
    [actionByChain]
  )

  const totalClaimableCount = useMemo(
    () => buildActionUniverse.length,
    [buildActionUniverse]
  )

  /**
   * Fully wired batch-claim navigator
   * - If settings.mode === 'contract-native': try your legacy plan creator first; else fallback
   * - If settings.mode === 'swap-token': create 1inch / Uniswap helpers (best single + batch)
   */
  const handleBatchClaim = async () => {
    // 1) Base claims for contract-native path or legacy fallback
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
        // Optimized plan first
        try {
          if (typeof batchService.buildClaimPlan === 'function') {
            claimPlan = await batchService.buildClaimPlan(claims)
          }
        } catch {}

        // Fallback simple tx batch
        if (!claimPlan?.length && typeof batchService.createBatchDustClaim === 'function') {
          batchTransactions = await batchService.createBatchDustClaim(claims, address)
        }

        // Optional gas savings estimate
        try {
          if (
            Array.isArray(batchTransactions) &&
            batchTransactions.length &&
            typeof batchService.calculateGasSavings === 'function'
          ) {
            const indiv = claims.map((c) => ({ to: c.tokenAddress, data: '0x' }))
            batchSavings = batchService.calculateGasSavings(indiv, batchTransactions)
          }
        } catch {}
      } else if (settings.mode === 'swap-token') {
        // Helpers for aggregator-based swaps
        const byValueDesc = [...buildActionUniverse].sort(
          (a, b) => Number(b.usd) - Number(a.usd)
        )
        const best = byValueDesc[0] || null

        // Single best token (1inch)
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
                calldata: q1.calldata
              }
            }
          } catch {}
        }

        // Batch 1inch (all items)
        try {
          const items = buildActionUniverse.map((it) => ({
            chainId: Number(it.chainId),
            token: it.address,
            amount: it.balance
          }))
          const qb = await dexAggregatorService.quoteOneInchBatch(items, 100)
          if (qb?.tokens?.length) {
            oneInchBatch = {
              tokens: qb.tokens,
              minOutsWei: qb.minOutsWei,
              datas: qb.datas
            }
          }
        } catch {}

        // Optional Uniswap single helper
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
                minOutWei: qu.minOutWei,
                ttlSec: qu.ttlSec ?? 900
              }
            }
          } catch {}
        }

        // Leave claimPlan/batchTransactions empty so ClaimScreen uses quick actions only.
        claimPlan = []
        batchTransactions = []
      }
    } finally {
      navigate('/claim', {
        state: {
          claimPlan,
          batchTransactions,
          oneInchSingle,
          oneInchBatch,
          uniswapSingle,
          dustResults: results,
          totalDustValue: totalValue,
          batchSavings
        }
      })
    }
  }

  const toggleChain = (id) =>
    setSelectedChains((prev) => ({ ...prev, [id]: !prev[id] }))

  const fmt = (n) => Number(n || 0).toFixed(6)
  const usd = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      Number(n || 0)
    )

  return (
    <div className="dust-scanner">
      <div className="scanner-header">
        <h1>Multi-Chain Dust Scanner</h1>
        <p>Scan across 20+ blockchains for claimable tokens & dust</p>
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
                <div className="checkbox">
                  {selectedChains[id] && <div className="checkmark">✓</div>}
                </div>
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
              const nativeLogo =
                meta.logo || NATIVE_LOGOS[r.chainId] || '/logos/chains/generic.png'
              const key = String(r.chainId)
              const chainActions = actionByChain[key] || { value: 0, count: 0 }

              return (
                <div key={r.chainId} className="chain-result-card">
                  <div className="chain-result-header">
                    <div className="chain-info">
                      <img className="chain-logo" src={nativeLogo} alt={meta.name} />
                      <div>
                        <h3>{r.chainName}</h3>
                        <p className="chain-value">
                          {usd(
                            chainActions.value || r.totalValue || 0
                          )}
                        </p>
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
                        parseFloat(r.nativeBalance) <
                          Number(settings.nativeDustThreshold || 0.001) && (
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
                    🧹 {chainActions.count} selected by settings
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
                  ? 'Prepare 1inch/Uniswap helpers to swap selected tokens into your chosen target token'
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