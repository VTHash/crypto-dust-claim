import { useEffect, useState } from 'react'
import { txStore } from '../services/txStore'

export function useTxStore() {
  const [txs, setTxs] = useState(() => {
    try {
      return txStore.readAll()
    } catch {
      return []
    }
  })

  useEffect(() => {
    if (typeof txStore.subscribe !== 'function') return
    const unsub = txStore.subscribe((all) => setTxs(Array.isArray(all) ? all : []))
    return () => {
      try {
        unsub?.()
      } catch {
        // ignore
      }
    }
  }, [])

  return Array.isArray(txs) ? txs : []
}