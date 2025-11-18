// src/components/GlobalStatsWidget.jsx
import React, { useEffect, useState } from 'react'
import './GlobalStatsWidget.css'
// Optional: basic labels for common chains (fallback to "Chain #id")
const CHAIN_LABELS = {
  1: 'Ethereum',
  10: 'Optimism',
  56: 'BNB Smart Chain',
  137: 'Polygon',
  42161: 'Arbitrum One',
  8453: 'Base',
  130: 'Unichain',
  5000: 'Mantle',
  9745: 'Plasma',
  7777777: 'Zora',
  100: 'Gnosis',
  250:  'Fantom',
  1329: 'Sei',
  34443: 'Mode',
  43114: 'Avalanche C Chain',
  59144: 'Linea',
  80094: 'Berachain',
  42220: 'Celo',
  1313161554: 'Aurora',
  1284: 'Moonbeam',
  1285: 'Moonriver',
  14: 'Flare',
  40: 'Telos',
  57: 'Syscoin',
  61: 'ETC',
  57073: 'Inkonchain',
  122:  'Fuse',
  60808:  'Bob',
  81457:  'Blast',
 1868:  'Soneium',
 480:  'Worldcoin',
 1135:  'Lisk',
 1923: 'Swellchain',
 2741: 'Abstract',
 747474: 'Katana',
 146: 'Sonic',
 
}
const GlobalStatsWidget = () => {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState(null)

  // Helper: safe number -> short format
  const fmt = (n) => {
    const num = Number(n || 0)
    if (!Number.isFinite(num)) return '0'
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'k'
    return num.toString()
  }

  useEffect(() => {
    let cancelled = false

    const fetchStats = async () => {
      try {
        setLoading(true)
        const res = await fetch('/.netlify/functions/stats-view')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (!cancelled) {
          setStats(json)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Unable to load stats')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchStats()

    // Refresh every 60s so it feels “live”
    const id = setInterval(fetchStats, 60_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  // --- Normalise shapes from the Netlify function -------------------------

  // totals might be at root or under .totals
  const totals = stats?.totals || stats || {}
  const totalScans = totals.totalScans ?? totals.scans ?? 0
  const totalAddresses = totals.totalAddresses ?? totals.addresses ?? 0
  const totalChains = totals.totalChains ?? totals.chains ?? 0

  // chains may be: `chains`, `topChains`, or `chainBreakdown` object
  let chains = []

  if (Array.isArray(stats?.chains)) {
    chains = stats.chains
  } else if (Array.isArray(stats?.topChains)) {
    chains = stats.topChains
  } else if (
    stats?.chainBreakdown &&
    typeof stats.chainBreakdown === 'object'
  ) {
    chains = Object.entries(stats.chainBreakdown).map(([chainId, info]) => ({
      chainId: Number(chainId),
      ...(info || {})
    }))
  }

  // Sort by scans desc and take top 3
  chains.sort((a, b) => (b.scans || 0) - (a.scans || 0))
  const topChains = chains.slice(0, 3)

  const hasData =
    (totalScans || totalAddresses || totalChains) && !loading && !error

  return (
    <section className="global-stats-shell">
      <button
        type="button"
        className={`global-stats-bar ${open ? 'open' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="stats-label">📊 Network stats</span>

        <span className="stats-summary">
          {loading && <span className="stats-pill">Loading…</span>}
          {!loading && error && (
            <span className="stats-pill stats-pill-error">Stats offline</span>
          )}
          {!loading && !error && (
            <>
              <span className="stats-pill">
                {fmt(totalScans)} scans
              </span>
              <span className="stats-pill">
                {fmt(totalAddresses)} addresses
              </span>
              {totalChains ? (
                <span className="stats-pill">
                  {fmt(totalChains)} chains
                </span>
              ) : null}
            </>
          )}
        </span>

        <span className="stats-toggle">{open ? '▾' : '▸'}</span>
      </button>

      {open && hasData && (
        <div className="global-stats-panel">
          <div className="panel-header">
            <span>Top chains by scans</span>
            <span className="panel-note">Last 24h / rolling total</span>
          </div>

          {topChains.length === 0 && (
            <div className="panel-empty">
              Stats are still warming up. Run a scan to be the first one here.
            </div>
          )}

          {topChains.length > 0 && (
            <ul className="panel-list">
              {topChains.map((c) => (
                <li key={c.chainId || c.name} className="panel-row">
                  <div className="panel-row-main">
                    <span className="panel-chain-name">
                      {c.name || `Chain ${c.chainId}`}
                    </span>
                    {c.symbol && (
                      <span className="panel-chain-symbol">
                        {c.symbol}
                      </span>
                    )}
                  </div>
                  <div className="panel-row-meta">
                    <span>{fmt(c.scans || 0)} scans</span>
                    {typeof c.share === 'number' && (
                      <span className="panel-share">
                        {(c.share * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

export default GlobalStatsWidget