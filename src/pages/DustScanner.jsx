// src/pages/DustScanner.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../contexts/WalletContext'
import { useScan } from '../contexts/ScanContext'
import { useSettings } from '../contexts/SettingsContext'
import web3Service from '../services/web3Service'
import batchService from '../services/batchService'
// NOTE: dexAggregatorService imported previously but not used here; remove to avoid dead imports.
// import dexAggregatorService from '../services/dexAggregatorService'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import { NATIVE_LOGOS } from '../services/logoService'
import TokenRow from '../components/TokenRow'
import TxStepsPanel from '../components/TxStepsPanel.jsx'
import './DustScanner.css'

export default function DustScanner() {
  const { address } = useWallet()
  const navigate = useNavigate()
  const { results, setResults } = useScan()
  const { settings } = useSettings()

  const [scanning, setScanning] = useState(false)
  const [buildingPlan, setBuildingPlan] = useState(false)
  const [planError, setPlanError] = useState(null)

  const [selectedChains, setSelectedChains] = useState(() =>
    Object.keys(SUPPORTED_CHAINS).reduce((acc, id) => {
      acc[id] = true
      return acc
    }, {})
  )

  const selectedIds = useMemo(
    () => Object.keys(selectedChains).filter((id) => selectedChains[id]).map(Number),
    [selectedChains]
  )

  const isProbablyMobile = useMemo(() => {
    if (typeof navigator === 'undefined') return false
    const ua = (navigator.userAgent || '').toLowerCase()
    if (/android|iphone|ipad|ipod|iemobile|windows phone|mobile/.test(ua)) return true
    if (/metamaskmobile/.test(ua)) return true
    return false
  }, [])

  // Hydrate from last run ONLY if we don't already have results in context
  useEffect(() => {
    if (results.length > 0) return
    try {
      const cached = sessionStorage.getItem('dustclaim:lastScan')
      if (!cached) return
      const { dustResults = [] } = JSON.parse(cached)
      if (Array.isArray(dustResults) && dustResults.length > 0) setResults(dustResults)
    } catch {
      // ignore
    }
  }, [results.length, setResults])

  const handleScan = async () => {
    if (!address) return
    setScanning(true)
    setPlanError(null)

    try {
      const scan = await web3Service.scanChains(selectedIds, address, settings)

      // Normalize output to an array no matter what scanChains returns
      const dustResults = Array.isArray(scan)
        ? scan
        : Array.isArray(scan?.dustResults)
          ? scan.dustResults
          : Array.isArray(scan?.results)
            ? scan.results
            : []

      setResults(dustResults)

      const total = dustResults.reduce((s, x) => s + (Number(x.totalValue) || 0), 0)

      // Cache
      try {
        sessionStorage.setItem(
          'dustclaim:lastScan',
          JSON.stringify(
            { dustResults, total },
            (_key, value) => (typeof value === 'bigint' ? value.toString() : value)
          )
        )
      } catch (err) {
        console.warn('Failed to store lastScan in sessionStorage:', err)
      }

      // Stats
      try {
        const usedChainIdsArray = Array.from(
          new Set(
            dustResults
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
    } catch (err) {
      console.error('[DustScanner] Scan failed:', err)
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
    for (const chain of results || []) {
      const chainId = chain.chainId
      const tokenList = chain.tokenDetails || []

      for (const t of tokenList) {
        const usdValue = Number(t.value || 0)
        const balanceNum = Number(t.balance || 0)

        if (balanceNum <= 0) continue

        // Require an ERC20 address for claim/swap actions
        // (If your scanner uses a special placeholder for native, it should not be here)
        if (!t.address) continue

        if (settings.includeNonDust) {
          list.push({
            chainId,
            symbol: t.symbol,
            address: t.address,
            balance: t.balance,
            decimals: t.decimals ?? 18,
            usd: usdValue
          })
        } else {
          const min = Number(settings.tokenMinUSD || 0)
          const max =
            settings.tokenMaxUSD === 0 || settings.tokenMaxUSD === undefined
              ? Infinity
              : Number(settings.tokenMaxUSD)

          if (usdValue >= min && usdValue <= max) {
            list.push({
              chainId,
              symbol: t.symbol,
              address: t.address,
              balance: t.balance,
              decimals: t.decimals ?? 18,
              usd: usdValue
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
   * Build a claimPlan via batchService.buildClaimPlan and navigate to /claim.
   *
   * CRITICAL RULE:
   * - Do NOT navigate if claimPlan is empty. This is what caused "No swap plan available".
   *
   * Also:
   * - Persist claim plan to sessionStorage for mobile browser refresh / router-state loss.
   */
  const handleBatchClaim = async () => {
    if (!address) return

    setBuildingPlan(true)
    setPlanError(null)

    try {
      const claims = buildActionUniverse.map((it) => ({
        chainId: it.chainId,
        tokenAddress: it.address,
        tokenSymbol: it.symbol,
        amount: it.balance,
        decimals: it.decimals ?? 18,
        recipient: address
      }))

      if (claims.length === 0) {
        setPlanError('Nothing to claim with your current filters. Try widening the USD window in Settings.')
        return
      }

      if (typeof batchService.buildClaimPlan !== 'function') {
        setPlanError('buildClaimPlan() is not available. Check services/batchService export.')
        return
      }

      // IMPORTANT: pass both txOrigin AND recipient for compatibility with your 0x quote function + DustClaimV3 flow
      const claimPlan = await batchService.buildClaimPlan(claims, {
        txOrigin: address,
        recipient: address,
        slippagePct: 1,
        outTokenByChain: settings.outTokenByChain
      })

      if (!Array.isArray(claimPlan) || claimPlan.length === 0) {
        setPlanError(
          'No swap routes were returned.\n\nThis usually means:\n' +
            '• Amounts are too small for 0x\n' +
            '• Output token selection is invalid for a chain\n' +
            '• Some chains have no swappable ERC20s under your settings\n\n' +
            'Try increasing the USD minimum, or change output token in Settings.'
        )
        return
      }

      // Persist claim state so ClaimScreen works even if router state is lost (mobile refresh)
      try {
        sessionStorage.setItem(
          'dustclaim:lastClaimPlan',
          JSON.stringify(claimPlan, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
        )
        sessionStorage.setItem('dustclaim:lastDevice', isProbablyMobile ? 'mobile' : 'desktop')
      } catch (err) {
        console.warn('Failed to store lastClaimPlan in sessionStorage:', err)
      }

      navigate('/claim', {
        state: {
          claimPlan,
          dustResults: results,
          totalDustValue: totalValue,
          device: isProbablyMobile ? 'mobile' : 'desktop'
        }
      })
    } catch (e) {
      console.warn('[DustScanner] buildClaimPlan failed:', e)
      setPlanError(e?.message || 'Failed to build claim plan.')
    } finally {
      setBuildingPlan(false)
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
          <button className="scan-button" disabled={scanning || selectedIds.length === 0} onClick={handleScan}>
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

                    {/* Tokens */}
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
              disabled={buildingPlan || buildActionUniverse.length === 0}
              title={
                buildActionUniverse.length === 0
                  ? 'Nothing to claim/swap given your current settings'
                  : 'Build a 0x swap plan and open the Claim page'
              }
            >
              {buildingPlan
                ? '⏳ Building Swap Plan…'
                : settings.mode === 'swap-token'
                  ? `💱 Swap & Claim (${usd(totalValue)})`
                  : `🧹 Batch Claim All (${usd(totalValue)})`}
            </button>

            {planError && (
              <p className="claim-note" style={{ whiteSpace: 'pre-line' }}>
                {planError}
              </p>
            )}

            {buildActionUniverse.length === 0 && !planError && (
              <p className="claim-note">
                Nothing matched your current settings. Try enabling “Include non-dust” or widening the USD window in
                Settings.
              </p>
            )}

            <div style={{ marginTop: 16 }}>
              <TxStepsPanel />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
