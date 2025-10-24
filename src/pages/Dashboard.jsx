import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../contexts/WalletContext'
import web3Service from '../services/web3Service'
import priceService from '../services/priceService'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import './Dashboard.css'

const Dashboard = () => {
  const { address } = useWallet()
  const navigate = useNavigate()
  const [chainData, setChainData] = useState([])
  const [totalDustValue, setTotalDustValue] = useState(0)
  const [loading, setLoading] = useState(false)
  const [priceLoading, setPriceLoading] = useState(false)

  useEffect(() => {
    if (address) {
      scanAllChains()
    }
  }, [address])

  const scanAllChains = async () => {
    setLoading(true)
    setPriceLoading(true)
    try {
      const scanPromises = Object.keys(SUPPORTED_CHAINS).map(chainId => 
        web3Service.getDetailedDustAnalysis(chainId, address)
      )
      
      const results = await Promise.allSettled(scanPromises)
      const validResults = results
        .filter(result => result.status === 'fulfilled' && result.value.hasDust)
        .map(result => result.value)

      setChainData(validResults)
      
      // Calculate total value using price service
      const totalValue = await priceService.calculateTotalDustValue(validResults)
      setTotalDustValue(totalValue)
    } catch (error) {
      console.error('Error scanning chains:', error)
    } finally {
      setLoading(false)
      setPriceLoading(false)
    }
  }

  const refreshPrices = async () => {
    setPriceLoading(true)
    try {
      priceService.clearPriceCache()
      const totalValue = await priceService.calculateTotalDustValue(chainData)
      setTotalDustValue(totalValue)
    } catch (error) {
      console.error('Error refreshing prices:', error)
    } finally {
      setPriceLoading(false)
    }
  }

  const formatAddress = (addr) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  const formatBalance = (balance) => {
    return parseFloat(balance).toFixed(6)
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

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
            {priceLoading ? '🔄 Updating...' : '🔄 Refresh Prices'}
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <h3>Total Claimable Dust</h3>
            <div className="stat-value">
              {priceLoading ? '...' : formatCurrency(totalDustValue)}
            </div>
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
              {chainData.reduce((sum, chain) => sum + chain.tokenDust.length, 0)}
            </div>
            <div className="stat-subtitle">Claimable tokens</div>
          </div>
        </div>
      </div>

      <div className="actions-section">
        <button 
          onClick={() => navigate('/scanner')}
          className="btn btn-primary btn-large"
        >
          🔍 Advanced Dust Scanner
        </button>
        
        <button 
          onClick={scanAllChains}
          disabled={loading}
          className="btn btn-secondary"
        >
          {loading ? '🔄 Scanning...' : '🔄 Rescan All Chains'}
        </button>

        <button 
          onClick={refreshPrices}
          disabled={priceLoading}
          className="btn btn-outline"
        >
          {priceLoading ? '📊 Updating...' : '📊 Refresh Prices'}
        </button>
      </div>

      <div className="chains-section">
        <h2>Chain Overview {priceLoading && <span className="loading-badge">Updating Prices...</span>}</h2>
        
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
            {chainData.map((chain, index) => (
              <div key={index} className="chain-card has-dust">
                <div className="chain-header">
                  <div className="chain-info">
                    <span className="chain-logo">
                      {SUPPORTED_CHAINS[chain.chainId]?.logo}
                    </span>
                    <div>
                      <h3>{SUPPORTED_CHAINS[chain.chainId]?.name}</h3>
                      <p className="chain-value">
                        {formatCurrency(chain.totalValue || 0)}
                      </p>
                    </div>
                  </div>
                  <div className="chain-balance">
                    <div className="native-balance">
                      {formatBalance(chain.nativeBalance)} {SUPPORTED_CHAINS[chain.chainId]?.symbol}
                    </div>
                    {chain.tokenDust.length > 0 && (
                      <div className="token-count">
                        +{chain.tokenDust.length} tokens
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Price Details */}
                <div className="price-details">
                  <div className="price-item">
                    <span>Native:</span>
                    <span>
                      {formatBalance(chain.nativeBalance)} {SUPPORTED_CHAINS[chain.chainId]?.symbol} 
                      ({formatCurrency(chain.nativeValue || 0)})
                    </span>
                  </div>
                  {chain.tokenDetails?.slice(0, 3).map((token, tokenIndex) => (
                    <div key={tokenIndex} className="price-item">
                      <span>{token.symbol}:</span>
                      <span>
                        {formatBalance(token.balance)} ({formatCurrency(token.value)})
                      </span>
                    </div>
                  ))}
                  {chain.tokenDetails?.length > 3 && (
                    <div className="price-item more">
                      <span>+{chain.tokenDetails.length - 3} more tokens</span>
                      <span>
                        {formatCurrency(
                          chain.tokenDetails.slice(3).reduce((sum, token) => sum + token.value, 0)
                        )}
                      </span>
                    </div>
                  )}
                </div>
                
                <div className="dust-indicator">
                  🧹 {chain.tokenDust.length} claimable tokens
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cache Info for Debugging */}
      {import.meta.env.DEV && (
        <div className="debug-info">
          <h4>Debug Info</h4>
          <pre>{JSON.stringify(priceService.getCacheStats(), null, 2)}</pre>
        </div>
      )}
    </div>
  )
}

export default Dashboard