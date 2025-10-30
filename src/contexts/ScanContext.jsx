import React, { createContext, useContext, useMemo, useState } from 'react'

const ScanContext = createContext(null)

export function ScanProvider({ children }) {
  const [results, setResults] = useState([]) // [{ chainId, nativeBalance, tokenDetails, ... }]
  const [meta, setMeta] = useState({ updatedAt: 0 }) // timestamps etc.

  const value = useMemo(() => ({
    results,
    setResults: (list) => { setResults(list || []); setMeta({ updatedAt: Date.now() }) },
    clearResults: () => { setResults([]); setMeta({ updatedAt: 0 }) },
    meta
  }), [results, meta])

  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>
}

export function useScan() {
  const ctx = useContext(ScanContext)
  if (!ctx) throw new Error('useScan must be used within <ScanProvider>')
  return ctx
}


