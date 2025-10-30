import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../contexts/WalletContext'
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

  const [chainData, setChainData] = useState([])
  const [totalDustValue, setTotalDustValue] = useState(0)
  const [loading, setLoading] = useState(false)
  const [priceLoading, setPriceLoading] = useState(false)

  // 1) Hydrate from last scanner run
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem('dustclaim:lastScan')
      if (cached) {
        const { dustResults = [], total = 0 } = JSON.parse(cached)
        setChainData(dustResults)
        setTotalDustValue(total)
      }
    } catch {}
  }, [])

  // 2) If wallet connects / changes — rescan using the SAME logic as scanner
  useEffect(() => { if (address) scanAllChains() }, [address])

  async function scanAllChains() {
    setLoading(true)
    setPriceLoading(true)
    try {
      const chainIds = Object.keys(SUPPORTED_CHAINS).map(Number)

      const settled = await Promise.allSettled(
        chainIds.map((id) => web3Service.checkForDust(id, address))
      )

      const valid = settled
        .filter((r) => r.status === 'fulfilled' && r.value?.hasDust)
        .map((r) => r.value)

      const enriched = await Promise.all(
        valid.map(async (r) => {
          const usdValue = await web3Service.getUSDValue(r.chainId, r.nativeBalance, r.tokenDust)
          const meta = SUPPORTED_CHAINS[r.chainId] || {}
          return {
            ...r,
            usdValue,
            chainName: meta.name,
            symbol: meta.symbol
          }
        })
      )

      setChainData(enriched)
      const total = enriched.reduce((s, x) => s + (x.usdValue || 0), 0)
      setTotalDustValue(total)

      sessionStorage.setItem('dustclaim:lastScan', JSON.stringify({ dustResults: enriched, total }))
    } catch (err) {
      console.error('Dashboard scan error:', err)
      setChainData([])
      setTotalDustValue(0)
    } finally {
      setLoading(false)
      setPriceLoading(false)
    }
  }

  async function refreshPrices() {
    setPriceLoading(true)
    try {
      const repriced = await Promise.all(
        (chainData || []).map(async (r) => ({
          ...r,
          usdValue: await web3Service.getUSDValue(r.chainId, r.nativeBalance, r.tokenDust),
        }))
      )
      setChainData(repriced)
      const total = repriced.reduce((s, x) => s + (x.usdValue || 0), 0)
      setTotalDustValue(total)
      sessionStorage.setItem('dustclaim:lastScan', JSON.stringify({ dustResults: repriced, total }))
    } catch (e) {
      console.error('Price refresh error:', e)
    } finally {
      setPriceLoading(false)
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p>Real-time dust valuation across all chains</p>

        <div className="price-refresh">
          <button onClick={refreshPrices} disabled={priceLoading} className="btn btn-outline btn-sm">
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
            <div className="stat-subtitle">Real-time pricing</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🔗</div>
          <div className="stat-content">
            <h3>Active Chains</h3>
            <div className="stat-value">{chainData.length}</div>
            <div className="stat-subtitle">With dust detected</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🧹</div>
          <div className="stat-content">
            <h3>Total Tokens</h3>
            <div className="stat-value">
              {chainData.reduce((sum, r) => sum + (r.tokenDust?.length || 0), 0)}
            </div>
            <div className="stat-subtitle">Claimable tokens</div>
          </div>
        </div>
      </div>

      <div className="actions-section">
        <button onClick={() => navigate('/scanner')} className="btn btn-primary btn-large">
          🔍 Advanced Dust Scanner
        </button>
        <button onClick={scanAllChains} disabled={loading} className="btn btn-secondary">
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

        {chainData.length === 0 && !loading ? (
          <div className="empty-state">
            <div className="empty-icon">🎉</div>
            <h3>No Dust Found!</h3>
            <p>Your wallets are clean across all supported chains.</p>
            <button onClick={() => navigate('/scanner')} className="btn btn-primary">
              Run Advanced Scan
            </button>
          </div>
        ) : (
          <div className="chains-grid">
            {chainData.map((r, idx) => {
              const meta = SUPPORTED_CHAINS[r.chainId] || {}
              const nativeLogo = meta.logo || NATIVE_LOGOS[r.chainId] || '/logos/chains/generic.png'
              return (
                <div key={idx} className="chain-card has-dust">
                  <div className="chain-header">
                    <div className="chain-info">
                      <img className="chain-logo" src={nativeLogo} alt={meta.name} />
                      <div>
                        <h3>{meta.name}</h3>
                        <p className="chain-value">{usd(r.usdValue)}</p>
                      </div>
                    </div>
                    <div className="chain-balance">
                      <div className="native-balance">
                        {fmt(r.nativeBalance)} {meta.symbol}
                      </div>
                      {!!(r.tokenDust?.length) && (
                        <div className="token-count">+{r.tokenDust.length} tokens</div>
                      )}
                    </div>
                  </div>

                  {/* Native row */}
                  <div className="price-details">
                    <div className="price-item">
                      <span>Native:</span>
                      <span>
                        {fmt(r.nativeBalance)} {meta.symbol} ({usd(r.nativeValue || 0)})
                      </span>
                    </div>

                    {/* First 3 token rows with real logos */}
                    {(r.tokenDust || []).slice(0, 3).map((t, i) => (
                      <TokenRow key={`${t.address}-${i}`} token={t} />
                    ))}

                    {(r.tokenDust?.length || 0) > 3 && (
                      <div className="price-item more">
                        <span>+{r.tokenDust.length - 3} more tokens</span>
                      </div>
                    )}
                  </div>

                  <div className="dust-indicator">
                    🧹 {(r.tokenDust?.length || 0)} claimable tokens
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
