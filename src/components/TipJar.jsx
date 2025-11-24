import React, { useState } from 'react';
import {
  TIP_CHAINS,
  TIP_DEFAULT_CHAIN_ID,
  TIP_SUGGESTED_AMOUNTS,
  UNIVERSAL_TIP_ADDRESS,
} from '../config/TipConfig';
import { useWallet } from '../contexts/WalletContext';
import walletService from '../services/walletService';
import './TipJar.css';

const TipJar = () => {
  const { address } = useWallet();

  const [chainId, setChainId] = useState(TIP_DEFAULT_CHAIN_ID);
  const [amount, setAmount] = useState(TIP_SUGGESTED_AMOUNTS[0]);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const chain = TIP_CHAINS[chainId] || TIP_CHAINS[TIP_DEFAULT_CHAIN_ID];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(chain.address || UNIVERSAL_TIP_ADDRESS);
      setCopied(true);
      setStatusMsg('Address copied');
      setTimeout(() => {
        setCopied(false);
        setStatusMsg('');
      }, 1500);
    } catch {
      setCopied(false);
    }
  };

  const handleSendTip = async () => {
    try {
      setStatusMsg('');
      if (!address) {
        setStatusMsg('Connect wallet to send a tip.');
        return;
      }

      const val = parseFloat(amount || '0');
      if (!Number.isFinite(val) || val <= 0) {
        setStatusMsg('Enter a valid amount.');
        return;
      }

      setSending(true);
      setStatusMsg('Preparing tip transaction…');

      // Ensure correct chain
      const switched = await walletService.switchChain?.(Number(chainId));
      if (switched && switched.success === false) {
        setSending(false);
        setStatusMsg(switched.error || 'Failed to switch network.');
        return;
      }

      // Convert amount (in ETH/MATIC/etc) to wei hex string
      const wei = BigInt(Math.floor(val * 1e18)); // simple 18-decimal assumption
      const tx = {
        to: chain.address || UNIVERSAL_TIP_ADDRESS,
        value: `0x${wei.toString(16)}`,
      };

      const res = await walletService.sendTransaction(tx);

      if (res?.success) {
        setStatusMsg('Thanks for the tip! 💚');
      } else {
        setStatusMsg(res?.error || 'Transaction failed or rejected.');
      }
    } catch (err) {
      console.error('Tip send error:', err);
      setStatusMsg(err?.message || 'Unexpected error while sending tip.');
    } finally {
      setSending(false);
    }
  };

  const selectAmount = (val) => {
    setAmount(val);
  };

  return (
    <div className="tipjar-card">
      <div className="tipjar-header">
        <span className="tipjar-emoji">⚡</span>
        <div>
          <h3 className="tipjar-title">Support DustClaim</h3>
          <p className="tipjar-subtitle">
            If DustClaim helped you recover value, you can send a small multi-chain tip.
          </p>
        </div>
      </div>

      {/* Chain selector */}
      <div className="tipjar-row">
        <label className="tipjar-label">Network</label>
        <select
          className="tipjar-select"
          value={chainId}
          onChange={(e) => setChainId(Number(e.target.value))}
        >
          {Object.entries(TIP_CHAINS).map(([id, c]) => (
            <option key={id} value={Number(id)}>
              {c.label} ({c.symbol})
            </option>
          ))}
        </select>
      </div>

      {/* Amount selector */}
      <div className="tipjar-row">
        <label className="tipjar-label">
          Tip amount ({chain.symbol})
        </label>
        <div className="tipjar-amounts">
          {TIP_SUGGESTED_AMOUNTS.map((val) => (
            <button
              key={val}
              type="button"
              className={`tipjar-amount-btn ${amount === val ? 'active' : ''}`}
              onClick={() => selectAmount(val)}
            >
              {val}
            </button>
          ))}
          <input
            type="number"
            min="0"
            step="0.0001"
            className="tipjar-amount-input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      </div>

      {/* Address display + actions */}
      <div className="tipjar-body">
        <div className="tipjar-label">Tip address ({chain.symbol})</div>
        <code className="tipjar-address">
          {chain.address || UNIVERSAL_TIP_ADDRESS}
        </code>

        <div className="tipjar-actions">
          <button
            type="button"
            className="tipjar-btn primary"
            onClick={handleCopy}
          >
            {copied ? 'Copied!' : 'Copy address'}
          </button>

          <button
            type="button"
            className="tipjar-btn ghost"
            onClick={handleSendTip}
            disabled={sending}
          >
            {sending ? 'Sending…' : 'Send tip from wallet'}
          </button>
        </div>

        {statusMsg && <p className="tipjar-status">{statusMsg}</p>}

        <p className="tipjar-footnote">
          Tips are optional and help cover RPC, infra, and database network stats integrations. No QR, no KYC — just your wallet.
        </p>
      </div>
    </div>
  );
};

export default TipJar;