import React, { useMemo } from 'react'
import SwapStepsCard from './SwapStepsCard'
import { useTxStore } from '../hooks/useTxStore'
import { txStore } from '../services/txStore'
import walletService from '../services/walletService'
import '../styles/SwapStepsCard.css'

export default function TxStepsPanel() {
  const all = useTxStore()
  const hash = txStore.txHash || txStore.hash || null
  const txs = Array.isArray(walletService.listTransactions?.()) ?
  walletService.listTransactions() : []
  const filteredTxs = txs.filter((tx) => tx?.txHash || tx?.hash)

  return <SwapStepsCard title="Swapping" subtitle="Via DustClaimV3 / 0x" txs={filteredTxs} />
}