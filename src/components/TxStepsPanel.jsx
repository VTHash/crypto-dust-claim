import React, { useMemo } from 'react'
import SwapStepsCard from './SwapStepsCard'
import { useTxStore } from '../hooks/useTxStore'
import { txStore } from '../services/txStore'
import '../styles/SwapStepsCard.css'

export default function TxStepsPanel({ flowId = null, chainId = null, from = null }) {
  // This should be your reactive source (hook subscribes to localStorage updates / events)
  const storeTxs = useTxStore()

  // Safety: always operate on an array
  const base = Array.isArray(storeTxs) ? storeTxs : []

  // Filter to only show the current flow when available,
  // otherwise show the most recent relevant txs.
  const txs = useMemo(() => {
    let list = base

    if (chainId != null) list = list.filter((t) => Number(t.chainId) === Number(chainId))
    if (from) list = list.filter((t) => String(t.from || '').toLowerCase() === String(from).toLowerCase())

    if (flowId) {
      list = list.filter((t) => t.flowId === flowId)
    } else {
      // If no flowId provided, show only the most recent 10 swaps/approvals (keeps UI clean)
      list = list.filter((t) => t.kind === 'swap' || t.kind === 'approval').slice(0, 10)
    }

    // Normalize hashes so SwapStepsCard can render consistently
    return list.map((t) => ({
      ...t,
      txHash: t.txHash || t.hash || null
    }))
  }, [base, flowId, chainId, from])

  return <SwapStepsCard title="Swapping" subtitle="Via DustClaimV3 / 0x" txs={txs} />
}