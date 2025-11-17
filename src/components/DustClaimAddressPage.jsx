import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './DustClaimAddressPage.css' // optional, if you want separate styling

const truncateAddress = (addr) => {
  if (!addr) return ''
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    alert('Link copied to clipboard')
  } catch (err) {
    console.error('Copy failed', err)
  }
}

const DustClaimAddressPage = ({ address }) => {
  const navigate = useNavigate()

  const normalizedAddress = useMemo(
    () => (address ? address.trim() : ''),
    [address]
  )

  // Full URL for this page – used for share + QR
  const pageUrl = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return window.location.href
  }, [normalizedAddress])

  // Local view tracking (per browser)
  const [localViews, setLocalViews] = useState(0)

  useEffect(() => {
    if (!normalizedAddress) return
    const key = `dustclaim:views:${normalizedAddress.toLowerCase()}`
    const current = Number(window.localStorage.getItem(key) || '0') + 1
    window.localStorage.setItem(key, String(current))
    setLocalViews(current)

    // 🔹 OPTIONAL: send to your backend later
    // fetch('https://api.dustclaim.xyz/track-view', {
    // method: 'POST',
    // headers: { 'Content-Type': 'application/json' },
    // body: JSON.stringify({ address: normalizedAddress })
    // }).catch(() => {})
  }, [normalizedAddress])

  // QR toggle
  const [showQR, setShowQR] = useState(false)

  const handleShare = async () => {
    if (!pageUrl) return
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'DustClaim – Address Dust Overview',
          text: `View dust balances for ${normalizedAddress} on DustClaim.`,
          url: pageUrl
        })
      } else {
        await copyToClipboard(pageUrl)
      }
    } catch (err) {
      console.error('Share failed', err)
    }
  }

  const handleScanThisAddress = () => {
    // If your scanner expects a query param, adjust this:
    navigate(`/scanner?address=${normalizedAddress}`)
  }

  const etherscanUrl = `https://etherscan.io/address/${normalizedAddress}`

  return (
    <div className="address-page">
      {/* HEADER / CARD TOP */}
      <section className="address-hero">
        <div className="address-hero-left">
          <div className="address-logo-badge">
            <img
              src="/logo/ethereum.png"
              alt="Ethereum"
              className="address-logo"
            />
          </div>
          <div>
            <h1 className="address-title">DustClaim – Address Overview</h1>
            <p className="address-subtitle">
              Scan and consolidate dust balances across Ethereum and 30+ EVM
              chains.
            </p>
            <p className="address-line">
              <span className="address-label">Address</span>
              <span className="address-value">
                {truncateAddress(normalizedAddress)}
              </span>
              <button
                className="address-copy-btn"
                onClick={() => copyToClipboard(normalizedAddress)}
              >
                Copy
              </button>
              <a
                href={etherscanUrl}
                target="_blank"
                rel="noreferrer"
                className="address-etherscan-link"
              >
                View on Etherscan
              </a>
            </p>
            <p className="address-meta">
              Views from this browser: <strong>{localViews}</strong> · Global
              stats coming soon.
            </p>
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div className="address-hero-actions">
          <button
            className="btn btn-primary"
            onClick={handleScanThisAddress}
          >
            🔍 Scan this address
          </button>
          <button className="btn btn-secondary" onClick={handleShare}>
            🔗 Share link
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowQR((prev) => !prev)}
          >
            📱 {showQR ? 'Hide QR' : 'Show QR'}
          </button>
        </div>
      </section>

      {/* QR CODE (no extra dependency – using remote generator) */}
      {showQR && (
        <section className="address-qr-section">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
              pageUrl
            )}`}
            alt="QR code for this DustClaim address link"
            className="address-qr-image"
          />
          <p className="address-qr-caption">
            Scan this QR to open the DustClaim address page on another device.
          </p>
        </section>
      )}

      {/* EXISTING CONTENT – tuned for card view */}
      <section className="address-body">
        <h2>Dust Balances by Chain</h2>
        <p>
          Small token balances (&quot;dust&quot;) detected for this address on
          each supported chain will appear here once scanned from the main
          app. DustClaim supports Ethereum and 30+ EVM networks.
        </p>

        <p className="address-empty-note">
          No dust currently detected for this address on supported chains.
        </p>

        <h2>Consolidation Options</h2>
        <p>
          All actions are non-custodial. You confirm each transaction from your
          wallet. When dust is detected, you&apos;ll be able to:
        </p>
        <ul>
          <li>
            <strong>Claim Dust:</strong> Send detected dust tokens back to this
            address, chain by chain.
          </li>
          <li>
            <strong>Swap &amp; Consolidate:</strong> Where supported, swap dust
            into one token per chain (e.g. WETH, WBNB, or a stablecoin).
          </li>
          <li>
            <strong>Batch Actions:</strong> Group multiple claims/swaps into
            fewer clicks to save time.
          </li>
        </ul>

        <h2>FAQ</h2>
        <details>
          <summary>What is DustClaim?</summary>
          <p>
            DustClaim is a non-custodial tool that scans supported blockchains
            for dust-level token balances linked to your wallet. It helps you
            view, claim, or consolidate tokens that are too small to notice in
            regular portfolio views.
          </p>
        </details>
        <details>
          <summary>How does DustClaim work?</summary>
          <p>
            DustClaim connects to your wallet, queries balances across
            Ethereum and 30+ EVM networks, and highlights tokens that fall
            below a configurable dust threshold. You decide whether to claim or
            consolidate.
          </p>
        </details>
        <details>
          <summary>Do you store my private keys or control my funds?</summary>
          <p>
            No. DustClaim is fully non-custodial. Transactions are always
            initiated and signed in your wallet (MetaMask, WalletConnect, etc.).
            We never have access to your private keys.
          </p>
        </details>
        <details>
          <summary>Is DustClaim free to use?</summary>
          <p>
            The app itself is free to use. You only pay standard gas fees on
            each chain for the transactions you choose to execute.
          </p>
        </details>
      </section>
    </div>
  )
}

export default DustClaimAddressPage