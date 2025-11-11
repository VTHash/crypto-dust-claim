import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../contexts/WalletContext'
import { useScan } from '../contexts/ScanContext'
import { useSettings } from '../contexts/SettingsContext'
import web3Service from '../services/web3Service'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import { NATIVE_LOGOS } from '../services/logoService'
import TokenRow from '../components/TokenRow'
import './Dashboard.css'

const fmt = (n) => Number(n || 0).toFixed(6)
const usd = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n || 0))

export default function Dashboard() {
  const { address } = useWallet()
  const navigate = useNavigate()
  const { results, setResults } = useScan()
  const { settings } = useSettings()

  const [loading, setLoading] = useState(false)
  const [priceLoading, setPriceLoading] = useState(false)

  // 1) Hydrate results from last scan if we have them
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem('dustclaim:lastScan')
      if (cached) {
        const { dustResults = [] } = JSON.parse(cached)
        if (dustResults.length) {
          setResults(dustResults)
        }
      }
    } catch {}
  }, [setResults])

  // 2) If wallet connects and no results, run a full scan (same as Scanner)
  useEffect(() => {
    if (address && results.length === 0) {
      rescanAllChains()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  async function rescanAllChains() {
    if (!address) return
    setLoading(true)
    setPriceLoading(true)
    try {
      const chainIds = Object.keys(SUPPORTED_CHAINS).map(Number)
      // ✅ pass current settings into the scan so claimableTokens matches the UI
      const scan = await web3Service.scanChains(chainIds, address, settings)

      setResults(scan)

      const total = scan.reduce((s, x) => s + (x.totalValue || 0), 0)
      sessionStorage.setItem('dustclaim:lastScan', JSON.stringify({ dustResults: scan, total }))
    } catch (e) {
      console.error('Dashboard scan error:', e)
      setResults([])
    } finally {
      setLoading(false)
      setPriceLoading(false)
    }
  }

  async function refreshPrices() {
    if (!address || results.length === 0) return
    setPriceLoading(true)
    try {
      const chainIds = results.map((r) => r.chainId)
      // ✅ re-run with settings so the claimable list stays consistent
      const scan = await web3Service.scanChains(chainIds, address, settings)
      setResults(scan)
      const total = scan.reduce((s, x) => s + (x.totalValue || 0), 0)
      sessionStorage.setItem('dustclaim:lastScan', JSON.stringify({ dustResults: scan, total }))
    } catch (e) {
      console.error('Price refresh error:', e)
    } finally {
      setPriceLoading(false)
    }
  }

  // 3) Build the "action universe" using the same rules as DustScanner.
  // Prefer chain.claimableTokens (new model). Fall back to tokenDetails + thresholds.
  const buildActionUniverse = useMemo(() => {
    const list = []

    for (const chain of results) {
      const chainId = chain.chainId

      const hasClaimableField = Array.isArray(chain.claimableTokens)
      const sourceTokens = hasClaimableField
        ? chain.claimableTokens
        : Array.isArray(chain.tokenDetails)
        ? chain.tokenDetails
        : []

      // If DustScanner / web3Service already pre-filtered into claimableTokens,
      // we just trust that and don’t re-apply thresholds.
      if (hasClaimableField) {
        for (const t of sourceTokens) {
          if (Number(t.balance || 0) <= 0) continue
          list.push({
            chainId,
            symbol: t.symbol,
            address: t.address,
            balance: t.balance,
            usd: Number(t.value || 0)
          })
        }
        continue
      }

      // Backwards-compatible path: use tokenDetails + settings thresholds
      for (const t of sourceTokens) {
        const usdValue = Number(t.value || 0)

        if (settings.includeNonDust) {
          if (Number(t.balance) > 0) {
            list.push({
              chainId,
              symbol: t.symbol,
              address: t.address,
              balance: t.balance,
              usd: usdValue
            })
          }
        } else {
          const min = Number(settings.tokenMinUSD || 0)
          const max = Number(
            settings.tokenMaxUSD == null || settings.tokenMaxUSD === 0
              ? Infinity
              : settings.tokenMaxUSD
          )
          if (usdValue >= min && usdValue <= max) {
            list.push({
              chainId,
              symbol: t.symbol,
              address: t.address,
              balance: t.balance,
              usd: usdValue
            })
          }
        }
      }
    }

    return list
  }, [results, settings.includeNonDust, settings.tokenMinUSD, settings.tokenMaxUSD])

  // 4) Aggregate by chain for the top cards and overview
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

  const totalDustValue = useMemo(
    () => Object.values(actionByChain).reduce((s, x) => s + x.value, 0),
    [actionByChain]
  )

  const totalTokens = useMemo(
    () => buildActionUniverse.length,
    [buildActionUniverse]
  )

  // ✅ Active chains = any chain with native balance OR claimable tokens
  const activeChains = useMemo(
    () =>
      results.filter((r) => {
        const key = String(r.chainId)
        const action = actionByChain[key]
        const hasNative = Number(r.nativeBalance || 0) > 0
        const hasTokens = action && action.count > 0
        return hasNative || hasTokens
      }).length,
    [results, actionByChain]
  )

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p>Real-time dust valuation across all chains</p>

        <div className="price-refresh">
          <button
            onClick={refreshPrices}
            disabled={priceLoading}
            className="btn btn-outline btn-sm"
          >
            {priceLoading ? '🔄 Updating…' : '🔄 Refresh Prices'}
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <h3>Total Claimable Dust</h3>
            <div className="stat-value">{usd(totalDustValue)}</div>
            <div className="stat-subtitle">
              Uses your current dust settings (
              {settings.includeNonDust ? 'swap everything' : 'USD window'}
              )
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🔗</div>
          <div className="stat-content">
            <h3>Active Chains</h3>
            <div className="stat-value">{activeChains}</div>
            <div className="stat-subtitle">With selected balances</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🧹</div>
          <div className="stat-content">
            <h3>Total Tokens</h3>
            <div className="stat-value">{totalTokens}</div>
            <div className="stat-subtitle">Tokens matching your settings</div>
          </div>
        </div>
      </div>

      <div className="actions-section">
        <button onClick={() => navigate('/scanner')} className="btn btn-primary btn-large">
          🔍 Advanced Dust Scanner
        </button>
        <button onClick={rescanAllChains} disabled={loading} className="btn btn-secondary">
          {loading ? '🔄 Scanning…' : '🔄 Rescan All Chains'}
        </button>
        <button onClick={refreshPrices} disabled={priceLoading} className="btn btn-outline">
          {priceLoading ? '📊 Updating…' : '📊 Refresh Prices'}
        </button>
      </div>

      <div className="chains-section">
        <h2>
          Chain Overview {priceLoading && <span className="loading-badge">Updating Prices…</span>}
        </h2>

        {results.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎉</div>
            <h3>No balances found yet</h3>
            <p>Connect your wallet and run a scan to see your multi-chain overview.</p>
            <button onClick={() => navigate('/scanner')} className="btn btn-primary">
              Run Advanced Scan
            </button>
          </div>
        ) : (
          <div className="chains-grid">
            {results.map((r) => {
              const meta = SUPPORTED_CHAINS[r.chainId] || {}
              const nativeLogo = meta.logo || NATIVE_LOGOS[r.chainId] || '/logos/chains/generic.png'
              const action = actionByChain[String(r.chainId)] || { value: 0, count: 0 }

              // ✅ Show a card for every chain, even if no tokens are selected
              const chainTotalUsd =
                action.value || r.totalValue || r.nativeValue || 0

              return (
                <div key={r.chainId} className={`chain-card ${action.count ? 'has-dust' : ''}`}>
                  <div className="chain-header">
                    <div className="chain-info">
                      <img className="chain-logo" src={nativeLogo} alt={meta.name} />
                      <div>
                        <h3>{meta.name}</h3>
                        <p className="chain-value">{usd(chainTotalUsd)}</p>
                      </div>
                    </div>
                    <div className="chain-balance">
                      <div className="native-balance">
                        {fmt(r.nativeBalance)} {meta.symbol}
                      </div>
                      <div className="token-count">
                        {action.count} tokens matching settings
                      </div>
                    </div>
                  </div>

                  <div className="price-details">
                    <div className="price-item">
                      <span>Native:</span>
                      <span>
                        {fmt(r.nativeBalance)} {meta.symbol}{' '}
                        {r.nativeValue ? `(${usd(r.nativeValue)})` : ''}
                      </span>
                    </div>

                    {(r.tokenDetails || []).slice(0, 3).map((t, i) => (
                      <TokenRow key={`${t.address}-${i}`} token={t} />
                    ))}

                    {(r.tokenDetails?.length || 0) > 3 && (
                      <div className="price-item more">
                        <span>+{r.tokenDetails.length - 3} more tokens</span>
                      </div>
                    )}
                  </div>

                  <div className="dust-indicator">
                    🧹 {action.count} tokens matching settings
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
