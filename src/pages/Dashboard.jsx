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
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    Number(n || 0)
  )

export default function Dashboard() {
  const { address } = useWallet()
  const navigate = useNavigate()
  const { results, setResults } = useScan()
  const { settings } = useSettings()

  const [loading, setLoading] = useState(false)
  const [priceLoading, setPriceLoading] = useState(false)

  // ---------------------------------------------------------------------------
  // 1) Hydrate results from last scan if we have them
  // ---------------------------------------------------------------------------
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem('dustclaim:lastScan')
      if (cached) {
        const { dustResults = [] } = JSON.parse(cached)
        if (dustResults.length) {
          setResults(dustResults)
        }
      }
    } catch {
      // ignore cache errors
    }
  }, [setResults])

  // ---------------------------------------------------------------------------
  // 2) Auto-scan when wallet connects and no results yet
  // ---------------------------------------------------------------------------
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

      // pass current settings so claimableTokens matches UI
      const scan = await web3Service.scanChains(chainIds, address, settings)
      setResults(scan)

      const total = scan.reduce((s, x) => s + (x.totalValue || 0), 0)

      sessionStorage.setItem(
        'dustclaim:lastScan',
        JSON.stringify(
          { dustResults: scan, total },
          (_key, value) => (typeof value === 'bigint' ? value.toString() : value)
        )
      )
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

      const scan = await web3Service.scanChains(chainIds, address, settings)
      setResults(scan)

      const total = scan.reduce((s, x) => s + (x.totalValue || 0), 0)

      sessionStorage.setItem(
        'dustclaim:lastScan',
        JSON.stringify(
          { dustResults: scan, total },
          (_key, value) => (typeof value === 'bigint' ? value.toString() : value)
        )
      )
    } catch (e) {
      console.error('Price refresh error:', e)
    } finally {
      setPriceLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // 3) Build "action universe" = tokens matching dust settings (for dust stats)
  // ---------------------------------------------------------------------------
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

      // Backwards-compatible path: tokenDetails + settings thresholds
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

  // ---------------------------------------------------------------------------
  // 4) Aggregate dust by chain
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // 5) NEW: full portfolio value across all chains
  // (native + ALL tokens with USD prices)
  // ---------------------------------------------------------------------------
  const portfolioTotalUsd = useMemo(() => {
    return results.reduce((sum, chain) => {
      const nativeUsd = Number(chain.nativeValue || 0)

      const tokensUsd = (chain.tokenDetails || []).reduce(
        (s, t) => s + Number(t.value || 0),
        0
      )

      return sum + nativeUsd + tokensUsd
    }, 0)
  }, [results])

  return (
    <div className="dashboard">
      {/* Header / hero */}
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p>Wallet-style overview of your dust and multi-chain balance.</p>

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

      {/* Top stats (wallet-like overview) */}
      <div className="stats-grid">
        {/* Portfolio total across all chains */}
        <div className="stat-card primary">
          <div className="stat-icon">👛</div>
          <div className="stat-content">
            <h3>Total Portfolio Value</h3>
            <div className="stat-value">{usd(portfolioTotalUsd)}</div>
            <div className="stat-subtitle">
              Native + tokens across every supported chain
            </div>
          </div>
        </div>

        {/* Dust only (based on settings) */}
        <div className="stat-card">
          <div className="stat-icon">🧹</div>
          <div className="stat-content">
            <h3>Total Claimable Dust</h3>
            <div className="stat-value">{usd(totalDustValue)}</div>
            <div className="stat-subtitle">
              Using your current dust settings (
              {settings.includeNonDust ? 'swap everything' : 'USD window'}
              )
            </div>
          </div>
        </div>

        {/* Chains / tokens */}
        <div className="stat-card">
          <div className="stat-icon">🔗</div>
          <div className="stat-content">
            <h3>Active Chains</h3>
            <div className="stat-value">{activeChains}</div>
            <div className="stat-subtitle">
              {totalTokens} tokens matching your dust settings
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="actions-section">
        <button
          onClick={() => navigate('/scanner')}
          className="btn btn-primary btn-large"
        >
          🔍 Advanced Dust Scanner
        </button>
        <button
          onClick={rescanAllChains}
          disabled={loading}
          className="btn btn-secondary"
        >
          {loading ? '🔄 Scanning…' : '🔄 Rescan All Chains'}
        </button>
        <button
          onClick={refreshPrices}
          disabled={priceLoading}
          className="btn btn-outline"
        >
          {priceLoading ? '📊 Updating…' : '📊 Refresh Prices'}
        </button>
      </div>

      {/* Chain cards */}
      <div className="chains-section">
        <h2>
          Chain Overview{' '}
          {priceLoading && (
            <span className="loading-badge">Updating Prices…</span>
          )}
        </h2>

        {results.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🎉</div>
            <h3>No balances found yet</h3>
            <p>
              Connect your wallet and run a scan to see your multi-chain
              overview.
            </p>
            <button
              onClick={() => navigate('/scanner')}
              className="btn btn-primary"
            >
              Run Advanced Scan
            </button>
          </div>
        ) : (
          <div className="chains-grid">
            {results.map((r) => {
              const meta = SUPPORTED_CHAINS[r.chainId] || {}
              const nativeLogo =
                meta.logo || NATIVE_LOGOS[r.chainId] || '/logos/chains/generic.png'
              const action = actionByChain[String(r.chainId)] || {
                value: 0,
                count: 0
              }

              // Full chain portfolio value (native + all tokens with prices)
              const nativeUsd = Number(r.nativeValue || 0)
              const tokensUsd = (r.tokenDetails || []).reduce(
                (s, t) => s + Number(t.value || 0),
                0
              )
              const chainPortfolioUsd = nativeUsd + tokensUsd

              return (
                <div
                  key={r.chainId}
                  className={`chain-card ${action.count ? 'has-dust' : ''}`}
                >
                  <div className="chain-header">
                    <div className="chain-info">
                      <img
                        className="chain-logo"
                        src={nativeLogo}
                        alt={meta.name}
                      />
                      <div>
                        <h3>{meta.name}</h3>
                        <p className="chain-value">
                          {usd(chainPortfolioUsd)}
                        </p>
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

                    {(r.tokenDetails || []).map((t, i) => (
  <TokenRow
    key={`${r.chainId}-${t.address}-${i}`}
    token={{ ...t, chainId: r.chainId }}
  />
))}
                  </div>

                  <div className="dust-indicator">
                    🧹 {action.count} tokens matching dust settings •{' '}
                    {usd(action.value)}
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
