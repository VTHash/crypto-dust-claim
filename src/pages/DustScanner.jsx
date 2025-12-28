import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWallet } from '../contexts/WalletContext'
import { useScan } from '../contexts/ScanContext'
import { useSettings } from '../contexts/SettingsContext'

import web3Service from '../services/web3Service'
import batchService from '../services/batchService'
import dexAggregatorService from '../services/dexAggregatorService' // ❗ REQUIRED – DO NOT REMOVE

import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import { NATIVE_LOGOS } from '../services/logoService'
import TokenRow from '../components/TokenRow'
import TxStepsPanel from '../components/TxStepsPanel.jsx'

import './DustScanner.css'

export default function DustScanner() {
  const navigate = useNavigate()
  const { address } = useWallet()
  const { results, setResults } = useScan()
  const { settings } = useSettings()

  const [scanning, setScanning] = useState(false)

  /* ---------------- device detection (used by ClaimScreen) ---------------- */
  const isProbablyMobile = useMemo(() => {
    if (typeof navigator === 'undefined') return false
    const ua = navigator.userAgent.toLowerCase()
    return (
      /android|iphone|ipad|ipod|mobile/.test(ua) ||
      /metamaskmobile/.test(ua)
    )
  }, [])

  /* ---------------- hydrate scan from session ---------------- */
  useEffect(() => {
    if (results.length > 0) return
    try {
      const cached = sessionStorage.getItem('dustclaim:lastScan')
      if (!cached) return
      const parsed = JSON.parse(cached)
      if (Array.isArray(parsed?.dustResults)) {
        setResults(parsed.dustResults)
      }
    } catch {}
  }, [results.length, setResults])

  /* ---------------- chain selection ---------------- */
  const [selectedChains, setSelectedChains] = useState(
    Object.keys(SUPPORTED_CHAINS).reduce((acc, id) => {
      acc[id] = true
      return acc
    }, {})
  )

  const selectedIds = useMemo(
    () =>
      Object.keys(selectedChains)
        .filter((id) => selectedChains[id])
        .map(Number),
    [selectedChains]
  )

  /* ---------------- scan ---------------- */
  const handleScan = async () => {
    if (!address || scanning) return
    setScanning(true)

    try {
      const scan = await web3Service.scanChains(
        selectedIds,
        address,
        settings
      )

      const dustResults = Array.isArray(scan)
        ? scan
        : Array.isArray(scan?.dustResults)
        ? scan.dustResults
        : []

      setResults(dustResults)

      const total = dustResults.reduce(
        (s, x) => s + Number(x.totalValue || 0),
        0
      )

      sessionStorage.setItem(
        'dustclaim:lastScan',
        JSON.stringify({ dustResults, total })
      )
    } catch (e) {
      console.error('[DustScanner] scan failed:', e)
    } finally {
      setScanning(false)
    }
  }

  /* ---------------- build action universe ---------------- */
  const actionUniverse = useMemo(() => {
    const list = []

    for (const chain of results) {
      for (const t of chain.tokenDetails || []) {
        const usd = Number(t.value || 0)
        const bal = Number(t.balance || 0)
        if (bal <= 0) continue

        if (!settings.includeNonDust) {
          const min = Number(settings.tokenMinUSD || 0)
          const max =
            settings.tokenMaxUSD === 0
              ? Infinity
              : Number(settings.tokenMaxUSD)
          if (usd < min || usd > max) continue
        }

        list.push({
          chainId: chain.chainId,
          address: t.address,
          symbol: t.symbol,
          amount: t.balance,
          decimals: t.decimals ?? 18,
          usd
        })
      }
    }

    return list
  }, [
    results,
    settings.includeNonDust,
    settings.tokenMinUSD,
    settings.tokenMaxUSD
  ])

  const totalValue = useMemo(
    () => actionUniverse.reduce((s, x) => s + x.usd, 0),
    [actionUniverse]
  )

  /* ---------------- BUILD CLAIM PLAN (CRITICAL) ---------------- */
  const handleBatchClaim = async () => {
    if (!address) return
    if (actionUniverse.length === 0) return

    const claims = actionUniverse.map((t) => ({
      chainId: t.chainId,
      tokenAddress: t.address,
      amount: t.amount,
      decimals: t.decimals,
      recipient: address
    }))

    let claimPlan = []

    try {
      claimPlan = await batchService.buildClaimPlan(claims, {
        txOrigin: address,
        slippagePct: 1
      })
    } catch (e) {
      console.error('[DustScanner] buildClaimPlan failed:', e)
      return
    }

    if (!Array.isArray(claimPlan) || claimPlan.length === 0) {
      console.warn('[DustScanner] empty claimPlan – aborting navigation')
      return
    }

    /* -------- persist for mobile / refresh safety -------- */
    sessionStorage.setItem(
      'dustclaim:lastClaimPlan',
      JSON.stringify(claimPlan)
    )
    sessionStorage.setItem(
      'dustclaim:lastDevice',
      isProbablyMobile ? 'mobile' : 'desktop'
    )
    sessionStorage.setItem(
      'dustclaim:lastTotal',
      String(totalValue)
    )

    navigate('/claim', {
      state: {
        claimPlan,
        dustResults: results,
        totalDustValue: totalValue,
        device: isProbablyMobile ? 'mobile' : 'desktop'
      }
    })
  }

  /* ---------------- UI ---------------- */
  return (
    <div className="dust-scanner">
      <div className="scanner-header">
        <h1>Multi-Chain Dust Scanner</h1>
        <p>Scan and claim across all supported chains</p>
      </div>

      <div className="scan-controls">
        <button
          className="scan-button"
          disabled={scanning || selectedIds.length === 0}
          onClick={handleScan}
        >
          {scanning
            ? 'Scanning…'
            : `Scan ${selectedIds.length} Chains`}
        </button>
      </div>

      {results.length > 0 && (
        <div className="results-section">
          <h2>Total Found: ${totalValue.toFixed(2)}</h2>

          {results.map((r) => {
            const meta = SUPPORTED_CHAINS[r.chainId] || {}
            const logo =
              meta.logo ||
              NATIVE_LOGOS[r.chainId] ||
              '/logos/chains/generic.png'

            return (
              <div key={r.chainId} className="chain-result-card">
                <img src={logo} alt={meta.name} />
                <strong>{meta.name}</strong>

                {(r.tokenDetails || []).slice(0, 5).map((t, i) => (
                  <TokenRow
                    key={`${r.chainId}-${i}`}
                    token={{ ...t, chainId: r.chainId }}
                  />
                ))}
              </div>
            )
          })}

          <button
            className="claim-button"
            onClick={handleBatchClaim}
            disabled={actionUniverse.length === 0}
          >
            🧹 Batch Claim (${totalValue.toFixed(2)})
          </button>

          <TxStepsPanel />
        </div>
      )}
    </div>
  )
      }
