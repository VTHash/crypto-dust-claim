// src/components/Navbar.jsx
import React, { useState, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useWallet } from '../contexts/WalletContext'
import ThemeToggle from './ThemeToggle'
import DebugWalletPanel from './DebugWalletPanel'
import { useSettings } from '../contexts/SettingsContext'
import SettingsModal from './SettingsModal'
import './Navbar.css'

const shorten = (addr) => (addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '')

function ConnDebug() {
  const w = useWallet()
  const payload = useMemo(
    () => ({
      connected: w.isConnected,
      address: w.address,
      chainId: w.chainId,
      loading: w.loading,
    }),
    [w.isConnected, w.address, w.chainId, w.loading]
  )
  return (
    <pre style={{ fontSize: 10, opacity: 0.7, marginLeft: 8 }}>
      {JSON.stringify(payload, null, 2)}
    </pre>
  )
}

export default function Navbar() {
  const { address, isConnected, connect, disconnect, loading } = useWallet()
  const location = useLocation()
  const [showDebug, setShowDebug] = useState(false)

  // 🔧 settings modal control comes from SettingsContext
  const { open, setOpen } = useSettings()

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
    try {
      await disconnect()
    } catch (e) {
      console.error('Disconnect error:', e)
    }
  }

  return (
    <>
      <nav className="navbar">
        {/* Brand */}
        <div className="navbar-center">
          <Link to="/" className="brand-link">
            <span className="brand-icon">🧹</span>
            <span className="brand-text">DustClaim</span>
          </Link>
        </div>

        {/* Middle: nav links + settings + theme + wallet */}
        <div className="navbar-middle">
          <Link to="/dashboard" className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}>
            Dashboard
          </Link>
          <Link to="/scanner" className={`nav-link ${isActive('/scanner') ? 'active' : ''}`}>
            Dust Scanner
          </Link>
          <Link to="/claim" className={`nav-link ${isActive('/claim') ? 'active' : ''}`}>
            Claim
          </Link>

          {/* Settings button (opens modal) */}
          <button
            type="button"
            className="btn-settings"
            title="Settings"
            aria-label="Open settings"
            onClick={() => setOpen(true)}
          >
            ⚙️ Settings
          </button>

          <div className="theme-toggle-wrapper">
            <ThemeToggle />
          </div>

          {isConnected ? (
            <div className="wallet-chip">
              <span className="wallet-address" title={address}>{shorten(address)}</span>
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

      {/* Settings Modal lives here so it’s available app-wide */}
      <SettingsModal open={open} onClose={() => setOpen(false)} />

      {/* Floating Debug panel toggle (dev only) */}
      {import.meta.env.MODE !== 'production' && (
        <>
          <button
            style={{
              position: 'fixed',
              right: 16,
              bottom: 16,
              background: '#1f8bff',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer',
              zIndex: 9999
            }}
            onClick={() => setShowDebug((s) => !s)}
          >
            {showDebug ? 'Hide Debug' : 'Show Debug'}
          </button>

          {showDebug && (
            <div style={{ position: 'fixed', right: 12, bottom: 60, zIndex: 9999 }}>
              <DebugWalletPanel />
            </div>
          )}
        </>
      )}
    </>
  )
}






