// src/services/txReconciler.js
import { txStore } from './txStore'

const isPendingStatus = (s) => s === 'created' || s === 'submitted'

const getHash = (t) => t?.txHash || t?.hash || null

function normalizeReceipt(receipt) {
  return {
    blockNumber: receipt.blockNumber ?? null,
    transactionIndex: receipt.transactionIndex ?? null,
    gasUsed: receipt.gasUsed?.toString?.() ?? null,
    effectiveGasPrice: receipt.effectiveGasPrice?.toString?.() ?? null,
    status: receipt.status === 1 ? 'confirmed' : 'failed'
  }
}

/**
 * Replacement/drop detection is *best-effort*.
 * We do NOT assume nonce exists in store.
 */
async function detectDrop(provider, txHash) {
  const [onChainTx, receipt] = await Promise.all([
    provider.getTransaction(txHash).catch(() => null),
    provider.getTransactionReceipt(txHash).catch(() => null)
  ])

  if (receipt) return null
  if (onChainTx) return null // still visible (mempool or provider knows it)

  // If provider cannot see tx + no receipt, treat as dropped (do not guess "replaced")
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

    const pending = txStore
      .readAll()
      .filter((t) => isPendingStatus(t.status))
      .filter((t) => (t.createdAt ?? 0) >= cutoff)
      .filter((t) => !!getHash(t))

    if (!pending.length) return

    for (const tx of pending) {
      const txHash = getHash(tx)
      if (!txHash) continue

      const receipt = await provider.getTransactionReceipt(txHash).catch(() => null)

      if (receipt) {
        const normalized = normalizeReceipt(receipt)
        txStore.patch(tx.id, {
          ...normalized,
          confirmations: 1,
          txHash // ensure it’s persisted in case old record used "hash"
        })
        continue
      }

      const drop = await detectDrop(provider, txHash)
      if (drop === 'dropped') {
        txStore.patch(tx.id, { status: 'dropped', txHash })
      }
    }
  }
}