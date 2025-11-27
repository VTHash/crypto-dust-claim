import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../contexts/WalletContext'
import { useScan } from '../contexts/ScanContext'
import { useSettings } from '../contexts/SettingsContext'
import web3Service from '../services/web3Service'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import { NATIVE_LOGOS } from '../services/logoService'
import TokenRow from '../components/TokenRow'
import GlobalStatsWidget from '../components/GlobalStatsWidget'

export default function Dashboard() {
  const navigate = useNavigate()
  const { address } = useWallet()
  const { results, setResults } = useScan()
  const { settings } = useSettings()

  const [loading, setLoading] = useState(false)
  const [priceLoading, setPriceLoading] = useState(false)

  // 🌐 For style network dropdown
  const [networkMenuOpen, setNetworkMenuOpen] = useState(false)
  const [selectedNetwork, setSelectedNetwork] = useState('all') // 'all' or chainId

  const usd = (n) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(Number(n || 0))

  const fmt = (n) => Number(n || 0).toFixed(6)

  // -------------------------------
  // INITIAL SCAN LOGIC
  // -------------------------------

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem('dustclaim:lastScan')
      if (cached) {
        const { dustResults = [] } = JSON.parse(cached)
        if (dustResults.length) setResults(dustResults)
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (address && results.length === 0) {
      rescanAllChains()
    }
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
          (_k, v) => (typeof v === 'bigint' ? v.toString() : v)
        )
      )
    } catch (e) {
      console.error(e)
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
          (_k, v) => (typeof v === 'bigint' ? v.toString() : v)
        )
      )
    } catch (e) {
      console.error('Price refresh error:', e)
    } finally {
      setPriceLoading(false)
    }
  }

  // -------------------------------
  // DATA MODELLING
  // -------------------------------

  const buildActionUniverse = useMemo(() => {
    const list = []
    for (const chain of results) {
      const chainId = chain.chainId

      const src =
        Array.isArray(chain.claimableTokens)
          ? chain.claimableTokens
          : chain.tokenDetails || []

      for (const t of src) {
        if (Number(t.balance || 0) <= 0) continue
        list.push({
          chainId,
          symbol: t.symbol,
          address: t.address,
          balance: t.balance,
          usd: Number(t.value || 0)
        })
      }
    }
    return list
  }, [results])

  const actionByChain = useMemo(() => {
    const m = {}
    for (const item of buildActionUniverse) {
      const id = String(item.chainId)
      if (!m[id]) m[id] = { value: 0, count: 0 }
      m[id].value += Number(item.usd)
      m[id].count += 1
    }
    return m
  }, [buildActionUniverse])

  const totalDustValue = useMemo(
    () => Object.values(actionByChain).reduce((s, x) => s + x.value, 0),
    [actionByChain]
  )

  const totalTokens = buildActionUniverse.length

  const activeChains = results.filter((r) => {
    const key = String(r.chainId)
    const action = actionByChain[key]
    const hasNative = Number(r.nativeBalance || 0) > 0
    const hasDust = action && action.count > 0
    return hasNative || hasDust
  }).length

  // -------------------------------
  // FILTERED VIEW FOR SELECTED NETWORK
  // -------------------------------

  const filteredResults =
    selectedNetwork === 'all'
      ? results
      : results.filter((r) => r.chainId === Number(selectedNetwork))

  // -------------------------------
  // RENDER
  // -------------------------------

  return (
    <div className="dashboard">

      {/* ---------------------------
          NETWORK DROPDOWN
      ---------------------------- */}
      <div className="network-dropdown-wrapper">
        <button
          className="network-selector"
          onClick={() => setNetworkMenuOpen(!networkMenuOpen)}
        >
          <img
            src={
              selectedNetwork === 'all'
                ? '/logos/chains/allnetworks.png'
                : SUPPORTED_CHAINS[selectedNetwork]?.logo ||
                  '/logos/chains/generic.png'
            }
            className="network-selector-icon"
          />
          <span>
            {selectedNetwork === 'all'
              ? 'All Networks'
              : SUPPORTED_CHAINS[selectedNetwork]?.name || 'Unknown'}
          </span>
          <span className="chevron">{networkMenuOpen ? '▲' : '▼'}</span>
        </button>

        {networkMenuOpen && (
          <div className="network-menu">
            <div
              className="network-menu-item"
              onClick={() => {
                setSelectedNetwork('all')
                setNetworkMenuOpen(false)
              }}
            >
              <img src="/logos/chains/allnetworks.png" className="network-menu-icon" />
              <span>All Networks</span>
              <span className="network-usd">{usd(totalDustValue)}</span>
            </div>

            <div className="network-menu-scroll">
              {results.map((r) => {
                const meta = SUPPORTED_CHAINS[r.chainId] || {}
                const action = actionByChain[String(r.chainId)] || { value: 0 }
                return (
                  <div
                    key={r.chainId}
                    className="network-menu-item"
                    onClick={() => {
                      setSelectedNetwork(r.chainId)
                      setNetworkMenuOpen(false)
                    }}
                  >
                    <img
                      src={meta.logo || '/logos/chains/generic.png'}
                      className="network-menu-icon"
                    />
                    <span>{meta.name}</span>
                    <span className="network-usd">{usd(action.value)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ---------------------------
          SUMMARY STATS
      ---------------------------- */}
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

      {/* ---------------------------
          ACTION BUTTONS
      ---------------------------- */}
      <div className="action-row">
        <button onClick={() => navigate('/scanner')} className="btn-primary">
          🔍 Advanced Dust Scanner
        </button>

        <button onClick={rescanAllChains} className="btn-secondary">
          {loading ? '🔄 Scanning…' : '🔄 Rescan'}
        </button>

        <button onClick={refreshPrices} className="btn-secondary">
          {priceLoading ? '📊 Updating…' : '📊 Refresh Prices'}
        </button>
      </div>

      {/* ---------------------------
          MAIN CHAIN CARDS (Filtered)
      ---------------------------- */}
      <div className="chain-list">
        {filteredResults.map((r) => {
          const meta = SUPPORTED_CHAINS[r.chainId] || {}
          const nativeLogo =
            meta.logo || NATIVE_LOGOS[r.chainId] || '/logos/chains/generic.png'

          const action = actionByChain[String(r.chainId)] || { value: 0, count: 0 }

          const chainTotalUsd = action.value || r.nativeValue || 0

          return (
            <div key={r.chainId} className="chain-card">

              <div className="chain-card-header">
                <img src={nativeLogo} className="chain-card-icon" />

                <div className="chain-card-title">
                  <h3>{meta.name}</h3>
                  <div className="chain-card-usd">{usd(chainTotalUsd)}</div>
                </div>

                <div className="chain-card-native">
                  {fmt(r.nativeBalance)} {meta.symbol}
                </div>
              </div>

              <div className="chain-card-body">
                {(r.tokenDetails || []).slice(0, 4).map((t, i) => (
                  <TokenRow
                    key={`${r.chainId}-${t.address}-${i}`}
                    token={{ ...t, chainId: r.chainId }}
                  />
                ))}

                {(r.tokenDetails?.length || 0) > 4 && (
                  <div className="token-more">+{r.tokenDetails.length - 4} more</div>
                )}
              </div>

              <div className="dust-footer">
                🧹 {action.count} tokens matching dust settings
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}