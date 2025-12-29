// src/services/txSend.js
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

function toHexQty(v) {
  const bi = typeof v === 'bigint' ? v : BigInt(v ?? 0)
  if (bi === 0n) return '0x0'
  return '0x' + bi.toString(16)
}

function toRpcTx(req) {
  const out = {}
  if (req.from) out.from = req.from
  if (req.to) out.to = req.to
  if (req.data) out.data = req.data
  if (req.value != null) out.value = toHexQty(req.value)
  if (req.gasLimit != null) out.gas = toHexQty(req.gasLimit)
  if (req.maxFeePerGas != null) out.maxFeePerGas = toHexQty(req.maxFeePerGas)
  if (req.maxPriorityFeePerGas != null) out.maxPriorityFeePerGas = toHexQty(req.maxPriorityFeePerGas)
  if (req.gasPrice != null) out.gasPrice = toHexQty(req.gasPrice)
  if (req.nonce != null) out.nonce = toHexQty(req.nonce)
  return out
}

export async function sendTransactionReliable({
  provider, // ethers.BrowserProvider
  chainId,
  from,
  kind = 'unknown',
  request, // ethers TransactionRequest
  tokenAddress,
  spender,
  amount,
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
    amount,
    txHash: null,
    hash: null
  })

  // Ensure wallet permission (MetaMask Mobile sometimes needs this right before send)
  try {
    await provider.send('eth_requestAccounts', [])
  } catch {
    // ignore
  }

  const signer = await provider.getSigner()

  // Capture nonce early (optional)
  try {
    const nonce = await signer.getNonce()
    txStore.patch(id, { nonce })
  } catch {
    // ignore
  }

  // Robust gas handling
  let req = { ...request }
  try {
    if (!req.gasLimit) {
      const est = await signer.estimateGas(req)
      req.gasLimit = (est * 12n) / 10n // +20%
    }
  } catch (e) {
    txStore.patch(id, { lastError: `estimateGas failed: ${e?.message ?? String(e)}` })
  }

  // Mark prompting BEFORE opening MetaMask UI (critical on MetaMask Mobile)
  txStore.patch(id, { status: 'prompting', updatedAt: Date.now() })

  // ---- primary path: signer.sendTransaction ----
  try {
    const resp = await signer.sendTransaction(req)

    txStore.patch(id, {
      status: 'submitted',
      txHash: resp.hash,
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
      blockNumber: receipt.blockNumber ?? null,
      transactionIndex: receipt.transactionIndex ?? null,
      gasUsed: receipt.gasUsed?.toString?.() ?? null,
      effectiveGasPrice: receipt.effectiveGasPrice?.toString?.() ?? null,
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
    // ---- fallback path: direct eth_sendTransaction ----
    const { code, msg } = cleanErr(e1)
    txStore.patch(id, { lastError: `sendTransaction failed: ${msg}${code ? ` (code ${code})` : ''}` })

    try {
      // Mark prompting again right before RPC send attempt (safe + consistent)
      txStore.patch(id, { status: 'prompting', updatedAt: Date.now() })

      const rpcTx = toRpcTx({ ...req, from })
      const hash = await provider.send('eth_sendTransaction', [rpcTx])
      if (!hash) throw new Error('eth_sendTransaction returned no hash')

      txStore.patch(id, { status: 'submitted', txHash: hash, hash })

      const receipt =
        (await provider.waitForTransaction(hash, waitConfirms, waitTimeoutMs).catch(() => null)) ||
        (await provider.getTransactionReceipt(hash).catch(() => null))

      if (!receipt) {
        return { success: true, id, txHash: hash, receipt: null, status: 'submitted' }
      }

      txStore.patch(id, {
        status: receipt.status === 1 ? 'confirmed' : 'failed',
        blockNumber: receipt.blockNumber ?? null,
        transactionIndex: receipt.transactionIndex ?? null,
        gasUsed: receipt.gasUsed?.toString?.() ?? null,
        effectiveGasPrice: receipt.effectiveGasPrice?.toString?.() ?? null,
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