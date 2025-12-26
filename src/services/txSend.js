import { txStore } from './txStore'

const uid = (prefix = 'tx') => `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`

function cleanErr(e) {
  const code = e?.code
  const msg =
    e?.shortMessage ||
    e?.reason ||
    e?.message ||
    (typeof e === 'string' ? e : 'Transaction failed')
  return { code, msg }
}

function toRpcTx(req) {
  // ethers v6 TransactionRequest -> JSON-RPC tx object
  const out = {}
  if (req.from) out.from = req.from
  if (req.to) out.to = req.to
  if (req.data) out.data = req.data
  if (req.value != null) out.value = '0x' + BigInt(req.value).toString(16)
  if (req.gasLimit != null) out.gas = '0x' + BigInt(req.gasLimit).toString(16)
  if (req.maxFeePerGas != null) out.maxFeePerGas = '0x' + BigInt(req.maxFeePerGas).toString(16)
  if (req.maxPriorityFeePerGas != null)
    out.maxPriorityFeePerGas = '0x' + BigInt(req.maxPriorityFeePerGas).toString(16)
  if (req.gasPrice != null) out.gasPrice = '0x' + BigInt(req.gasPrice).toString(16)
  if (req.nonce != null) out.nonce = '0x' + BigInt(req.nonce).toString(16)
  return out
}

export async function sendTransactionReliable({
  provider, // ethers.BrowserProvider
  chainId,
  from,
  kind = 'unknown', // 'approval' | 'swap' | 'unknown'
  request, // ethers TransactionRequest
  tokenAddress,
  spender,
  amount,
  // NEW: optional UI metadata
  flowId = null,
  title = null,
  step = null,
  waitConfirms = 1,
  waitTimeoutMs = 180000
}) {
  const id = uid(kind)
  const createdAt = Date.now()

  txStore.upsert({
    id,
    flowId,
    chainId: Number(chainId),
    from,
    kind,
    title,
    step,
    status: 'created',
    createdAt,
    updatedAt: createdAt,
    to: request?.to?.toString?.() ?? request?.to,
    value: request?.value?.toString?.() ?? request?.value,
    tokenAddress,
    spender,
    amount
  })

  // Make sure wallet is permissioned (MetaMask Mobile sometimes needs this right before send)
  try {
    await provider.send('eth_requestAccounts', [])
  } catch {
    // ignore: some WalletConnect providers do not support it here
  }

  const signer = await provider.getSigner()

  // Capture nonce early (useful for reconciliation / replacement detection)
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
      req.gasLimit = (est * 12n) / 10n // +20%
    }
  } catch (e) {
    txStore.patch(id, { lastError: `estimateGas failed: ${e?.message ?? String(e)}` })
  }

  // ---- primary path: signer.sendTransaction ----
  try {
    const resp = await signer.sendTransaction(req)

    txStore.patch(id, {
      status: 'submitted',
      hash: resp.hash,
      nonce: resp.nonce,
      to: resp.to?.toString?.() ?? resp.to,
      value: resp.value?.toString?.() ?? resp.value
    })

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
  } catch (e1) {
    // ---- fallback path: direct eth_sendTransaction (MetaMask Mobile edge-cases) ----
    const { code, msg } = cleanErr(e1)
    txStore.patch(id, { lastError: `sendTransaction failed: ${msg}${code ? ` (code ${code})` : ''}` })

    // Only attempt fallback when it looks like "pre-broadcast" failure
    // (i.e., no tx hash was ever returned)
    try {
      const rpcTx = toRpcTx({ ...req, from })
      const hash = await provider.send('eth_sendTransaction', [rpcTx])

      if (!hash) throw new Error('eth_sendTransaction returned no hash')

      txStore.patch(id, { status: 'submitted', hash })

      const receipt =
        (await provider.waitForTransaction(hash, waitConfirms, waitTimeoutMs).catch(() => null)) ||
        (await provider.getTransactionReceipt(hash).catch(() => null))

      if (!receipt) {
        return { success: true, id, txHash: hash, receipt: null, status: 'submitted' }
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
        txHash: hash,
        receipt,
        status: receipt.status === 1 ? 'confirmed' : 'failed'
      }
    } catch (e2) {
      const { code: c2, msg: m2 } = cleanErr(e2)
      txStore.patch(id, {
        status: 'failed',
        lastError: `fallback eth_sendTransaction failed: ${m2}${c2 ? ` (code ${c2})` : ''}`
      })
      throw e1
    }
  }
}