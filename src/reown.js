import { createAppKit } from '@reown/appkit'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { ethers } from 'ethers'

export function initReown(projectId, metadata) {
  if (!projectId) { console.warn('Reown projectId missing'); return null }
  const adapter = new EthersAdapter({ ethers })
  return createAppKit({ projectId, adapters: [adapter], metadata })
}