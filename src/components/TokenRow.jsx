import React from 'react';
import { getTokenLogo } from '../services/logoService';
import './TokenRow.css';

/**
 * TokenRow component
 * - Displays token logo (native or ERC20)
 * - Shows symbol, balance, USD value
 * - Marks dust balances with a badge
 *
 * Props:
 * token: { address, symbol, balance, value }
 * chainId: number
 */
const TokenRow = ({ token, chainId }) => {
  if (!token) return null;

  const symbol = token.symbol || 'UNKNOWN';
  const balance = Number(token.balance || 0);
  const usdValue = Number(token.value || 0);

  // Format numbers
  const formattedBalance = balance.toFixed(balance > 1 ? 4 : 6);
  const formattedUSD = usdValue ? `$${usdValue.toFixed(2)}` : '';

  // Dust condition (< $0.01 or super tiny)
  const isDust =
    balance > 0 &&
    (usdValue < 0.01 || balance < 0.000001);

  // Get correct logo URL
  const logo = getTokenLogo(token.address, symbol, chainId);

  return (
    <div className={`token-row ${isDust ? 'dust' : ''}`}>
      <div className="token-left">
        <img
          src={logo}
          alt={symbol}
          className="token-logo"
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = '/logos/tokens/generic-token.png';
          }}
        />
        <span className="token-symbol">{symbol}</span>
      </div>

      <div className="token-right">
        <span className="token-balance">{formattedBalance}</span>
        <span className="token-value">{formattedUSD}</span>

        {isDust && <span className="dust-badge">dust</span>}
      </div>
    </div>
  );
};

export default TokenRow;