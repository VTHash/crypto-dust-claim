import React, { useEffect, useState } from "react";
import { getTokenLogo, resolveTokenLogo } from "../services/logoService";
import Shimmer from "./Shimmer";
import "./TokenRow.css";

const TokenRow = ({ token }) => {
  if (!token) return null;

  const chainId = token.chainId || 1;
  const address = token.address;
  const symbol = token.symbol;

  // Initial fast guess logo
  const [logo, setLogo] = useState(getTokenLogo(address, symbol, chainId));
  const [loadingLogo, setLoadingLogo] = useState(true);

  // Async real resolution
  useEffect(() => {
    let cancelled = false;

    async function loadLogo() {
      try {
        const url = await resolveTokenLogo(address, symbol, chainId);
        if (!cancelled) {
          setLogo(url);
          setLoadingLogo(false);
        }
      } catch {
        if (!cancelled) setLoadingLogo(false);
      }
    }

    loadLogo();
    return () => {
      cancelled = true;
    };
  }, [address, symbol, chainId]);

  const isDust = parseFloat(token.balance || 0) < 0.01;
  const formattedBalance = parseFloat(token.balance || 0).toFixed(6);
  const usd = token.value ? `$${token.value.toFixed(2)}` : "";

  return (
    <div className={`token-row ${isDust ? "dust" : ""}`}>
      <div className="token-left">
        {loadingLogo ? (
          <Shimmer width="28px" height="28px" radius="50%" />
        ) : (
          <img src={logo} alt={symbol} className="token-logo" />
        )}
        <span className="token-symbol">{symbol}</span>
      </div>

      <div className="token-right">
        <span className="token-balance">{formattedBalance}</span>
        <span className="token-value">{usd}</span>
        {isDust && <span className="dust-badge">dust</span>}
      </div>
    </div>
  );
};

export default TokenRow;