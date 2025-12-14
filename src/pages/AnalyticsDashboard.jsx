import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './AnalyticsDashboard.css';

// Same chain metadata as widget (simple duplication, safe)
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
  7777777: 'Zora',
  42220:  'Celo',
  100: 'Gnosis',
  250: 'Fantom',
  1284: 'Moonbeam',
  1285: 'Moonriver',
  1329: 'Sei',
  34443: 'Mode',
  43114: 'Avalanche C',
  59144: 'Linea',
  80094: 'Berachain',
  1313161554: 'Aurora',
  534352: 'Scroll',
  


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
  60808: '/logo/bob.jpg',
  81457: '/logo/blast.jpeg',
  1868: '/logo/soneium.jpg',
  480: '/logo/worldcoin.png',
  1135: '/logo/lisk.png',
  1923: '/logo/swell.png',
  2741: '/logo/abstract.png',
  747474: '/logo/katana.jpg',
  146: '/logo/sonic.jpg',
  7777777: '/logo/zora.jpg',
  100: '/logo/gnosis.png',
  42220: '/logo/celo.png',
  250: '/logo/fantom.png',
  1284: '/logo/moonbeam.png',
  1285: '/logo/moonriver.png',
  1329: '/logo/sei.png',
  34443: '/logo/mode.jpg',
  43114: '/logo/avalanche.png',
  59144: '/logo/linea.png',
  60808: '/logo/bob.jpg',
  80094: '/logo/bera.png',
  81457: '/logo/blast.jpeg',
  1313161554: '/logo/aurora.png',
  534352: '/logo/scroll.png',
  42170: '/logo/arbitrum-nova.jpeg',
  167000: '/logo/taiko.png',
  28105: '/logo/morph.jpg',

};

const AnalyticsDashboard = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalViews: 0,
    totalScans: 0,
    perChainScans: {},
    paused: false,
  });

  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      try {
        const res = await fetch('/.netlify/functions/stats-get-supabase');
        const data = await res.json();

        if (!cancelled) {
          setStats({
            totalViews: Number(data.totalViews || 0),
            totalScans: Number(data.totalScans || 0),
            perChainScans: data.perChainScans || {},
            paused: !!data.paused,
          });
          setLoading(false);
        }
      } catch (err) {
        console.error('AnalyticsDashboard stats-get error:', err);
        if (!cancelled) setLoading(false);
      }
    };

    fetchStats();
    return () => { cancelled = true; };
  }, []);

  const uniqueChains = useMemo(
    () => Object.keys(stats.perChainScans || {}).length,
    [stats.perChainScans]
  );

  const chainList = useMemo(() => {
    const entries = Object.entries(stats.perChainScans || {});
    if (!entries.length) return [];
    return entries
      .map(([id, count]) => ({
        id,
        count: Number(count || 0),
        label: CHAIN_LABELS[id] || `Chain ${id}`,
      }))
      .sort((a, b) => b.count - a.count);
  }, [stats.perChainScans]);

  const topChains = chainList.slice(0, 5);
  const maxScans = chainList.length
    ? Math.max(...chainList.map((c) => c.count))
    : 1;

  const statusLabel = stats.paused ? 'Paused snapshot' : 'Live tracking';

  return (
    <div className="analytics-page">
      <div className="analytics-header">
        <button
          className="analytics-back"
          type="button"
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>

        <div className="analytics-title-block">
          <h1>Network Analytics</h1>
          <p>High-level usage metrics for DustClaim scans.</p>
        </div>

        <div
          className={`analytics-status-pill ${
            stats.paused ? 'paused' : 'live'
          }`}
        >
          {statusLabel}
        </div>
      </div>

      {loading ? (
        <div className="analytics-loading">Loading analytics…</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="analytics-summary-grid">
            <div className="analytics-card primary">
              <div className="analytics-card-label">Total views</div>
              <div className="analytics-card-value">
                {stats.totalViews.toLocaleString()}
              </div>
              <div className="analytics-card-sub">
                Every time the app loads successfully.
              </div>
            </div>

            <div className="analytics-card">
              <div className="analytics-card-label">Total scans</div>
              <div className="analytics-card-value">
                {stats.totalScans.toLocaleString()}
              </div>
              <div className="analytics-card-sub">
                Unique multi-chain dust scans run.
              </div>
            </div>

            <div className="analytics-card">
              <div className="analytics-card-label">Unique chains scanned</div>
              <div className="analytics-card-value">{uniqueChains}</div>
              <div className="analytics-card-sub">
                Networks with at least one scan.
              </div>
            </div>

            <div className="analytics-card">
              <div className="analytics-card-label">Data mode</div>
              <div className="analytics-card-value">
                {stats.paused ? 'Paused' : 'Live'}
              </div>
              <div className="analytics-card-sub">
                {stats.paused
                  ? 'Counters are frozen to save API usage.'
                  : 'Stats update in real time.'}
              </div>
            </div>
          </div>

          {/* Top chains */}
          <section className="analytics-section">
            <div className="analytics-section-header">
              <h2>Top chains</h2>
              <p>Most frequently scanned networks.</p>
            </div>

            {topChains.length === 0 ? (
              <div className="analytics-empty">
                No scans recorded yet. Run a dust scan to populate analytics.
              </div>
            ) : (
              <div className="analytics-top-chains">
                {topChains.map((c) => {
                  const logoSrc = CHAIN_LOGOS[c.id];
                  const widthPct = (c.count / maxScans) * 100;
                  return (
                    <div key={c.id} className="analytics-top-row">
                      <div className="analytics-top-left">
                        {logoSrc && (
                          <img
                            src={logoSrc}
                            alt={c.label}
                            className="analytics-chain-icon"
                          />
                        )}
                        <span className="analytics-chain-name">{c.label}</span>
                      </div>
                      <div className="analytics-top-right">
                        <div className="analytics-bar-shell">
                          <div
                            className="analytics-bar-fill"
                            style={{ width: `${widthPct || 5}%` }}
                          />
                        </div>
                        <span className="analytics-chain-count">
                          {c.count} scans
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* All chains table */}
          <section className="analytics-section">
            <div className="analytics-section-header">
              <h2>All chains activity</h2>
              <p>Full breakdown of every network that DustClaim has scanned.</p>
            </div>

            {chainList.length === 0 ? (
              <div className="analytics-empty">
                No chains scanned yet. Try running a full multi-chain scan.
              </div>
            ) : (
              <div className="analytics-table-wrapper">
                <table className="analytics-table">
                  <thead>
                    <tr>
                      <th>Chain</th>
                      <th className="numeric">Scans</th>
                      <th className="numeric">% of total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chainList.map((c) => {
                      const logoSrc = CHAIN_LOGOS[c.id];
                      const pct =
                        stats.totalScans > 0
                          ? ((c.count / stats.totalScans) * 100).toFixed(1)
                          : '0.0';
                      return (
                        <tr key={c.id}>
                          <td>
                            <div className="analytics-table-chain">
                              {logoSrc && (
                                <img
                                  src={logoSrc}
                                  alt={c.label}
                                  className="analytics-chain-icon"
                                />
                              )}
                              <span>{c.label}</span>
                            </div>
                          </td>
                          <td className="numeric">{c.count}</td>
                          <td className="numeric">{pct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default AnalyticsDashboard;