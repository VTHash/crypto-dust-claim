import React, { useEffect } from 'react'
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
import GlobalStatsWidget from './components/GlobalStatsWidget'
import AnalyticsDashboard from './pages/AnalyticsDashboard'
// Styles
import './App.css'

// Wrapper to read :address and pass it to the DustClaimAddressPage
const DustClaimAddressRoute = () => {
  const { address } = useParams()

  // Fallback default (your main DustClaim tracking address)
  const targetAddress =
    address || '0xC73E2EE769b3CDc5c843093470b5Cc17d89D9640'

  // DustClaimAddressPage is responsible for using your real dust scanner
  return <DustClaimAddressPage address={targetAddress} />
}

const App = () => {
  const { isConnected } = useWallet()

  // Count a "view" whenever the app loads
  useEffect(() => { fetch('/.netlify/functions/stats-view').catch(() => { 
    // ignore failures so the app never breaks
  })
  }, [])
  
  return (
    <div className="app">
      {/* Always show navbar so ThemeToggle & wallet connect are available */}
      <Navbar />

      <main className="main-content">
        <GlobalStatsWidget /> {/* <-- stats bar always visible */}
        <Routes>
          {/* Default route */}
          <Route
            path="/"
            element={isConnected ? <Dashboard /> : <WalletScreen />}
          />

          {/* Protected pages (require wallet connection) */}
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

          {/* NEW: DustClaim address view – ALWAYS accessible for Etherscan card */}
          <Route path="/address/:address" element={<DustClaimAddressRoute />} />

          {/* Fallback for unmatched paths */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App