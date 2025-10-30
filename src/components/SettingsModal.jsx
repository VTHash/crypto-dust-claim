// src/components/SettingsModal.jsx
import React, { useState } from 'react'
import { useSettings } from '../contexts/SettingsContext'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import './SettingsModal.css'

export default function SettingsModal() {
  const { settings, save, open, setOpen } = useSettings()
  const [local, setLocal] = useState(settings)

  if (!open) return null

  const onClose = () => { setLocal(settings); setOpen(false) }
  const onSave = () => { save(local); setOpen(false) }

  const setOut = (id, v) =>
    setLocal((s) => ({
      ...s,
      outTokenByChain: { ...(s.outTokenByChain || {}), [Number(id)]: v.trim() }
    }))

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e)=>e.stopPropagation()}>
        <h2>Settings</h2>

        <div className="block">
          <h3>Dust thresholds</h3>
          <label>
            Token min (USD)
            <input type="number" step="0.01" value={local.tokenMinUSD}
              onChange={(e)=>setLocal({...local, tokenMinUSD: Number(e.target.value)})}/>
          </label>
          <label>
            Token max (USD)
            <input type="number" step="0.01" value={local.tokenMaxUSD}
              onChange={(e)=>setLocal({...local, tokenMaxUSD: Number(e.target.value)})}/>
          </label>
          <label>
            Native dust flag (units)
            <input type="number" step="0.000001" value={local.nativeDustThreshold}
              onChange={(e)=>setLocal({...local, nativeDustThreshold: Number(e.target.value)})}/>
          </label>
          <label className="row">
            <input type="checkbox" checked={local.includeNonDust}
              onChange={(e)=>setLocal({...local, includeNonDust: e.target.checked})}/>
            Include non-dust balances (swap everything)
          </label>
        </div>

        <div className="block">
          <h3>Claim mode</h3>
          <label className="row">
            <input type="radio" name="mode" value="contract-native"
              checked={local.mode==='contract-native'}
              onChange={()=>setLocal({...local, mode:'contract-native'})}/>
            Contract → Native (default; ERC-20 → WETH → unwrap → native per chain)
          </label>
          <label className="row">
            <input type="radio" name="mode" value="swap-token"
              checked={local.mode==='swap-token'}
              onChange={()=>setLocal({...local, mode:'swap-token'})}/>
            Direct Swap → Target Token (per chain; via aggregators; requires approvals)
          </label>
        </div>

        {local.mode === 'swap-token' && (
          <div className="block">
            <h3>Target token per chain</h3>
            <p className="hint">Paste ERC-20 addresses to receive on each chain (e.g., USDC).</p>
            <div className="grid">
              {Object.entries(SUPPORTED_CHAINS).map(([id, c]) => (
                <label key={id} title={c.name}>
                  <span>{c.name}</span>
                  <input
                    placeholder="0x… token address"
                    value={local.outTokenByChain?.[Number(id)] || ''}
                    onChange={(e)=>setOut(id, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="actions">
          <button className="btn" onClick={onSave}>Save</button>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
