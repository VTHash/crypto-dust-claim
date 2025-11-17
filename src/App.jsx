import React from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { useWallet } from './contexts/WalletContext'

// Components
import Navbar from './components/Navbar'
import DustClaimAddressPage from './components/DustClaimAddressPage'

// Pages
import WalletScreen from './pages/WalletScreen'
import Dashboard from './pages/Dashboard'
import DustScanner from './pages/DustScanner'
import ClaimScreen from './pages/ClaimScreen'

// Styles
import './App.css'

// Wrapper to read :address and pass it to your real DustClaimAddressPage
const DustClaimAddressRoute = () => {
  const { address } = useParams()

  // Fallback default (your main DustClaim tracking address)
  const targetAddress =
    address || '0xC73E2EE769b3CDc5c843093470b5Cc17d89D9640'

  // DustClaimAddressPage internally uses YOUR real dust scanner hooks
  return <DustClaimAddressPage address={targetAddress} />
}

const App = () => {
  const { isConnected } = useWallet()

  return (
    <div className="app">
      <Navbar />

      <main className="main-content">
        <Routes>
          {/* Default route */}
          <Route
            path="/"
            element={isConnected ? <Dashboard /> : <WalletScreen />}
          />

          {/* Protected pages */}
          <Route
            path="/dashboard"
            element={isConnected ? <Dashboard /> : <Navigate to="/" replace />}
          />

          <Route
            path="/scanner"
            element={isConnected ? <DustScanner /> : <Navigate to="/" replace />}
          />

          <Route
            path="/claim"
            element={isConnected ? <ClaimScreen /> : <Navigate to="/" replace />}
          />

          {/* NEW: DustClaim address link (for Etherscan card) */}
          <Route
            path="/address/:address"
            element={
              isConnected ? (
                <DustClaimAddressRoute />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App