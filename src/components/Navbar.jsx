import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useWallet } from '../contexts/WalletContext'
import ThemeToggle from './ThemeToggle'
import './Navbar.css'

const Navbar = () => {
  const { address, isConnected, connect, disconnect, loading } = useWallet()
  const location = useLocation()

  const shorten = (addr) => (addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '')
  const isActive = (path) => location.pathname === path

  const handleConnect = async () => {
    if (loading) return
    try {
      await connect()
    } catch (e) {
      console.error('Connect error:', e)
    }
  }

  const handleDisconnect = async () => {
    if (loading) return
    await disconnect()
  }

  return (
    <nav className="navbar">
      {/* Brand */}
      <div className="navbar-brand">
        <Link to="/" className="brand-link">
          <span className="brand-icon">🧹</span>
          <span className="brand-text">DustClaim</span>
        </Link>
      </div>

      {/* Nav links */}
      <div className="navbar-links">
        <Link
          to="/dashboard"
          className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}
        >
          Dashboard
        </Link>
        <Link
          to="/scanner"
          className={`nav-link ${isActive('/scanner') ? 'active' : ''}`}
        >
          Dust Scanner
        </Link>
        <Link
          to="/claim"
          className={`nav-link ${isActive('/claim') ? 'active' : ''}`}
        >
          Claim
        </Link>
      </div>

      {/* Actions: Theme + Wallet */}
      <div className="navbar-actions">
        <div className="theme-toggle-wrapper">
          <ThemeToggle />
        </div>

        {isConnected ? (
          <div className="wallet-chip">
            <span className="wallet-address" title={address}>
              {shorten(address)}
            </span>
            <button
              onClick={handleDisconnect}
              className="btn-disconnect"
              disabled={loading}
              aria-label="Disconnect wallet"
            >
              {loading ? '...' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            className="btn-connect"
            disabled={loading}
            aria-label="Connect wallet"
          >
            {loading ? 'Connecting…' : 'Connect'}
          </button>
        )}
      </div>
    </nav>
  )
}

export default Navbar