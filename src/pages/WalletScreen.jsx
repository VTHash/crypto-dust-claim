// src/pages/WalletScreen.jsx
import React from 'react'
import { useWallet } from '../contexts/WalletContext'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import './WalletScreen.css'

/** Lightweight, accessible accordion card */
function InfoCard({ icon, title, children, defaultOpen = false }) {
  return (
    <details className="info-card" {...(defaultOpen ? { open: true } : {})}>
      <summary className="info-card__summary">
        <span className="info-card__icon">{icon}</span>
        <span className="info-card__title">{title}</span>
        <span className="info-card__chev" aria-hidden>▾</span>
      </summary>
      <div className="info-card__content">{children}</div>
    </details>
  )
}

const WalletScreen = () => {
  const {
    isConnected,
    address,
    chainId,
    connect,
    disconnect,
    switchChain,
    loading,
    error
  } = useWallet()

  const handleConnect = async () => { await connect() }
  const handleDisconnect = async () => { await disconnect() }

  const isCurrentChain = (id) => {
    const hex = '0x' + Number(id).toString(16)
    return String(chainId || '').toLowerCase() === hex
  }

  return (
    <main className="container">
      {/* HERO */}
      <section className="hero">
        <h1><span className="hero-icon">🧹</span> DustClaim</h1>
        <li>Claim your crypto dust across multiple blockchains.</li>
      </section>

      {/* CONNECT / INFO */}
      {!isConnected ? (
        <section>
          {/* Quick feature highlights */}
          <div className="feature-grid">
            <div className="feature-card">
              <div className="feature-icon">🔍</div>
              <h3>Multi-Chain Scan</h3>
              <p>Scan 8+ chains(more chains upcoming) for native & ERC-20 balances.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">💱</div>
              <h3>Mini-Exchange</h3>
              <p>Optionally swap dust into one token per chain and claim.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🧩</div>
              <h3>Batch Actions</h3>
              <p>Batch claim or swap, chain by chain, in fewer clicks.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🛡️</div>
              <h3>Non-Custodial</h3>
              <p>Your assets stay in your wallet; you approve every tx.</p>
            </div>
          </div>

          {/* NEW: 4 expandable “How it works” cards */}
          <div className="info-cards">
            <InfoCard icon="🧠" title="1) What DustClaim does (at a glance)" defaultOpen>
              <ul className="info-list">
                <li>Connect your wallet and <strong>scan 8+ chains</strong> for small, forgotten balances (“dust”).</li>
                <li>We show <strong>native</strong> (e.g., ETH, BNB) and <strong>ERC-20 tokens</strong> with live USD values & real logos.</li>
                <li>You can <strong>claim as-is</strong> (send tokens back to you), or <strong>swap & consolidate</strong> into one token per chain first (mini-exchange).</li>
                <li>Every action is <strong>non-custodial</strong> — you sign each transaction from your wallet.</li>
              </ul>
            </InfoCard>

            <InfoCard icon="✨" title="2) What counts as dust & what you can claim">
              <ul className="info-list">
                <li><strong>Dust</strong> = very small balances that aren’t worth a normal swap alone.</li>
                <li>By default we flag:
                  <ul className="info-sublist">
                    <li>Native balances &lt; <code>0.001</code> (e.g., 0.0008 ETH)</li>
                    <li>ERC-20 balances with low USD value (e.g., &lt; $0.25)</li>
                  </ul>
                </li>
                <li>You can change these thresholds anytime in <strong>Settings</strong> (⚙️ in the navbar).</li>
                <li><strong>Claimable</strong> = tokens we can either send back directly or swap first (depending on your mode).</li>
                <li>Some tokens require an <strong>approve</strong> step; we handle that for you with clear prompts.</li>
              </ul>
            </InfoCard>

            <InfoCard icon="💱" title="3) Mini-Exchange: swap dust into a single token (per chain)">
              <ul className="info-list">
                <li>Turn on <strong>“Swap” mode</strong> in Settings to convert dust into a token of your choice (e.g., USDC) <em>for each chain</em>.</li>
                <li>We fetch quotes from aggregators (1inch / 0x / Paraswap); you’ll see a single button to execute.</li>
                <li>Pick the <strong>target token per chain</strong> (default is USDC where available). You can also include <em>non-dust</em> small balances.</li>
                <li>After swapping, balances consolidate into one token and you can <strong>claim</strong> the results directly to your wallet.</li>
                <li>Each chain executes separately (for security and reliability). You’ll sign one or more txs per chain.</li>
              </ul>
            </InfoCard>

            <InfoCard icon="🧾" title="4) What happens when I press Execute? (security, fees & UX)">
              <ul className="info-list">
                <li>We <strong>simulate</strong> and show the steps: approvals (if needed), swaps (optional), and final claim transfers.</li>
                <li>You’ll confirm <strong>every transaction</strong> in your wallet; nothing moves without your signature.</li>
                <li>Fees: you pay normal network gas fees; swapping also pays DEX fees/price impact (shown in quotes).</li>
                <li>We never take custody or add extra fees — it’s <strong>your wallet → router/contract → your wallet</strong>.</li>
                <li>If a step fails (e.g., liquidity too low), we show an error and skip that token while continuing the rest.</li>
              </ul>
            </InfoCard>
          </div>

          <div className="connect-section">
            <button onClick={handleConnect} disabled={loading} className="connect-button">
              {loading ? (<><div className="spinner" /> Connecting…</>) : (<><span>🔗</span> Connect Wallet</>)}
            </button>

            {error && <div className="error-message">{error}</div>}

            <li> Supported-Wallets
              Supports MetaMask, WalletConnect, Coinbase Wallet, and 100+ more.
            </li>
          </div>
        </section>
      ) : (
        <>
          <div className="connect-section">
            <h2 className="connected-heading">Wallet Connected ✅</h2>
            <p className="connected-address"><strong>Address:</strong> {address}</p>
            <p className="connected-chain"><strong>Chain ID:</strong> {chainId}</p>
            <button onClick={handleDisconnect} className="connect-button">🔌 Disconnect</button>
          </div>

          {/* Same 4 cards still available after connect */}
          <div className="info-cards">
            <InfoCard icon="🧠" title="What DustClaim does (recap)" defaultOpen>
              <p>Scan, optionally swap (“mini-exchange”), and claim small balances across 15+ chains — fully non-custodial.</p>
            </InfoCard>
            <InfoCard icon="✨" title="Dust thresholds & claimability">
              <p>Defaults: native &lt; 0.001, small ERC-20s by USD value. Tweak anytime in ⚙️ Settings.</p>
            </InfoCard>
            <InfoCard icon="💱" title="Swap mode (optional)">
              <p>Convert many small tokens into a single token per chain (e.g., USDC) before claiming — easier tracking.</p>
            </InfoCard>
            <InfoCard icon="🧾" title="Execution & security">
              <p>You sign each step, pay normal gas, and funds never leave your control.</p>
            </InfoCard>
          </div>

          {/* Switch Chain */}
          <div className="supported-chains">
            <h3>Switch Chain</h3>
            <div className="chains-grid">
              {Object.entries(SUPPORTED_CHAINS).map(([id, chain]) => (
                <button
                  key={id}
                  onClick={() => switchChain(Number(id))}
                  className={`chain-badge ${isCurrentChain(id) ? 'active' : ''}`}
                >
                  {chain.logo ? (
                    <img src={chain.logo} alt={`${chain.name} logo`} className="chain-logo-img" />
                  ) : (
                    <span className="chain-logo" aria-hidden>⛓️</span>
                  )}
                  <span className="chain-name">
                    {chain.name} {isCurrentChain(id) && '✓'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Supported blockchains (links to explorers) */}
      <section className="supported-chains">
        <h3>Supported Blockchains</h3>
        <div className="chains-grid">
          {Object.entries(SUPPORTED_CHAINS).map(([id, chain]) => (
            <a
              key={id}
              className="chain-badge"
              href={chain.explorer || '#'}
              target="_blank"
              rel="noopener noreferrer"
              title={chain.explorer ? `Open ${chain.name} explorer` : chain.name}
              onClick={(e) => { if (!chain.explorer) e.preventDefault() }}
            >
              {chain.logo ? (
                <img src={chain.logo} alt={`${chain.name} logo`} className="chain-logo-img" />
              ) : (
                <span className="chain-logo" aria-hidden>⛓️</span>
              )}
              <span className="chain-name">{chain.name}</span>
            </a>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="app-footer">
        <div className="footer-content">
          <a
            href="https://hfvprotocol.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-brand"
          >
            <img
              src="/logo/hfv-logo.png"
              alt="HFV Logo"
              className="footer-logo"
            />
            <p>© 2022–2025 HFV Protocol Technologies Limited • Transparent by Design</p>
          </a>

          <div className="footer-links">
            <a
              href="https://github.com/VTHash/crypto-dust-claim"
              target="_blank"
              rel="noopener noreferrer"
              title="View Source on GitHub"
            >
              <img
                src="/logo/github-mark.png"
                alt="GitHub"
                className="footer-icon"
              />
            </a>

            <a
              href="https://x.com/HFVProtocol"
              target="_blank"
              rel="noopener noreferrer"
              title="Follow us on X (Twitter)"
            >
              <img
                src="/logo/X.png"
                alt="Twitter"
                className="footer-icon"
              />
            </a>
          </div>
        </div>
      </footer>
    </main>
  )
}

export default WalletScreen