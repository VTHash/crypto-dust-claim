// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import App from './App.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import { WalletProvider } from './contexts/WalletContext.jsx'

import './styles/global.css'

// NOTE:
// Do NOT initialize Reown AppKit here.
// It is created *once* inside src/services/walletService.js via EthersAdapter.

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <WalletProvider>
            <App />
          </WalletProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>
)