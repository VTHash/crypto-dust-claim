import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../contexts/WalletContext'
import { useScan } from '../contexts/ScanContext'
import web3Service from '../services/web3Service'
import batchService from '../services/batchService'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import { NATIVE_LOGOS } from '../services/logoService'
import TokenRow from '../components/TokenRow'
import ChainLogo from '../components/ChainLogo'
import './DustScanner.css'

const DustScanner = () => {
  const { address } = useWallet()
  const navigate = useNavigate()
  const { results, setResults } = useScan()

  const [scanning, setScanning] = useState(false)
  const [selectedChains, setSelectedChains] = useState(
    Object.keys(SUPPORTED_CHAINS).reduce((acc, id) => ((acc[id] = true), acc), {})
  )

  const selectedIds = useMemo(
    () => Object.keys(selectedChains).filter((id) => selectedChains[id]).map(Number),
    [selectedChains]
  )

  // Hydrate from sessionStorage (keep in sync with Dashboard)
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem('dustclaim:lastScan')
      if (cached) {
        const { dustResults = [] } = JSON.parse(cached)
        if (dustResults.length > 0) setResults(dustResults)
      }
    } catch {}
  }, [])

  // Auto-scan if connected and nothing loaded yet
  useEffect(() => {
    if (address && results.length === 0) handleScan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  const handleScan = async () => {
    if (!address) return
    setScanning(true)
    try {
      const scan = await web3Service.scanChains(selectedIds, address)
      setResults(scan)

      // Persist for Dashboard sync
      const total = scan.reduce((s, x) => s + (x.totalValue || 0), 0)
      sessionStorage.setItem('dustclaim:lastScan', JSON.stringify({ dustResults: scan, total }))
    } finally {
      setScanning(false)
    }
  }

  const totalValue = useMemo(
    () => results.reduce((s, r) => s + (r.totalValue || 0), 0),
    [results]
  )

  const totalClaimableCount = useMemo(
    () => results.reduce((s, r) => s + (r.claimableTokens?.length || 0), 0),
    [results]
  )

  const handleBatchClaim = async () => {
    const claims = results.flatMap((r) =>
      (r.claimableTokens || []).map((t) => ({
        chainId: r.chainId,
        tokenAddress: t.address,
        tokenSymbol: t.symbol,
        amount: t.balance,
        recipient: address
      }))
    )

    let claimPlan = []
    try {
      if (typeof batchService.buildClaimPlan === 'function') {
        claimPlan = await batchService.buildClaimPlan(claims)
      }
    } catch {}

    let batchTransactions = []
    if (!claimPlan?.length && typeof batchService.createBatchDustClaim === 'function') {
      batchTransactions = await batchService.createBatchDustClaim(claims, address)
    }

    navigate('/claim', {
      state: {
        claimPlan,
        batchTransactions,
        dustResults: results,
        totalDustValue: totalValue,
        batchSavings: null
      }
    })
  }

  const toggleChain = (id) => {
    setSelectedChains((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const fmt = (n) => Number(n || 0).toFixed(6)
  const usd = (n) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(n || 0))

  return (
    <div className="dust-scanner">
      <div className="scanner-header">
        <h1>Multi-Chain Dust Scanner</h1>
        <p>Scan across 15+ blockchains for claimable tokens & dust</p>
      </div>

      {/* Chain selection */}
      <div className="chain-selection-card">
        <div className="chains-grid-selection">
          {Object.entries(SUPPORTED_CHAINS).map(([id, chain]) => {
            const nativeLogo = chain.logo || NATIVE_LOGOS[id] || '/logos/chains/generic.png'
            return (
              <div
                key={id}
                className={`chain-selector ${selectedChains[id] ? 'selected' : ''}`}
                onClick={() => toggleChain(id)}
              >
                <img className="chain-logo" src={nativeLogo} alt={chain.name} />
                <span className="chain-name">{chain.name}</span>
                <div className="checkbox">{selectedChains[id] && <div className="checkmark">✓</div>}</div>
              </div>
            )
          })}
        </div>

        <div className="scan-controls">
          <button
            className="scan-button"
            disabled={scanning || selectedIds.length === 0}
            onClick={handleScan}
          >
            {scanning
              ? `Scanning ${selectedIds.length} Chains…`
              : `🔍 Scan ${selectedIds.length} Selected Chains`}
          </button>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="results-section">
          <div className="results-header">
            <h2>Dust Found: {usd(totalValue)}</h2>
            <div className="savings-badge">🧹 {totalClaimableCount} claimable tokens</div>
          </div>

          <div className="dust-results">
            {results.map((r) => {
              const meta = SUPPORTED_CHAINS[r.chainId] || {}
              const nativeLogo = meta.logo || NATIVE_LOGOS[r.chainId] || '/logos/chains/generic.png'
              return (
                <div key={r.chainId} className="chain-result-card">
                  <div className="chain-result-header">
                    <div className="chain-info">
                      <img className="chain-logo" src={nativeLogo} alt={meta.name} />
                      <div>
                        <h3>{r.chainName}</h3>
                        <p className="chain-value">{usd(r.totalValue)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="dust-details">
                    {/* Native */}
                    <div className="native-dust">
                      <span className="dust-label">Native:</span>
                      <span className="dust-amount">
                        {fmt(r.nativeBalance)} {r.symbol}{' '}
                        {r.nativeValue ? `(${usd(r.nativeValue)})` : ''}
                      </span>
                      {parseFloat(r.nativeBalance) > 0 &&
                        parseFloat(r.nativeBalance) < 0.001 && (
                          <span className="dust-badge">dust</span>
                        )}
                    </div>

                    {/* Tokens with real logos */}
                    {(r.tokenDetails || []).slice(0, 5).map((t, i) => (
                      <TokenRow key={`${r.chainId}-${t.address}-${i}`} token={t} />
                    ))}

                    {(r.tokenDetails?.length || 0) > 5 && (
                      <div className="more-tokens">
                        +{r.tokenDetails.length - 5} more tokens
                      </div>
                    )}
                  </div>

                  <div className="claim-indicator">
                    🧹 {r.claimableTokens?.length || 0} claimable
                  </div>
                </div>
              )
            })}
          </div>

          <div className="claim-actions">
            <button
              onClick={handleBatchClaim}
              className="claim-button"
              disabled={totalClaimableCount === 0}
            >
              🧹 Batch Claim All ({usd(totalValue)})
            </button>
            {totalClaimableCount === 0 && (
              <p className="claim-note">
                No claimable dust detected. You can still open the Claim page for actions.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default DustScanner