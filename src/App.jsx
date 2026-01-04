import React, { useEffect } from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { useWallet } from './contexts/WalletContext'

// Components
import Navbar from './components/Navbar'
import DustClaimAddressPage from './components/DustClaimAddressPage'

// Pages
import EmissionsLiquidity from './pages/EmissionsLiquidity'
import WalletScreen from './pages/WalletScreen'
import Dashboard from './pages/Dashboard'
import DustScanner from './pages/DustScanner'
import ClaimScreen from './pages/ClaimScreen'
import AnalyticsDashboard from './pages/AnalyticsDashboard'
import TransparencyDashboard from './pages/TransparencyDashboard' // ✅ NEW

import GlobalStatsWidget from './components/GlobalStatsWidget'
import TipPill from './components/TipPill'

// Legal pages
import PrivacyPolicy from "./legal/PrivacyPolicy";
import TermsOfService from "./legal/TermsOfService";
import CookiePolicy from "./legal/CookiePolicy";
import LegalDisclaimers from './legal/LegalDisclaimers'

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

// ===== NEW: MetaMask deep link CTA (top-of-app button) =====
const METAMASK_DEEPLINK = "https://metamask.app.link/dapp/dustclaim.eth.limo";

function hasMetaMask() {
  return (
    typeof window !== "undefined" &&
    typeof window.ethereum !== "undefined" &&
    window.ethereum.isMetaMask === true
  );
}

function openClaimMetaMaskOnly() {
  // Desktop with MetaMask extension: stay in the same browser/tab
  if (hasMetaMask()) {
    // go to your claim route/page normally
    window.location.assign("/claim");
    return;
  }

  // Otherwise: send to MetaMask in-app browser
  window.location.href = METAMASK_DEEPLINK;
}

const DailyDustCta = () => (
  <div className="daily-dust-cta">
  <button className="daily-dust-btn" onClick={openClaimMetaMaskOnly}>
    Claim your daily DUST on Linea
  </button>

  <div className="daily-dust-sub">
    Desktop: MetaMask extension required. Mobile: opens in MetaMask.
  </div>
</div>
)

const App = () => {
  const { isConnected } = useWallet()

  // Count a "view" whenever the app loads
  useEffect(() => {
    fetch('/.netlify/functions/stats-view-supabase').catch(() => {
      // ignore failures so the app never breaks
    })
  }, [])

  return (
    <div className="app">
      {/* Always show navbar so ThemeToggle & wallet connect are available */}
      <Navbar />

      {/* NEW: top CTA button (perfect mobile fit) */}
      <DailyDustCta />

      <main className="main-content">
        <GlobalStatsWidget /> {/* <-- stats bar always visible */}
        <Routes>
          {/* Default route */}
          <Route
            path="/"
            element={isConnected ? <Dashboard /> : <WalletScreen />}
          />

          <Route
            path="/AnalyticsDashboard"
            element={<AnalyticsDashboard />}
          />

          {/* ✅ NEW: Public read-only transparency dashboard */}
          <Route
            path="/transparency"
            element={<TransparencyDashboard />}
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

          {/* Legal pages */}
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/cookies" element={<CookiePolicy />} />
          <Route path="/legal" element={<LegalDisclaimers />} />
          <Route path="/emissions" element={<EmissionsLiquidity />} />
          <Route path="/transparency" element={<TransparencyDashboard />} />
          {/* Fallback for unmatched paths */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <TipPill />
    </div>
  )
}

export default App