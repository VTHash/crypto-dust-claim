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

  // network filter UI
  const [filterChainId, setFilterChainId] = useState('all')
  const [menuOpen, setMenuOpen] = useState(false)

  // -------------------------
  // 1) Hydrate last scan
  // -------------------------
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
      // ignore
    }
  }, [setResults])

  // -------------------------
  // 2) Auto-scan on connect
  // -------------------------
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

  // -------------------------
  // 3) Build action universe
  // -------------------------
  const actionUniverse = useMemo(() => {
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

      // fallback path based on settings thresholds
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

  // -------------------------
  // 4) Aggregate by chain
  // -------------------------
  const actionByChain = useMemo(() => {
    const m = {}
    for (const item of actionUniverse) {
      const key = String(item.chainId)
      if (!m[key]) m[key] = { value: 0, count: 0 }
      m[key].value += Number(item.usd || 0)
      m[key].count += 1
    }
    return m
  }, [actionUniverse])

  const totalDustValue = useMemo(
    () => Object.values(actionByChain).reduce((s, x) => s + x.value, 0),
    [actionByChain]
  )

  const totalTokens = useMemo(() => actionUniverse.length, [actionUniverse])

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

  // -------------------------
  // 5) Network list for dropdown
  // -------------------------
  const chainSummaries = useMemo(
    () =>
      results.map((r) => {
        const meta = SUPPORTED_CHAINS[r.chainId] || {}
        const action = actionByChain[String(r.chainId)] || { value: 0, count: 0 }

        const total =
          action.value || r.totalValue || r.nativeValue || 0

        return {
          chainId: r.chainId,
          name: meta.name || `Chain ${r.chainId}`,
          symbol: meta.symbol || '',
          logo:
            meta.logo ||
            NATIVE_LOGOS[r.chainId] ||
            '/logos/chains/generic.png',
          totalUsd: total
        }
      }),
    [results, actionByChain]
  )

  const filteredResults = useMemo(
    () =>
      filterChainId === 'all'
        ? results
        : results.filter((r) => String(r.chainId) === String(filterChainId)),
    [results, filterChainId]
  )

  const currentFilterLabel =
    filterChainId === 'all'
      ? 'All Networks'
      : chainSummaries.find((c) => String(c.chainId) === String(filterChainId))
          ?.name || 'All Networks'

  const currentFilterLogo =
    filterChainId === 'all'
      ? '/logo/ethereum.png'
      : chainSummaries.find((c) => String(c.chainId) === String(filterChainId))
          ?.logo || '/logo/ethereum.png'

  // -------------------------
  // RENDER
  // -------------------------
  return (
    <div className="dashboard">
      
      <div className="network-dropdown-wrapper">
        <button
          type="button"
          className="network-selector"
          onClick={() => setMenuOpen((x) => !x)}
        >
          <img
            src={currentFilterLogo}
            alt=""
            className="network-selector-icon"
          />
          <span>{currentFilterLabel}</span>
          <span className="chevron">{menuOpen ? '▴' : '▾'}</span>
        </button>

        {menuOpen && (
          <div className="network-menu">
            <div
              className="network-menu-item"
              onClick={() => {
                setFilterChainId('all')
                setMenuOpen(false)
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img
                  src="/logo/ethereum.png"
                  alt="All networks"
                  className="network-menu-icon"
                />
                <span>All Networks</span>
              </div>
              <span className="network-usd">{usd(totalDustValue)}</span>
            </div>

            <div className="network-menu-scroll">
              {chainSummaries.map((c) => (
                <div
                  key={c.chainId}
                  className="network-menu-item"
                  onClick={() => {
                    setFilterChainId(c.chainId)
                    setMenuOpen(false)
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    <img
                      src={c.logo}
                      alt={c.name}
                      className="network-menu-icon"
                    />
                    <span>{c.name}</span>
                  </div>
                  <span className="network-usd">{usd(c.totalUsd)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Summary stats */}
      <div className="stats-row">
        <div className="stat-box primary">
          <div className="stat-label">Total Claimable Dust</div>
          <div className="stat-value">{usd(totalDustValue)}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Active Chains</div>
          <div className="stat-value">{activeChains}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Tokens Found</div>
          <div className="stat-value">{totalTokens}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="action-row">
        <button
          type="button"
          className="btn-primary"
          onClick={() => navigate('/scanner')}
        >
          🔍 Advanced Dust Scanner
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={rescanAllChains}
          disabled={loading}
        >
          {loading ? '🔄 Scanning…' : '🔄 Rescan'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={refreshPrices}
          disabled={priceLoading}
        >
          {priceLoading ? '📊 Updating…' : '📊 Refresh Prices'}
        </button>
      </div>

      {/* Chain cards */}
      {filteredResults.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🎉</div>
          <h3>No balances found yet</h3>
          <p>Connect your wallet and run a scan to see your multi-chain overview.</p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => navigate('/scanner')}
          >
            Run Advanced Scan
          </button>
        </div>
      ) : (
        <div className="chain-list">
          {filteredResults.map((r) => {
            const meta = SUPPORTED_CHAINS[r.chainId] || {}
            const action = actionByChain[String(r.chainId)] || {
              value: 0,
              count: 0
            }
            const chainTotalUsd =
              action.value || r.totalValue || r.nativeValue || 0
            const logo =
              meta.logo ||
              NATIVE_LOGOS[r.chainId] ||
              '/logos/chains/generic.png'

            return (
              <div key={r.chainId} className="chain-card">
                <div className="chain-card-header">
                  <img
                    src={logo}
                    alt={meta.name}
                    className="chain-card-icon"
                  />
                  <div className="chain-card-title">
                    <h3>{meta.name || `Chain ${r.chainId}`}</h3>
                    <div className="chain-card-usd">
                      {usd(chainTotalUsd)}
                    </div>
                  </div>
                  <div className="chain-card-native">
                    {fmt(r.nativeBalance)} {meta.symbol}
                  </div>
                </div>

                <div className="chain-card-body">
                  <div className="price-item">
                    <span>Native</span>
                    <span>
                      {fmt(r.nativeBalance)} {meta.symbol}{' '}
                      {r.nativeValue ? `(${usd(r.nativeValue)})` : ''}
                    </span>
                  </div>

                  {(r.tokenDetails || [])
                    .slice(0, 3)
                    .map((t, i) => (
                      <TokenRow
                        key={`${r.chainId}-${t.address}-${i}`}
                        token={{ ...t, chainId: r.chainId }}
                      />
                    ))}

                  {(r.tokenDetails?.length || 0) > 3 && (
                    <div className="token-more">
                      +{r.tokenDetails.length - 3} more tokens
                    </div>
                  )}
                </div>

                <div className="dust-footer">
                  🧹 {action.count} tokens matching dust settings
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}