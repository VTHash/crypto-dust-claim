import React from 'react'
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
  const [stats, setStats] = React.useState({
    totalViews: 0,
    totalScans: 0,
    perChainScans: {}
  })
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [showDetails, setShowDetails] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch('/.netlify/functions/stats-get')
        if (!res.ok) throw new Error('Failed to load stats')
        const data = await res.json()

        if (!cancelled) {
          setStats({
            totalViews: data.totalViews || 0,
            totalScans: data.totalScans || 0,
            perChainScans: data.perChainScans || {}
          })
          setIsLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError('Could not load global stats')
          setIsLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const activeChains = Object.keys(stats.perChainScans || {}).length

  // Top chains by scans (max 5)
  const topChains = React.useMemo(() => {
    const entries = Object.entries(stats.perChainScans || {})
    return entries
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({
        id,
        count,
        label: CHAIN_LABELS[id] || `Chain #${id}`
      }))
  }, [stats.perChainScans])

  return (
    <div className="global-stats-card">
      <div className="global-stats-main">
        <div className="global-stats-header">
          <span className="global-stats-dot" />
          <span className="global-stats-title">DustClaim global activity</span>
        </div>

        {isLoading && (
          <p className="global-stats-text">Loading stats…</p>
        )}

        {error && !isLoading && (
          <p className="global-stats-text global-stats-error">{error}</p>
        )}

        {!isLoading && !error && (
          <>
            <p className="global-stats-text">
              <strong>{stats.totalViews}</strong> address views ·{' '}
              <strong>{stats.totalScans}</strong> scans
            </p>
            <p className="global-stats-sub">
              Active chains: <strong>{activeChains}</strong>
            </p>
          </>
        )}
      </div>

      {/* Toggle button */}
      {!isLoading && !error && (
        <button
          type="button"
          className="global-stats-toggle"
          onClick={() => setShowDetails(v => !v)}
        >
          {showDetails ? 'Hide details' : 'View top chains'}
          <span className={`global-stats-chevron ${showDetails ? 'open' : ''}`}>
            ▾
          </span>
        </button>
      )}

      {/* Mini stats panel */}
      {showDetails && !isLoading && !error && (
        <div className="global-stats-panel">
          {topChains.length === 0 ? (
            <p className="global-stats-panel-empty">
              No chain activity recorded yet.
            </p>
          ) : (
            <ul className="global-stats-panel-list">
              {topChains.map((chain) => (
                <li key={chain.id} className="global-stats-panel-item">
                  <span className="global-stats-panel-name">
                    {chain.label}
                    <span className="global-stats-panel-id">
                      ({chain.id})
                    </span>
                  </span>
                  <span className="global-stats-panel-count">
                    {chain.count} scans
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default GlobalStatsWidget
