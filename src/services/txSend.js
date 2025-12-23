import { txStore } from './txStore'

const uid = (prefix = 'tx') => `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`

export async function sendTransactionReliable({
  provider, // ethers.BrowserProvider
  chainId,
  from,
  kind = 'unknown', // 'approval' | 'swap' | 'unknown'
  request, // ethers TransactionRequest
  tokenAddress,
  spender,
  amount,
  waitConfirms = 1,
  waitTimeoutMs = 180000
}) {
  const id = uid(kind)
  const createdAt = Date.now()

  txStore.upsert({
    id,
    chainId: Number(chainId),
    from,
    kind,
    status: 'created',
    createdAt,
    updatedAt: createdAt,
    to: request?.to?.toString?.() ?? request?.to,
    value: request?.value?.toString?.() ?? request?.value,
    tokenAddress,
    spender,
    amount
  })

  const signer = await provider.getSigner()

  // Capture nonce early (used for replacement detection)
  try {
    const nonce = await signer.getNonce()
    txStore.patch(id, { nonce })
  } catch {
    // ignore
  }

  // Robust gas handling (MetaMask mobile sometimes fails estimation)
  let req = { ...request }
  try {
    if (!req.gasLimit) {
      const est = await signer.estimateGas(req)
      // add 20% buffer to avoid borderline failures
      req.gasLimit = (est * 12n) / 10n
    }
  } catch (e) {
    txStore.patch(id, { lastError: `estimateGas failed: ${e?.message ?? String(e)}` })
  }

  try {
    const resp = await signer.sendTransaction(req)

    // STORE HASH IMMEDIATELY
    txStore.patch(id, {
      status: 'submitted',
      hash: resp.hash,
      nonce: resp.nonce,
      to: resp.to?.toString?.() ?? resp.to,
      value: resp.value?.toString?.() ?? resp.value
    })

    // Wait for mining (best-effort)
    const receipt =
      (await provider.waitForTransaction(resp.hash, waitConfirms, waitTimeoutMs).catch(() => null)) ||
      (await provider.getTransactionReceipt(resp.hash).catch(() => null))

    if (!receipt) {
      return { success: true, id, txHash: resp.hash, receipt: null, status: 'submitted' }
    }

    txStore.patch(id, {
      status: receipt.status === 1 ? 'confirmed' : 'failed',
      blockNumber: receipt.blockNumber,
      transactionIndex: receipt.index,
      gasUsed: receipt.gasUsed?.toString?.(),
      effectiveGasPrice: receipt.effectiveGasPrice?.toString?.(),
      confirmations: waitConfirms
    })

    return {
      success: receipt.status === 1,
      id,
      txHash: resp.hash,
      receipt,
      status: receipt.status === 1 ? 'confirmed' : 'failed'
    }
  } catch (e) {
    txStore.patch(id, {
      status: 'failed',
      lastError: e?.shortMessage || e?.reason || e?.message || String(e)
    })
    throw e
  }
}