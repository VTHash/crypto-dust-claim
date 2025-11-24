import React, { useState } from 'react';
import {
  TIP_CHAINS,
  TIP_DEFAULT_CHAIN_ID,
  TIP_SUGGESTED_AMOUNTS,
  UNIVERSAL_TIP_ADDRESS,
} from '../config/TipConfig';
import walletService from '../services/walletService'
import './TipJar.css'

// Networks you want to allow for tips (subset of your supported chains)
const TIP_NETWORKS = [
  { id: 1, label: 'Ethereum (ETH)', symbol: 'ETH', logo: '/logo/ethereum.png' },
  { id: 10, label: 'Optimism (ETH)', symbol: 'ETH', logo: '/logo/optimism.png' },
  { id: 56, label: 'BNB Smart Chain (BNB)', symbol: 'BNB', logo: '/logo/bnb.png' },
  { id: 100, label: 'Gnosis (xDAI)', symbol: 'xDAI', logo: '/logo/gnosis.png' },
  { id: 137, label: 'Polygon PoS (MATIC)', symbol: 'MATIC',logo: '/logo/polygon.png' },
  { id: 195, label: 'X1 (X1)', symbol: 'X1', logo: null }, // no logo yet
  { id: 250, label: 'Fantom (FTM)', symbol: 'FTM', logo: '/logo/fantom.png' },
  { id: 1329, label: 'Sei (SEI)', symbol: 'SEI', logo: '/logo/sei.png' },
  { id: 8453, label: 'Base (ETH)', symbol: 'ETH', logo: '/logo/base.png' },
  { id: 34443, label: 'Mode (ETH)', symbol: 'ETH', logo: '/logo/mode.jpg' },
  { id: 42161, label: 'Arbitrum One (ETH)', symbol: 'ETH', logo: '/logo/arbitrum.png' },
  { id: 43114, label: 'Avalanche (AVAX)', symbol: 'AVAX', logo: '/logo/avalanche.png' },
  { id: 59144, label: 'Linea (ETH)', symbol: 'ETH', logo: '/logo/linea.png' },
  { id: 80094, label: 'Berachain (BERA)', symbol: 'BERA', logo: '/logo/bera.png' },
  { id: 7777777, label: 'Zora (ETH)', symbol: 'ETH', logo: '/logo/zora.jpg' },
  { id: 130, label: 'Unichain (ETH)', symbol: 'ETH', logo: '/logo/unichain.png' },
  { id: 42220, label: 'Celo (CELO)', symbol: 'CELO', logo: '/logo/celo.png' },
  { id: 1313161554, label: 'Aurora (ETH)', symbol: 'ETH', logo: '/logo/aurora.png' },
  { id: 1284, label: 'Moonbeam (GLMR)', symbol: 'GLMR', logo: '/logo/moonbeam.png' },
  { id: 1285, label: 'Moonriver (MOVR)', symbol: 'MOVR', logo: '/logo/moonriver.png' },
  { id: 5000, label: 'Mantle (MNT)', symbol: 'MNT', logo: '/logo/mantle.png' },
  { id: 9745, label: 'Plasma (ETH)', symbol: 'ETH', logo: '/logo/plasma.png' },
  { id: 14, label: 'Flare (FLR)', symbol: 'FLR', logo: '/logo/flare.png' },
  { id: 40, label: 'Telos (TLOS)', symbol: 'TLOS', logo: '/logo/telos.png' },
  { id: 50, label: 'XDC (XDC)', symbol: 'XDC', logo: '/logo/xdc.png' },
  { id: 57, label: 'Syscoin (SYS)', symbol: 'SYS', logo: '/logo/sys.jpg' },
  { id: 61, label: 'Ethereum Classic (ETC)', symbol: 'ETC', logo: '/logo/ethereum-classic.png' },
  { id: 57073, label: 'Inkonchain (INK)', symbol: 'INK', logo: '/logo/ink.png' },
  { id: 60808, label: 'BOB (ETH)', symbol: 'ETH', logo: '/logo/bob.jpg' },
  { id: 81457, label: 'Blast (ETH)', symbol: 'ETH', logo: '/logo/blast.jpeg' },
  { id: 1868, label: 'Soneium (ETH)', symbol: 'ETH', logo: '/logo/soneium.jpg' },
  { id: 480, label: 'World Chain (ETH)', symbol: 'ETH', logo: '/logo/worldcoin.png' },
  { id: 1135, label: 'Lisk (ETH)', symbol: 'ETH', logo: '/logo/lisk.png' },
  { id: 1923, label: 'Swellchain (ETH)', symbol: 'ETH', logo: '/logo/swell.png' },
  { id: 2741, label: 'Abstract (ETH)', symbol: 'ETH', logo: '/logo/abstract.png' },
  { id: 747474, label: 'Katana (ETH)', symbol: 'ETH', logo: '/logo/katana.jpg' },
  { id: 146, label: 'Sonic (S)', symbol: 'S', logo: '/logo/sonic.jpg' }
]

// ===== helper to parse "0.0005" ETH → BigInt wei safely, no floats =====
function parseEthToWei(amountStr) {
  const raw = (amountStr || '').trim()
  if (!raw) return 0n
  if (!/^\d+(\.\d{0,18})?$/.test(raw)) {
    throw new Error('Invalid amount format')
  }
  const [whole, frac = ''] = raw.split('.')
  const fracPadded = (frac + '000000000000000000').slice(0, 18)
  const wholeWei = BigInt(whole || '0') * 10n ** 18n
  const fracWei = BigInt(fracPadded || '0')
  return wholeWei + fracWei
}

const TipJar = ({ onClose }) => {
  const [selectedChainId, setSelectedChainId] = useState(1)
  const [amount, setAmount] = useState('0.0005')
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState('')

  const currentNetwork =
    TIP_NETWORKS.find((n) => n.id === selectedChainId) || TIP_NETWORKS[0]

  const tipAddress =
    TIP_ADDRESS_BY_CHAIN[selectedChainId] || TIP_UNIVERSAL_ADDRESS

  const quickAmounts = ['0.0005', '0.0015', '0.005']

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tipAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  const handleQuickAmount = (val) => {
    setAmount(val)
  }

  const handleSendFromWallet = async () => {
    setError('')
    setTxHash('')

    try {
      if (!amount) {
        throw new Error('Enter a tip amount')
      }

      const wei = parseEthToWei(amount)
      if (wei <= 0n) {
        throw new Error('Amount is too small')
      }

      setSending(true)

      // 1) Ensure wallet is connected
      const connected = await walletService.isConnected?.()
      if (!connected && walletService.connect) {
        const res = await walletService.connect()
        if (!res?.success) {
          throw new Error(res?.error || 'Please connect your wallet')
        }
      }

      // 2) Ensure correct chain
      const chainHex = await walletService.getChainId?.()
      const currentId =
        typeof chainHex === 'string'
          ? parseInt(chainHex, 16)
          : Number(chainHex || 0)

      if (currentId !== Number(selectedChainId)) {
        const sw = await walletService.switchChain(Number(selectedChainId))
        if (!sw?.success) {
          throw new Error(sw?.error || 'Failed to switch network')
        }
      }

      // 3) Resolve sender
      const fromAddress =
        (await walletService.getAddress?.()) ||
        (await (async () => {
          const accs = await walletService.getAccounts?.()
          return accs?.[0] || null
        })())

      if (!fromAddress) {
        throw new Error('No wallet address found')
      }

      // 4) Build native transfer tx
      const tx = {
        from: fromAddress,
        to: tipAddress,
        value: '0x' + wei.toString(16),
        data: '0x'
      }

      const res = await walletService.sendTransaction(tx)
      if (!res?.success) {
        throw new Error(res?.error || 'Tip transaction failed')
      }

      setTxHash(res.txHash || '')
    } catch (err) {
      setError(err?.message || 'Failed to send tip')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="tipjar-overlay">
      <div className="tipjar-card">
        <button
          type="button"
          className="tipjar-close"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>

        <div className="tipjar-header">
          <span className="tipjar-emoji">⚡</span>
          <div>
            <h3 className="tipjar-title">Support DustClaim</h3>
            <p className="tipjar-subtitle">
              If DustClaim helped you recover value, you can send a small
              multi-chain tip.
            </p>
          </div>
        </div>

        <div className="tipjar-body">
          {/* Network select */}
          <div className="tipjar-label">Network</div>
          <div className="tipjar-network-row">
            {currentNetwork.logo && (
              <img
                src={currentNetwork.logo}
                alt={currentNetwork.label}
                className="tipjar-network-logo"
              />
            )}
            <select
              className="tipjar-select"
              value={selectedChainId}
              onChange={(e) => setSelectedChainId(Number(e.target.value))}
            >
              {TIP_NETWORKS.map((net) => (
                <option key={net.id} value={net.id}>
                  {net.label}
                </option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div className="tipjar-label">
            Tip amount ({currentNetwork.symbol})
          </div>
          <div className="tipjar-amount-row">
            {quickAmounts.map((val) => (
              <button
                key={val}
                type="button"
                className={`tipjar-amount-pill${
                  amount === val ? ' active' : ''
                }`}
                onClick={() => handleQuickAmount(val)}
              >
                {val}
              </button>
            ))}
          </div>
          <input
            className="tipjar-input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0005"
            inputMode="decimal"
          />

          {/* Address */}
          <div className="tipjar-label">
            Tip address ({currentNetwork.symbol})
          </div>
          <code className="tipjar-address">{tipAddress}</code>

          {/* Actions */}
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
              onClick={handleSendFromWallet}
              disabled={sending}
            >
              {sending ? 'Sending…' : 'Send tip from wallet'}
            </button>
          </div>

          {error && <div className="tipjar-error">{error}</div>}
          {txHash && (
            <div className="tipjar-success">
              Thank you! Tx submitted:
              <br />
              <span>{txHash}</span>
            </div>
          )}

          <p className="tipjar-footnote">
            Tips are optional and help cover RPC, infra, and database network
            stats integrations. No QR, no KYC &mdash; just your wallet.
          </p>
        </div>
      </div>
    </div>
  )
}

export default TipJar
