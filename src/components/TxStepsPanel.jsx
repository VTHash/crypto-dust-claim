import React, { useMemo } from 'react'
import SwapStepsCard from './SwapStepsCard'
import { useTxStore } from '../hooks/useTxStore'
import { txStore } from '../services/txStore'
import walletService from '../services/walletService'
import '../styles/SwapStepsCard.css'

export default function TxStepsPanel() {
  const all = useTxStore()

  const txs = useMemo(() => {
    // Prefer showing latest flow for current address/chain
    // (No executor changes required yet.)
    const from = walletService.getAddress ? null : null // avoid async here
    // Use store helper based on whatever is already present
    // If you want to filter by from/chain here, do it in a parent that knows them.
    return txStore.listLatestFlow({ windowMs: 3 * 60 * 1000 })
  }, [all])

  return <SwapStepsCard title="Swapping" subtitle="Via DustClaimV3 / 0x" txs={txs} />
}