import { erc20Abi, createPublicClient, createWalletClient, http, encodeFunctionData } from 'viem'
import { mainnet, polygon, arbitrum, base, optimism } from '@reown/appkit/networks'

// minimal EIP-2612 ABI
const PERMIT_ABI = [{
  type: 'function',
  name: 'nonces',
  stateMutability: 'view',
  inputs: [{ name: 'owner', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }]
}]

const CHAINS = [mainnet, polygon, arbitrum, base, optimism]

export async function checkAllowance({ chainId, token, owner, spender }) {
  const chain = CHAINS.find(c => c.id === Number(chainId))
  const client = createPublicClient({ chain, transport: http() })
  try {
    const allowance = await client.readContract({
      address: token.address, abi: erc20Abi, functionName: 'allowance', args: [owner, spender]
    })
    return allowance
  } catch {
    return 0n
  }
}

export async function supportsPermit2612({ chainId, token }) {
  const chain = CHAINS.find(c => c.id === Number(chainId))
  const client = createPublicClient({ chain, transport: http() })
  try {
    // probe a read-only method like nonces(owner)
    await client.readContract({
      address: token.address, abi: PERMIT_ABI, functionName: 'nonces', args: ['0x0000000000000000000000000000000000000000']
    })
    return true
  } catch {
    return false
  }
}