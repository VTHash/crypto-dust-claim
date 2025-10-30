import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../contexts/WalletContext'
import { useScan } from '../contexts/ScanContext'
import web3Service from '../services/web3Service'
import batchService from '../services/batchService'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
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

  useEffect(() => {
    if (address && results.length === 0) handleScan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  const handleScan = async () => {
    if (!address) return
    setScanning(true)
    try {
      const scan = await web3Service.scanChains(selectedIds, address)
      // keep everything for display; “claimable” will be built from .claimableTokens
      setResults(scan)
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
    // Build claims from the dust subset only
    const claims = results.flatMap((r) =>
      (r.claimableTokens || []).map((t) => ({
        chainId: r.chainId,
        tokenAddress: t.address,
        tokenSymbol: t.symbol,
        amount: t.balance,
        recipient: address
      }))
    )

    // Build a “best effort” plan for Claim screen
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

  return (
    <div className="dust-scanner">
      <div className="scanner-header">
        <h1>Multi-Chain Dust Scanner</h1>
        <p>Scan across multiple blockchains for claimable dust</p>
      </div>

      {/* Chain selection */}
      <div className="chain-selection-card">
        <div className="chains-grid-selection">
          {Object.entries(SUPPORTED_CHAINS).map(([id, chain]) => (
            <div key={id} className={`chain-selector ${selectedChains[id] ? 'selected' : ''}`} onClick={() => toggleChain(id)}>
              <ChainLogo src={chain.logo} alt={chain.name} />
              <span className="chain-name">{chain.name}</span>
              <div className="checkbox">{selectedChains[id] && <div className="checkmark">✓</div>}</div>
            </div>
          ))}
        </div>
        <div className="scan-controls">
          <button className="scan-button" disabled={scanning || selectedIds.length === 0} onClick={handleScan}>
            {scanning ? `Scanning ${selectedIds.length} Chains…` : `🔍 Scan ${selectedIds.length} Selected Chains`}
          </button>
        </div>
      </div>

      {/* Results – show ALL tokens, mark dust */}
      {results.length > 0 && (
        <div className="results-section">
          <div className="results-header">
            <h2>Dust Found: ${totalValue.toFixed(4)}</h2>
            <div className="savings-badge">🧹 {totalClaimableCount} claimable dust tokens</div>
          </div>

          <div className="dust-results">
            {results.map((r) => (
              <div key={r.chainId} className="chain-result-card">
                <div className="chain-result-header">
                  <div className="chain-info">
                    <ChainLogo src={SUPPORTED_CHAINS[r.chainId]?.logo} alt={SUPPORTED_CHAINS[r.chainId]?.name} />
                    <div>
                      <h3>{r.chainName}</h3>
                      <p className="chain-value">${(r.totalValue || 0).toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                <div className="dust-details">
                  <div className="native-dust">
                    <span className="dust-label">Native:</span>
                    <span className="dust-amount">
                      {parseFloat(r.nativeBalance).toFixed(6)} {r.symbol} {r.nativeValue ? `($${r.nativeValue.toFixed(2)})` : ''}
                    </span>
                    {parseFloat(r.nativeBalance) > 0 && parseFloat(r.nativeBalance) < 0.001 && (
                      <span className="dust-badge">dust</span>
                    )}
                  </div>

                  {r.tokenDetails.slice(0, 5).map((t, i) => (
                    <div key={i} className="token-dust">
                      <span className="dust-label">{t.symbol}:</span>
                      <span className="dust-amount">
                        {parseFloat(t.balance).toFixed(6)} {t.value ? `($${t.value.toFixed(2)})` : ''}
                      </span>
                      {parseFloat(t.balance) < 0.01 && <span className="dust-badge">dust</span>}
                    </div>
                  ))}

                  {r.tokenDetails.length > 5 && (
                    <div className="more-tokens">+{r.tokenDetails.length - 5} more tokens</div>
                  )}
                </div>

                <div className="claim-indicator">
                  🧹 {r.claimableTokens.length} claimable tokens
                </div>
              </div>
            ))}
          </div>

          <div className="claim-actions">
            <button onClick={handleBatchClaim} className="claim-button" disabled={totalClaimableCount === 0}>
              🧹 Batch Claim All (${totalValue.toFixed(2)})
            </button>
            {totalClaimableCount === 0 && <p className="claim-note">No dust detected. You can still view Claim for quick actions.</p>}
          </div>
        </div>
      )}
    </div>
  )
}

export default DustScanner