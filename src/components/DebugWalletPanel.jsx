import React, { useEffect, useMemo, useState } from 'react'
import { ethers } from 'ethers'
import walletService from '../services/walletService'
import priceService from '../services/priceService'
import { useWallet } from '../contexts/WalletContext'
import { SUPPORTED_CHAINS, projectId as REOWN_PROJECT_ID } from '../config/walletConnectConfig'

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '')

export default function DebugWalletPanel() {
  const { address, isConnected } = useWallet()

  const [prov, setProv] = useState(null) // EIP-1193
  const [bp, setBp] = useState(null) // BrowserProvider
  const [signer, setSigner] = useState(null)
  const [acct, setAcct] = useState(null)
  const [cid, setCid] = useState(null) // hex chainId, e.g. 0x1
  const [bal, setBal] = useState(null) // string ETH
  const [events, setEvents] = useState([]) // recent provider events
  const [lastErr, setLastErr] = useState(null)

  // CoinGecko status
  const [cgStatus, setCgStatus] = useState({
    loading: false,
    keyLoaded: false,
    reachable: null,
    ethPrice: null,
    cacheSize: 0,
    error: null
  })

  const chainInfo = useMemo(() => {
    const n = cid ? parseInt(cid, 16) : undefined
    return n ? { id: n, ...SUPPORTED_CHAINS[n] } : null
  }, [cid])

  // ---------- CoinGecko status helper ----------
  const refreshCgStatus = async () => {
    setCgStatus((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const keyLoaded = !!import.meta.env.VITE_COINGECKO_API_KEY

      // ping CoinGecko (simple health check)
      let reachable = null
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/ping')
        const json = await res.json().catch(() => null)
        reachable = json?.gecko_says || `HTTP ${res.status}`
      } catch (e) {
        reachable = `ping failed: ${e?.message || 'unknown error'}`
      }

      // sample price for sanity (ETH on mainnet)
      let ethPrice = null
      try {
        ethPrice = await priceService.getNativeUsdPrice(1)
      } catch (e) {
        // ignore, we’ll surface as (n/a)
      }

      // cache stats from priceService
      let cacheSize = 0
      try {
        const stats = priceService.getCacheStats?.()
        cacheSize = stats?.size ?? 0
      } catch (e) {
        // ignore – not fatal
      }

      setCgStatus({
        loading: false,
        keyLoaded,
        reachable,
        ethPrice,
        cacheSize,
        error: null
      })
    } catch (e) {
      setCgStatus((prev) => ({
        ...prev,
        loading: false,
        error: e?.message || String(e)
      }))
    }
  }

  // attach provider listeners + basic wallet info
  useEffect(() => {
    let cleanup = () => {}
    ;(async () => {
      try {
        const p = await walletService.getProvider()
        setProv(p || null)
        const bpv = await walletService.getBrowserProvider()
        setBp(bpv || null)
        const s = await walletService.getSigner()
        setSigner(s || null)

        const a = (await walletService.getAddress()) || null
        setAcct(a)
        const ch = (await walletService.getChainId()) || null
        setCid(ch)

        // fetch balance if possible
        try {
          if (bpv && a) {
            const b = await bpv.getBalance(a)
            setBal(ethers.formatEther(b))
          } else {
            setBal(null)
          }
        } catch {
          setBal(null)
        }

        // event listeners
        const onAcc = (arr) => {
          setEvents((e) => [`accountsChanged: ${JSON.stringify(arr)}`, ...e].slice(0, 10))
          setAcct(arr?.[0] || null)
        }
        const onChain = (hex) => {
          setEvents((e) => [`chainChanged: ${hex}`, ...e].slice(0, 10))
          setCid(hex)
        }
        const onDisc = (err) => {
          setEvents((e) => [`disconnect: ${err?.message || 'reason unknown'}`, ...e].slice(0, 10))
          setAcct(null)
          setSigner(null)
          setBal(null)
        }

        p?.removeListener?.('accountsChanged', onAcc)
        p?.removeListener?.('chainChanged', onChain)
        p?.removeListener?.('disconnect', onDisc)
        p?.on?.('accountsChanged', onAcc)
        p?.on?.('chainChanged', onChain)
        p?.on?.('disconnect', onDisc)

        cleanup = () => {
          p?.removeListener?.('accountsChanged', onAcc)
          p?.removeListener?.('chainChanged', onChain)
          p?.removeListener?.('disconnect', onDisc)
        }
      } catch (e) {
        setLastErr(e?.message || String(e))
      }
    })()

    // also run an initial CoinGecko check
    refreshCgStatus()

    return cleanup
  }, [address, isConnected])

  // actions
  const doRestore = async () => {
    setLastErr(null)
    const s = await walletService.restoreSession()
    if (!s) setLastErr('No saved session found')
  }
  const doConnect = async () => {
    setLastErr(null)
    const r = await walletService.connect()
    if (!r.success) setLastErr(r.error || 'connect failed')
  }
  const doReqAccounts = async () => {
    try {
      const p = await walletService.getProvider()
      const accs = await p.request({ method: 'eth_requestAccounts' })
      setAcct(accs?.[0] || null)
    } catch (e) {
      setLastErr(e?.message || String(e))
    }
  }
  const doDisconnect = async () => {
    setLastErr(null)
    await walletService.disconnect()
  }
  const switchChain = async (n) => {
    const r = await walletService.switchChain(Number(n))
    if (!r.success) setLastErr(r.error)
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '(no window)'

  return (
    <div style={styles.wrap}>
      <div style={styles.row}>
        <strong>Debug Wallet Panel</strong>
        <span style={{ opacity: 0.7 }}> | origin: {origin}</span>
      </div>

      {/* Wallet / provider basics */}
      <div style={styles.grid}>
        <Item label="Reown Project ID" value={REOWN_PROJECT_ID || '(missing)'} />
        <Item label="Provider present" value={prov ? 'yes' : 'no'} />
        <Item
          label="Injected present"
          value={typeof window !== 'undefined' && window.ethereum ? 'yes' : 'no'}
        />
        <Item label="Connected" value={isConnected ? 'true' : 'false'} />
        <Item label="Account" value={acct ? `${acct} (${short(acct)})` : '(none)'} />
        <Item label="Chain ID (hex)" value={cid || '(none)'} />
        <Item
          label="Network"
          value={chainInfo ? `${chainInfo.id} • ${chainInfo.name || 'Unknown'}` : '(unknown)'}
        />
        <Item
          label="Balance"
          value={
            bal != null
              ? `${Number(bal).toFixed(6)} ${chainInfo?.symbol || 'ETH'}`
              : '(n/a)'
          }
        />
      </div>

      <div style={styles.controls}>
        <button onClick={doRestore} style={styles.btn}>Restore session</button>
        <button onClick={doConnect} style={styles.btn}>Connect</button>
        <button onClick={doReqAccounts} style={styles.btn}>Request Accounts</button>
        <button onClick={doDisconnect} style={styles.btnWarn}>Disconnect</button>
        <button onClick={refreshCgStatus} style={styles.btnGhost}>
          {cgStatus.loading ? 'Checking CG…' : 'Refresh CG status'}
        </button>
      </div>

      {/* CoinGecko status block */}
      <div style={{ marginTop: 12 }}>
        <div style={styles.row}>
          <strong>CoinGecko Status</strong>
          <span style={{ opacity: 0.7, fontSize: 12, marginLeft: 6 }}>
            {cgStatus.loading
              ? 'checking…'
              : cgStatus.error
              ? 'error'
              : 'ready'}
          </span>
        </div>
        <div style={styles.grid}>
          <Item label="API key loaded" value={cgStatus.keyLoaded ? 'yes' : 'no'} />
          <Item label="Reachable" value={cgStatus.reachable || '(unknown)'} />
          <Item
            label="Sample ETH → USD"
            value={
              cgStatus.ethPrice != null
                ? `$${cgStatus.ethPrice}`
                : '(n/a)'
            }
          />
          <Item label="Cache entries" value={cgStatus.cacheSize} />
        </div>
        {cgStatus.error && (
          <div style={styles.error}>
            <strong>CG Error:</strong> {cgStatus.error}
          </div>
        )}
      </div>

      {/* Provider events */}
      {lastErr && (
        <div style={styles.error}>
          <strong>Error:</strong> {lastErr}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <label style={styles.lbl}>Quick switch chain:</label>
        <select
          onChange={(e) => switchChain(e.target.value)}
          defaultValue=""
          style={styles.select}
        >
          <option value="" disabled>
            choose…
          </option>
          {Object.keys(SUPPORTED_CHAINS).map((k) => (
            <option key={k} value={k}>
              {k} — {SUPPORTED_CHAINS[k].name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginTop: 10 }}>
        <label style={styles.lbl}>Recent provider events</label>
        <ul style={styles.log}>
          {events.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Item({ label, value }) {
  return (
    <div style={styles.item}>
      <div style={styles.k}>{label}</div>
      <div style={styles.v}>{String(value)}</div>
    </div>
  )
}

const styles = {
  wrap: {
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    fontSize: 13,
    background: '#0b1220',
    color: '#e6f0ff',
    border: '1px solid #1c2a44',
    borderRadius: 12,
    padding: 12,
    maxWidth: 760
  },
  row: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 8,
    marginBottom: 10
  },
  item: {
    background: '#0f1730',
    border: '1px solid #1e2f52',
    borderRadius: 8,
    padding: '8px 10px'
  },
  k: { opacity: 0.7, marginBottom: 4 },
  v: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  controls: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  btn: {
    background: '#1f8bff',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '8px 10px',
    cursor: 'pointer'
  },
  btnWarn: {
    background: '#ff4772',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '8px 10px',
    cursor: 'pointer'
  },
  btnGhost: {
    background: 'transparent',
    color: '#8ab4ff',
    border: '1px solid #1f8bff',
    borderRadius: 8,
    padding: '8px 10px',
    cursor: 'pointer'
  },
  lbl: { display: 'block', marginBottom: 4, opacity: 0.8 },
  select: {
    background: '#0f1730',
    color: '#e6f0ff',
    border: '1px solid #1e2f52',
    borderRadius: 8,
    padding: '6px 8px'
  },
  error: {
    marginTop: 10,
    padding: '8px 10px',
    borderRadius: 8,
    background: '#2a0f14',
    border: '1px solid #4a1520',
    color: '#ffd5db'
  },
  log: { margin: 0, paddingLeft: 18, lineHeight: 1.5 }
}