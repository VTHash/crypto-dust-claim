import { txStore } from './txStore'

const isPendingStatus = (s) => s === 'created' || s === 'submitted'

function normalizeReceipt(receipt) {
  return {
    blockNumber: receipt.blockNumber,
    transactionIndex: receipt.index,
    gasUsed: receipt.gasUsed?.toString?.(),
    effectiveGasPrice: receipt.effectiveGasPrice?.toString?.(),
    status: receipt.status === 1 ? 'confirmed' : 'failed'
  }
}

async function detectReplacementOrDrop(provider, tx) {
  if (!tx.hash) return null

  const [onChainTx, receipt] = await Promise.all([
    provider.getTransaction(tx.hash).catch(() => null),
    provider.getTransactionReceipt(tx.hash).catch(() => null)
  ])

  if (receipt) return null
  if (onChainTx) return null // still visible (mempool or provider knows it)

  if (typeof tx.nonce === 'number') {
    const latestCount = await provider.getTransactionCount(tx.from, 'latest').catch(() => null)
    if (latestCount != null && latestCount > tx.nonce) return 'replaced'
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

    const pending = txStore
      .readAll()
      .filter((t) => isPendingStatus(t.status))
      .filter((t) => t.createdAt >= cutoff)
      .filter((t) => !!t.hash)

    if (!pending.length) return

    for (const tx of pending) {
      if (!tx.hash) continue

      const receipt = await provider.getTransactionReceipt(tx.hash).catch(() => null)

      if (receipt) {
        const normalized = normalizeReceipt(receipt)
        txStore.patch(tx.id, {
          ...normalized,
          confirmations: 1
        })
        continue
      }

      const replacement = await detectReplacementOrDrop(provider, tx)
      if (replacement === 'replaced') txStore.patch(tx.id, { status: 'replaced' })
      else if (replacement === 'dropped') txStore.patch(tx.id, { status: 'dropped' })
    }
  }
}