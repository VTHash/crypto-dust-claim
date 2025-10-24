import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { mainnet, arbitrum, base, polygon } from '@reown/appkit/networks'

export const projectId = import.meta.env.VITE_PROJECT_ID || 'YOUR_PROJECT_ID'

export const networks = [mainnet, arbitrum, base, polygon]

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  // If you need SSR in Next.js you’d add: ssr: true
})