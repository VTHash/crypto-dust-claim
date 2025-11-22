import React, { useEffect, useMemo, useState } from 'react';
import './GlobalStatsWidget.css';

// Local copy of chain labels (client should not import server files)
const CHAIN_LABELS = {
  1: 'Ethereum',
  10: 'Optimism',
  56: 'BNB Smart Chain',
  137: 'Polygon PoS',
  42161: 'Arbitrum One',
  8453: 'Base',
  130: 'Unichain',
  5000: 'Mantle',
  9745: 'Plasma',
  324: 'zkSync',
  14: 'Flare',
  40: 'Telos',
  57: 'Syscoin',
  50: 'XDC Network',
  61: 'Ethereum Classic',
  57073: 'Inkonchain',
  122: 'Fuse',
  60808: 'BOB',
  81457: 'Blast',
  1868: 'Soneium',
  480: 'World Chain',
  1135: 'Lisk',
  1923: 'Swellchain',
  2741: 'Abstract',
  747474: 'Katana',
  146: 'Sonic',
};

const CHAIN_LOGOS = {
  1: '/logo/ethereum.png',
  10: '/logo/optimism.png',
  56: '/logo/bnb.png',
  137: '/logo/polygon.png',
  42161: '/logo/arbitrum.png',
  8453: '/logo/base.png',
  130: '/logo/unichain.png',
  5000: '/logo/mantle.png',
  9745: '/logo/plasma.png',
  324: '/logo/zksync.jpg',
  14: '/logo/flare.png',
  40: '/logo/telos.png',
  57: '/logo/sys.jpg',
  50: '/logo/xdc.png',
  61: '/logo/ethereum-classic.png',
  57073: '/logo/ink.png',
  122: '/logo/fuse.png',
  60808: '/logo/bob.png',
  81457: '/logo/blast.png',
  1868: '/logo/soneium.jpg',
  480: '/logo/worldcoin.png',
  1135: '/logo/lisk.png',
  1923: '/logo/swell.png',
  2741: '/logo/abstract.png',
  747474: '/logo/katana.png',
  146: '/logo/sonic.png',
  7777777: '/logo/zora.png',
  100: '/logo/gnosis.png',
};

const GlobalStatsWidget = () => {
  // ✅ plain JS state, no TypeScript type annotation
  const [status, setStatus] = useState('loading'); // 'loading' | 'online' | 'offline'
  const [expanded, setExpanded] = useState(false);
  const [stats, setStats] = useState({
    totalViews: 0,
    totalScans: 0,
    perChainScans: {},
    paused: false,
  });

  // Fetch global stats from Netlify on mount
  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      try {
        const res = await fetch('/.netlify/functions/stats-get');

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        // We expect the Netlify function to return:
        // { totalViews, totalScans, perChainScans }
        if (
          typeof data.totalViews === 'number' &&
          typeof data.totalScans === 'number'
        ) {
          if (!cancelled) {
            setStats({
              totalViews: data.totalViews,
              totalScans: data.totalScans,
              perChainScans: data.perChainScans || {},
              paused: !!data.paused,
            });
            setStatus('online');
          }
        } else {
          if (!cancelled) setStatus('offline');
        }
      } catch (err) {
        if (!cancelled) setStatus('offline');
      }
    };

    loadStats();

    return () => {
      cancelled = true;
    };
  }, []);

  const topChains = useMemo(() => {
    const entries = Object.entries(stats.perChainScans || {});
    if (!entries.length) return [];

    return entries
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 5)
      .map(([id, count]) => ({
        id,
        count,
        label: CHAIN_LABELS[id] || `Chain ${id}`,
      }));
  }, [stats.perChainScans]);

  const statusLabel =
    status === 'online'
      ? 'Stats online'
      : status === 'loading'
      ? 'Loading…'
      : 'Stats offline';

  return (
    <div className="global-stats-widget">
      <div className="gsw-header">
        <div className="gsw-title">
          <span className="gsw-icon">📊</span>
          <span>NETWORK STATS</span>
        </div>

        <button
          className={`gsw-status-pill gsw-status-${status}`}
          type="button"
          onClick={() => setExpanded((x) => !x)}
        >
          {statusLabel}
          <span className="gsw-chevron">{expanded ? '▴' : '▾'}</span>
        </button>
      </div>

{paused && (
  <div className="gsw-paused-badge">
    ⏸ Stats Paused — Showing saved data (updates monthly)
  </div>
)}

      {/* Always show the big number so the bar doesn't look empty */}
      <div className="gsw-main-metric">
        <div className="gsw-metric-label">Total scans</div>
        <div className="gsw-metric-value">{stats.totalScans}</div>
      </div>

      {expanded && (
        <div className="gsw-panel">
          <div className="gsw-metrics-row">
            <div className="gsw-metric">
              <div className="gsw-metric-label">Total views</div>
              <div className="gsw-metric-value-sm">{stats.totalViews}</div>
            </div>
            <div className="gsw-metric">
              <div className="gsw-metric-label">Unique chains scanned</div>
              <div className="gsw-metric-value-sm">
                {Object.keys(stats.perChainScans || {}).length}
              </div>
            </div>
          </div>

          <div className="gsw-top-chains">
            <div className="gsw-top-title">Top chains this week</div>
            {topChains.length === 0 ? (
              <div className="gsw-empty">No scans logged yet.</div>
            ) : (
              <ul className="gsw-chain-list">
                {topChains.map((c) => {
                  const logoSrc = CHAIN_LOGOS[c.id];
                  return (
                    <li key={c.id} className="gsw-chain-item">
                      {logoSrc && (
                        <img
                          src={logoSrc}
                          alt={c.label}
                          className="gsw-chain-icon"
                        />
                      )}
                      <span className="gsw-chain-name">{c.label}</span>
                      <span className="gsw-chain-count">{c.count} scans</span>
                    </li>
                );
})
              }
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GlobalStatsWidget;