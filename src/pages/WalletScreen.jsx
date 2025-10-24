import React from 'react'
import { useWallet } from '../contexts/WalletContext'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import './WalletScreen.css'

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
        <p>Claim your crypto dust across multiple blockchains</p>
      </section>

      {/* CONNECT / INFO */}
      {!isConnected ? (
        <section>
          <div className="feature-grid">
            <div className="feature-card">
              <div className="feature-icon">🔍</div>
              <h3>Multi-Chain Scan</h3>
              <p>Scan 8+ blockchains for dust in one click</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">💸</div>
              <h3>Gas Optimization</h3>
              <p>Save on fees with batch transactions</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🛡️</div>
              <h3>100% Secure</h3>
              <p>Non-custodial — we never hold your funds</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <h3>Instant Claims</h3>
              <p>Claim all your dust in one transaction</p>
            </div>
          </div>

          <div className="connect-section">
            <button onClick={handleConnect} disabled={loading} className="connect-button">
              {loading ? (<><div className="spinner" /> Connecting…</>) : (<><span>🔗</span> Connect Wallet</>)}
            </button>

            {error && <div className="error-message">{error}</div>}

            <p className="supported-wallets">
              Supports MetaMask, WalletConnect, Coinbase Wallet, and 100+ more.
            </p>
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
        <a
          href="https://hfvprotocol.org/"
          target="_blank"
          rel="noopener noreferrer"
          className="footer-content"
        >
          <img src="/logo/hfv-logo.png" alt="HFV Logo" className="footer-logo" />
          <p>© 2022–2025 HFV Protocol Technologies Limited · Transparent by Design</p>
        </a>
      </footer>
    </main>
  )
}

export default WalletScreen