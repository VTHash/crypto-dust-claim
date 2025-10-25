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
   * Single token -> ETH via 1inch router calldata
   * @param {string} token ERC20 token address
   * @param {bigint|string|number} minReturnWei minimum ETH out (wei)
   * @param {string} swapDataBytes 1inch API tx.data (0x…)
   */
  async claimDust1inch(token, minReturnWei, swapDataBytes) {
    const { signer, chainId } = await requireSignerAndChain()
    const contract = getDustClaimContract(chainId, signer)

    const tx = await contract.claimDustToETH(
      token,
      ethers.toBigInt(minReturnWei),
      swapDataBytes
    )
    const receipt = await tx.wait()
    return { success: true, txHash: tx.hash, receipt }
  }

  /**
   * Batch tokens -> ETH via 1inch router calldata (up to your contract limit)
   * @param {string[]} tokens
   * @param {(bigint|string|number)[]} minReturnsWei
   * @param {string[]} swapDatasBytes
   */
  async claimDustBatch1inch(tokens, minReturnsWei, swapDatasBytes) {
    if (
      tokens.length !== minReturnsWei.length ||
      tokens.length !== swapDatasBytes.length
    ) {
      throw new Error('Array length mismatch')
    }
    const { signer, chainId } = await requireSignerAndChain()
    const contract = getDustClaimContract(chainId, signer)

    const minOuts = minReturnsWei.map(ethers.toBigInt)
    const tx = await contract.claimDustBatchToETH(tokens, minOuts, swapDatasBytes)
    const receipt = await tx.wait()
    return { success: true, txHash: tx.hash, receipt }
  }

  /**
   * Single token -> ETH via Uniswap V3
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