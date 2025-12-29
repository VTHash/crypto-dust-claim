// src/services/txReconciler.js
import { txStore } from './txStore'

const isPendingStatus = (s) => s === 'created' || s === 'submitted' || s === 'prompting'

const getHash = (t) => t?.txHash || t?.hash || null

function normalizeReceipt(receipt) {
  return {
    blockNumber: receipt?.blockNumber ?? null,
    transactionIndex: receipt?.transactionIndex ?? null,
    gasUsed: receipt?.gasUsed?.toString?.() ?? null,
    effectiveGasPrice: receipt?.effectiveGasPrice?.toString?.() ?? null,
    status: receipt?.status === 1 ? 'confirmed' : 'failed'
  }
}

/**
 * Best-effort replacement/drop detection.
 * - Never declare dropped immediately (RPC indexing delays on mobile are common)
 * - Prefer "replaced" only when we have a nonce and the account nonce has advanced
 */
async function detectReplacementOrDrop(provider, tx) {
  const txHash = getHash(tx)
  if (!txHash) return null

  const [onChainTx, receipt] = await Promise.all([
    provider.getTransaction(txHash).catch(() => null),
    provider.getTransactionReceipt(txHash).catch(() => null)
  ])

  if (receipt) return null
  if (onChainTx) return null // still visible somewhere (mempool or provider cache)

  // If we have a nonce, we can infer replacement when latest nonce moved past it.
  const nonce = typeof tx?.nonce === 'number' ? tx.nonce : null
  const from = tx?.from

  if (nonce != null && from) {
    const latestCount = await provider.getTransactionCount(from, 'latest').catch(() => null)
    if (latestCount != null && latestCount > nonce) return 'replaced'
  }

  return 'dropped'
}

export class TxReconciler {
  constructor(providerFactory, opts = {}) {
    this.providerFactory = providerFactory
    this.opts = opts
    this.timer = null
    this.stopped = true

    this.onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        this.reconcileOnce().catch(() => {})
      }
    }
  }

  start() {
    if (!this.stopped) return
    this.stopped = false

    const pollMs = this.opts.pollMs ?? 6000

    const tick = async () => {
      if (this.stopped) return
      try {
        await this.reconcileOnce()
      } catch (e) {
        this.opts.log?.('txReconciler.tick error', e)
      } finally {
        if (!this.stopped) this.timer = setTimeout(tick, pollMs)
      }
    }

    void tick()
    document.addEventListener('visibilitychange', this.onVisibilityChange)
  }

  stop() {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
  }

  async reconcileOnce() {
    const provider = await this.providerFactory()
    if (!provider) return

    const maxAgeMs = this.opts.maxAgeMs ?? 24 * 60 * 60 * 1000
    const cutoff = Date.now() - maxAgeMs

    // ✅ Grace period before declaring "dropped"
    // MetaMask Mobile + some RPCs won't show a tx immediately.
    const graceMs = this.opts.graceMs ?? 90_000

    const pending = txStore
      .readAll()
      .filter((t) => isPendingStatus(t?.status))
      .filter((t) => (t?.createdAt ?? 0) >= cutoff)
      .filter((t) => !!getHash(t))

    if (!pending.length) return

    for (const tx of pending) {
      const txHash = getHash(tx)
      if (!txHash) continue

      // 1) Receipt check
      const receipt = await provider.getTransactionReceipt(txHash).catch(() => null)
      if (receipt) {
        const normalized = normalizeReceipt(receipt)
        txStore.patch(tx.id, {
          ...normalized,
          confirmations: 1,
          txHash,
          hash: txHash // keep both for compatibility
        })
        continue
      }

      // 2) Do not mark dropped/replaced too early
      const age = Date.now() - (tx?.createdAt ?? Date.now())
      if (age < graceMs) continue

      // 3) Attempt replacement/drop inference
      const result = await detectReplacementOrDrop(provider, tx)

      if (result === 'replaced') {
        txStore.patch(tx.id, {
          status: 'replaced',
          txHash,
          hash: txHash
        })
      } else if (result === 'dropped') {
        txStore.patch(tx.id, {
          status: 'dropped',
          txHash,
          hash: txHash
        })
      }
    }
  }
}