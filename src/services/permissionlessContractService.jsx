import { ethers } from 'ethers'
import { DUSTCLAIM_ABI, DUSTCLAIM_ADDRESS } from '../config/contracts'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import walletService from './walletService'
import { getContractConfig } from '../config/contracts'

function getAddressForChain(chainId) {
  const addr = DUSTCLAIM_ADDRESS[Number(chainId)]
  if (!addr) throw new Error(`DustClaim not deployed on chain ${chainId}`)
  return addr
}

async function getSignerAndChain() {
  // Prefer the signer you already created via AppKit + EthersAdapter
  if (walletService?.getSigner) {
    const signer = await walletService.getSigner()
    if (!signer) throw new Error('No signer: connect wallet first')
    const network = await signer.provider.getNetwork()
    return { signer, chainId: Number(network.chainId) }
  }

  // Fallback (shouldn’t be hit if walletService is wired)
  const res = await walletService.connect()
  if (!res?.success || !walletService.getSigner) {
    throw new Error('No signer: connect wallet first')
  }
  const signer = await walletService.getSigner()
  const network = await signer.provider.getNetwork()
  return { signer, chainId: Number(network.chainId) }
}

class PermissionlessContractService {
  // 1) Single token via 1inch
  async claimDust1inch(token, minReturnWei, swapDataBytes) {
    const { signer, chainId } = await getSignerAndChain()
    const contract = new ethers.Contract(getAddressForChain(chainId), DUSTCLAIM_ABI, signer)
    const tx = await contract.claimDustToETH(token, minReturnWei, swapDataBytes)
    const receipt = await tx.wait()
    return { success: true, txHash: tx.hash, receipt }
  }

  // 2) Batch via 1inch
  async claimDustBatch1inch(tokens, minReturnsWei, swapDatasBytes) {
    if (tokens.length !== minReturnsWei.length || tokens.length !== swapDatasBytes.length) {
      throw new Error('Array length mismatch')
    }
    const { signer, chainId } = await getSignerAndChain()
    const contract = new ethers.Contract(getAddressForChain(chainId), DUSTCLAIM_ABI, signer)
    const tx = await contract.claimDustBatchToETH(tokens, minReturnsWei, swapDatasBytes)
    const receipt = await tx.wait()
    return { success: true, txHash: tx.hash, receipt }
  }

  // 3) Uniswap V3 path
  async claimDustUniswap(token, fee, minReturnWei, deadlineSec) {
    const { signer, chainId } = await getSignerAndChain()
    const contract = new ethers.Contract(getAddressForChain(chainId), DUSTCLAIM_ABI, signer)
    const tx = await contract.claimDustViaUniswap(token, fee, minReturnWei, deadlineSec)
    const receipt = await tx.wait()
    return { success: true, txHash: tx.hash, receipt }
  }

  // Readonly provider if you need off-chain reads
  getReadonlyProvider(chainId) {
    const rpc = SUPPORTED_CHAINS[Number(chainId)]?.rpcUrl
    if (!rpc) throw new Error(`No RPC for chain ${chainId}`)
    return new ethers.JsonRpcProvider(rpc)
  }
}

export default new PermissionlessContractService()