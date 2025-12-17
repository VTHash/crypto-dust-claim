// src/pages/DustScanner.jsx (or wherever this lives)
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../contexts/WalletContext'
import { useScan } from '../contexts/ScanContext'
import { useSettings } from '../contexts/SettingsContext'
import web3Service from '../services/web3Service'
import batchService from '../services/batchService'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import { NATIVE_LOGOS } from '../services/logoService'
import TokenRow from '../components/TokenRow'
import './DustScanner.css'

// Force a human-readable decimal string so batchService ALWAYS uses parseUnits()
// - "12" -> "12.0"
// - "0" -> "0.0"
// - "1e-7" -> leave as-is (but we avoid producing this by not Number() converting balances)
// - "12.34" -> unchanged
function forceHumanDecimalString(v) {
  if (v === null || v === undefined) return '0.0'
  const s = String(v).trim()
  if (!s) return '0.0'
  if (s.includes('.')) return s
  // If somehow scientific notation appears, keep it (parseUnits won't accept it anyway)
  if (s.toLowerCase().includes('e')) return s
  return `${s}.0`
}

// Safe “> 0” check without BigInt parsing (balances are decimal strings)
function isPositiveBalanceStr(v) {
  const n = Number.parseFloat(String(v || '0'))
  return Number.isFinite(n) && n > 0
}

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

  // hydrate from last run ONLY if we don't already have results in context
  useEffect(() => {
    if (results.length > 0) return
    try {
      const cached = sessionStorage.getItem('dustclaim:lastScan')
      if (cached) {
        const { dustResults = [] } = JSON.parse(cached)
        if (dustResults.length > 0) setResults(dustResults)
      }
    } catch {
      // ignore
    }
  }, [results.length, setResults])

  const handleScan = async () => {
    if (!address) return
    setScanning(true)
    try {
      const scan = await web3Service.scanChains(selectedIds, address, settings)
      setResults(scan)

      const total = scan.reduce((s, x) => s + (x.totalValue || 0), 0)

      try {
        sessionStorage.setItem(
          'dustclaim:lastScan',
          JSON.stringify(
            { dustResults: scan, total },
            (_key, value) => (typeof value === 'bigint' ? value.toString() : value)
          )
        )
      } catch (err) {
        console.warn('Failed to store lastScan in sessionStorage:', err)
      }

      // stats reporting (unchanged)
      try {
        const usedChainIdsArray = Array.from(
          new Set(
            (scan || [])
              .map((chain) => Number(chain.chainId))
              .filter((id) => Number.isFinite(id) && id > 0)
          )
        )

        if (usedChainIdsArray.length > 0) {
          await fetch('/.netlify/functions/stats-scan-supabase', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chains: usedChainIdsArray })
          })
        }
      } catch (err) {
        console.error('stats-scan client-supabase error:', err)
      }
    } finally {
      setScanning(false)
    }
  }

  /**
   * Build the list of items to act on based on settings
   * IMPORTANT: keep balances as STRINGS (no Number() conversion)
   */
  const buildActionUniverse = useMemo(() => {
    const list = []
    for (const chain of results) {
      const chainId = chain.chainId
      const tokenList = chain.tokenDetails || []

      for (const t of tokenList) {
        const usd = Number(t.value || 0)
        const balanceStr = String(t.balance ?? '0')

        if (!isPositiveBalanceStr(balanceStr)) continue

        if (settings.includeNonDust) {
          list.push({
            chainId,
            symbol: t.symbol,
            address: t.address,
            balance: balanceStr, // keep as string
            decimals: t.decimals ?? 18,
            usd
          })
        } else {
          const min = Number(settings.tokenMinUSD || 0)
          const max =
            settings.tokenMaxUSD === 0 || settings.tokenMaxUSD === undefined
              ? Infinity
              : Number(settings.tokenMaxUSD)

          if (usd >= min && usd <= max) {
            list.push({
              chainId,
              symbol: t.symbol,
              address: t.address,
              balance: balanceStr, // keep as string
              decimals: t.decimals ?? 18,
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

  const totalClaimableCount = useMemo(() => buildActionUniverse.length, [buildActionUniverse])

  /**
   * Build claimPlan EXACTLY how claimExecutor expects:
   * claims[] -> batchService.buildClaimPlan() -> claimPlan[ { chainId, steps[] } ]
   *
   * Key fix: amount must be a human decimal string so batchService parses units.
   */
  const handleBatchClaim = async () => {
    if (!address) return

    const claims = buildActionUniverse.map((it) => ({
      chainId: it.chainId,
      tokenAddress: it.address,
      tokenSymbol: it.symbol,
      amount: forceHumanDecimalString(it.balance), // ✅ critical fix
      decimals: it.decimals ?? 18,
      recipient: address
    }))

    let claimPlan = []
    const batchTransactions = []
    const oneInchSingle = null
    const oneInchBatch = null
    const uniswapSingle = null
    const batchSavings = null

    try {
      if (typeof batchService.buildClaimPlan === 'function') {
        try {
          claimPlan = await batchService.buildClaimPlan(claims, {
            txOrigin: address,
            slippagePct: 1,
            outTokenByChain: settings.outTokenByChain
          })
        } catch (e) {
          console.warn('[DustScanner] buildClaimPlan failed:', e)
          claimPlan = []
        }
      }
    } finally {
      console.log('[DustScanner] ClaimPlan built:', claimPlan)
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

  const toggleChain = (id) => setSelectedChains((prev) => ({ ...prev, [id]: !prev[id] }))

  const fmt = (n) => Number(n || 0).toFixed(6)
  const usd = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n || 0))

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
            {scanning ? `Scanning ${selectedIds.length} Chains…` : `🔍 Scan ${selectedIds.length} Selected Chains`}
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
              const key = String(r.chainId)
              const chainActions = actionByChain[key] || { value: 0, count: 0 }

              return (
                <div key={r.chainId} className="chain-result-card">
                  <div className="chain-result-header">
                    <div className="chain-info">
                      <img className="chain-logo" src={nativeLogo} alt={meta.name} />
                      <div>
                        <h3>{r.chainName}</h3>
                        <p className="chain-value">{usd(chainActions.value || r.totalValue || 0)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="dust-details">
                    {/* Native */}
                    <div className="native-dust">
                      <span className="dust-label">Native:</span>
                      <span className="dust-amount">
                        {fmt(r.nativeBalance)} {r.symbol} {r.nativeValue ? `(${usd(r.nativeValue)})` : ''}
                      </span>
                      {parseFloat(r.nativeBalance) > 0 &&
                        parseFloat(r.nativeBalance) < Number(settings.nativeDustThreshold || 0.001) && (
                          <span className="dust-badge">dust</span>
                        )}
                    </div>

                    {/* Tokens with real logos */}
                    {(r.tokenDetails || []).slice(0, 5).map((t, i) => (
                      <TokenRow key={`${r.chainId}-${t.address}-${i}`} token={{ ...t, chainId: r.chainId }} />
                    ))}

                    {(r.tokenDetails?.length || 0) > 5 && (
                      <div className="more-tokens">+{r.tokenDetails.length - 5} more tokens</div>
                    )}
                  </div>

                  <div className="claim-indicator">🧹 {chainActions.count} selected by settings</div>
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
                  : 'Prepare a 0x swap plan and execute it on the Claim page'
              }
            >
              {settings.mode === 'swap-token'
                ? `💱 Swap & Claim (${usd(totalValue)})`
                : `🧹 Batch Claim All (${usd(totalValue)})`}
            </button>

            {buildActionUniverse.length === 0 && (
              <p className="claim-note">
                Nothing matched your current settings. Try enabling “Include non-dust” or widening the USD window in
                Settings.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default DustScanner