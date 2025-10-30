// src/contexts/SettingsContext.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'

const KEY = 'dustclaim:settings:v1'

/**
 * Default “receive” token per chain when mode = 'swap-token'.
 * - Stable USDC where certain
 * - WETH for OP-stack chains when USDC is ambiguous
 * - Empty string for chains where you’ll decide later (users can override in Settings)
 *
 * Chains covered (15):
 * 1 Ethereum
 * 10 Optimism
 * 56 BNB Smart Chain
 * 100 Gnosis
 * 137 Polygon PoS
 * 195 X1
 * 250 Fantom Opera
 * 1329 Sei Network
 * 8453 Base
 * 34443 Mode
 * 42161 Arbitrum One
 * 43114 Avalanche C-Chain
 * 59144 Linea
 * 80094 Berachain bArtio (testnet)
 * 7777777 Zora
 */
const DEFAULT_OUT_TOKEN = {
  1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Ethereum: USDC
  10: '0x4200000000000000000000000000000000000006', // Optimism: WETH (change to native USDC if you prefer)
  56: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // BNB Chain: USDC
  100: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83', // Gnosis: USDC
  137: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // Polygon PoS: USDC.e
  195: '', // X1: (set your preferred token)
  250: '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75', // Fantom: USDC
  1329: '', // Sei EVM: (set preferred token)
  8453: '0x833589fCD6EDb6E08f4c7C32D4f71b54bdA02913', // Base: USDC
  34443: '0x4200000000000000000000000000000000000006', // Mode (OP stack): WETH
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Arbitrum One: USDC
  43114: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', // Avalanche: USDC
  59144: '0xE5D7C2a44FfDDf6b295A15c148167daaAf5Cf34F', // Linea: USDC (adjust if your project uses a different one)
  80094: '', // Berachain bArtio (testnet): (set)
  7777777:'0x4200000000000000000000000000000000000006', // Zora (OP stack): WETH
}

/** Build a complete per-chain map so the UI never sees undefined keys */
function buildInitialOutTokenMap() {
  const map = {}
  for (const rawId of Object.keys(SUPPORTED_CHAINS)) {
    const id = Number(rawId)
    map[id] = DEFAULT_OUT_TOKEN[id] ?? ''
  }
  return map
}

const defaultSettings = {
  // dust thresholds
  tokenMinUSD: 0.25,
  tokenMaxUSD: 25,
  nativeDustThreshold: 0.001, // shown as "dust" only (contract can’t claim natives)
  // inclusion
  includeNonDust: false, // when true, you can swap EVERYTHING (not only dust)
  // execution mode
  mode: 'contract-native', // 'contract-native' | 'swap-token'
  // per-chain output token when mode='swap-token'
  outTokenByChain: buildInitialOutTokenMap(),
}

const SettingsCtx = createContext(null)

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(defaultSettings)
  const [open, setOpen] = useState(false)

  // hydrate from localStorage and also ensure we have keys for all supported chains
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const stored = JSON.parse(raw)
        // merge + ensure all chain ids exist
        const mergedOut = { ...buildInitialOutTokenMap(), ...(stored.outTokenByChain || {}) }
        setSettings((s) => ({ ...s, ...stored, outTokenByChain: mergedOut }))
      } else {
        // ensure defaults include every chain
        setSettings((s) => ({ ...s, outTokenByChain: buildInitialOutTokenMap() }))
      }
    } catch {
      // fallback to safe defaults
      setSettings((s) => ({ ...s, outTokenByChain: buildInitialOutTokenMap() }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = (next) => {
    setSettings(next)
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
  }

  const value = useMemo(() => ({
    settings,
    save,
    open,
    setOpen,
    getOutToken(chainId) {
      const id = Number(chainId)
      return settings.outTokenByChain?.[id] || ''
    }
  }), [settings, open])

  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>
}

export const useSettings = () => useContext(SettingsCtx)