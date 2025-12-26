import { useEffect, useState } from 'react'
import { txStore } from '../services/txStore'

export function useTxStore() {
  const [txs, setTxs] = useState(() => txStore.readAll())

  useEffect(() => {
    return txStore.subscribe((all) => setTxs(all))
  }, [])

  return txs
}