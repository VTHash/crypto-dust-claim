// DebugStatus.jsx (temporary)
import React from 'react'
import { useWallet } from '../contexts/WalletContext'

export default function DebugStatus() {
  const { isConnected, address, chainId, error } = useWallet()
  return (
    <div style={{position:'fixed',bottom:8,left:8,padding:'6px 8px',background:'#0008',color:'#fff',borderRadius:8,fontSize:12,zIndex:9999}}>
      conn:{String(isConnected)} · addr:{address?.slice(0,6)}…{address?.slice(-4)} · chain:{chainId} {error && <span> · err:{error}</span>}
    </div>
  )
}

