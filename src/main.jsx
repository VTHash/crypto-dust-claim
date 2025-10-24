import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import App from './App.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import { WalletProvider } from './contexts/WalletContext.jsx'
import './styles/global.css'

// --- Reown AppKit Imports ---
import { createAppKit } from '@reown/appkit/react'
import { wagmiAdapter, projectId, networks } from './config/appkit.js'

// --- Initialize AppKit Modal ---
createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks,
  metadata: {
    name: 'DustClaim',
    description: 'Crypto Dust Claim & Scanner',
    url: window.location.origin,
    icons: ['https://fav.farm/🧹'],
  },
  features: {
    analytics: true,
  },
  themeMode: 'system', // syncs with your ThemeProvider dark/light toggle
})

// --- React Query Client ---
const queryClient = new QueryClient()

// --- Render Application ---
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <WagmiProvider config={wagmiAdapter.wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <WalletProvider>
              <App />
            </WalletProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  </React.StrictMode>
)