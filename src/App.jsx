import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useWallet } from './contexts/WalletContext'

// Components
import Navbar from './components/Navbar'

// Pages
import WalletScreen from './pages/WalletScreen'
import Dashboard from './pages/Dashboard'
import DustScanner from './pages/DustScanner'
import ClaimScreen from './pages/ClaimScreen'

// Styles
import './App.css'

const App = () => {
  const { isConnected } = useWallet()

  return (
    <div className="app">
      {/* Always show navbar so ThemeToggle is visible on WalletScreen too */}
       <Navbar />

      <main className="main-content">
        {/* <DebugStatus /> */}
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
          {/* Fallback for unmatched paths */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App