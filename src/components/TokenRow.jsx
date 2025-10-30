import React from 'react'
import { getTokenLogo } from '../services/logoService'
import './TokenRow.css'

const TokenRow = ({ token }) => {
  if (!token) return null

  const logo = getTokenLogo(token.address, token.symbol)
  const isDust = parseFloat(token.balance || 0) < 0.01
  const formattedBalance = parseFloat(token.balance || 0).toFixed(6)
  const usd = token.value ? `$${token.value.toFixed(2)}` : ''

  return (
    <div className={`token-row ${isDust ? 'dust' : ''}`}>
      <div className="token-left">
        <img src={logo} alt={token.symbol} className="token-logo" />
        <span className="token-symbol">{token.symbol}</span>
      </div>
      <div className="token-right">
        <span className="token-balance">{formattedBalance}</span>
        <span className="token-value">{usd}</span>
        {isDust && <span className="dust-badge">dust</span>}
      </div>
    </div>
  )
}

export default TokenRow
