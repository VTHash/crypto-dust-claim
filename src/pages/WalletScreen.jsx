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
    error,
  } = useWallet()

  const handleConnect = async () => {
    await connect()
  }

  const handleDisconnect = async () => {
    await disconnect()
  }

  return (
    <div className="wallet-screen">
      <div className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">
            <span className="hero-icon">🧹</span> DustClaim
          </h1>
          <p className="hero-subtitle">
            Claim your crypto dust across multiple blockchains
          </p>

          {!isConnected ? (
            <>
              {/* Feature highlights */}
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

              {/* Connect button */}
              <div className="connect-section">
                <button
                  onClick={handleConnect}
                  disabled={loading}
                  className="connect-button"
                >
                  {loading ? (
                    <>
                      <div className="spinner"></div> Connecting...
                    </>
                  ) : (
                    <>
                      <span>🔗</span> Connect Wallet
                    </>
                  )}
                </button>

                {error && <div className="error-message">{error}</div>}

                <p className="supported-wallets">
                  Supports MetaMask, WalletConnect, Coinbase Wallet, and 100+ more.
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Connected state */}
              <div className="connect-section">
                <h2 className="connected-heading">Wallet Connected ✅</h2>
                <p className="connected-address">
                  <strong>Address:</strong> {address}
                </p>
                <p className="connected-chain">
                  <strong>Chain ID:</strong> {chainId}
                </p>

                <button onClick={handleDisconnect} className="connect-button">
                  🔌 Disconnect
                </button>
              </div>

              {/* Chain selector */}
              <div className="supported-chains">
                <h3>Switch Chain</h3>
                <div className="chains-grid">
                  {SUPPORTED_CHAINS.map((chain, idx) => {
                    const id = chain.id ?? chain.chainId
                    const current =
                      chainId?.toLowerCase() === `0x${Number(id).toString(16)}`

                    return (
                      <button
                        key={idx}
                        onClick={() => switchChain(id)}
                        className={`chain-badge ${current ? 'active' : ''}`}
                      >
                        <span className="chain-logo">{chain.logo ?? '⛓️'}</span>
                        <span className="chain-name">
                          {chain.name} {current && '✓'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {/* Supported blockchains */}
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
          <img
            src={chain.logo} // e.g. /logo/ethereum.png (place files in /public/logo)
            alt={`${chain.name} logo`}
            className="chain-logo-img"
          />
        ) : (
          <span className="chain-logo" aria-hidden>⛓️</span>
        )}
        <span className="chain-name">{chain.name}</span>
      </a>
    ))}
  </div>
</section>
 <footer className="app-footer">
  <a
    href="https://hfvprotocol.org/"
    target="_blank"
    rel="noopener noreferrer"
    className="footer-content"
  >
    <img
      src="/logo/hfv-logo.png"
      alt="HFV Logo"
      className="footer-logo"
    />
    <p>© 2022–2025 HFV Protocol Technologies Limited · Transparent by Design</p>
  </a>
</footer>
            </div>
          </div>
        </div>   
  )
}

export default WalletScreen