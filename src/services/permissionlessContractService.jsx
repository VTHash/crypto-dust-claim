// src/services/permissionlessContractService.js
import { ethers } from 'ethers'
import { DUSTCLAIM_ABI, getAddressForChain } from '../config/contracts'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import walletService from './walletService' // <— IMPORTANT: correct relative path

// --- internal helpers ---

async function requireSignerAndChain() {
  // Signer must already exist (WalletContext handled connect)
  const signer = await walletService.getSigner?.()
  if (!signer) {
    throw new Error('Wallet not connected. Please connect your wallet first.')
  }
  const network = await signer.provider.getNetwork()
  return { signer, chainId: Number(network.chainId) }
}

function getReadonlyProvider(chainId) {
  const rpc = SUPPORTED_CHAINS[Number(chainId)]?.rpcUrl
  if (!rpc) throw new Error(`No RPC endpoint configured for chain ${chainId}`)
  return new ethers.JsonRpcProvider(rpc)
}

function getDustClaimContract(chainId, signerOrProvider) {
  const addr = getAddressForChain(chainId)
  return new ethers.Contract(addr, DUSTCLAIM_ABI, signerOrProvider)
}

// --- service ---

class PermissionlessContractService {
  /**
   * 🚫 DISABLED: 1inch router path
   * Contract still has claimDustToETH, but we are not using 1inch from the app anymore.
   * If some old UI still calls this, it will error clearly.
   */
  async claimDust1inch(_token, _minReturnWei, _swapDataBytes) {
    throw new Error('1inch router path is disabled. Use Uniswap or a 0x swap instead.')
  }

  /**
   * 🚫 DISABLED: 1inch batch router path
   */
  async claimDustBatch1inch(_tokens, _minReturnsWei, _swapDatasBytes) {
    throw new Error('1inch batch path is disabled. Use Uniswap or a 0x swap instead.')
  }

  /**
   * ✅ Single token -> ETH via Uniswap V3 (DustClaim.claimDustViaUniswap)
   * @param {string} token
   * @param {number} fee 500 | 3000 | 10000, etc.
   * @param {bigint|string|number} minReturnWei
   * @param {number} deadlineSec unix seconds
   */
  async claimDustUniswap(token, fee, minReturnWei, deadlineSec) {
    const { signer, chainId } = await requireSignerAndChain()
    const contract = getDustClaimContract(chainId, signer)

    const tx = await contract.claimDustViaUniswap(
      token,
      Number(fee),
      ethers.toBigInt(minReturnWei),
      Number(deadlineSec)
    )
    const receipt = await tx.wait()
    return { success: true, txHash: tx.hash, receipt }
  }

  /**
   * Optional readonly access (off-chain reads)
   */
  getReadonlyProvider(chainId) {
    return getReadonlyProvider(chainId)
  }
}

export default new PermissionlessContractService()
