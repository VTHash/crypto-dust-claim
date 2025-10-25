// src/services/claimExecutor.js
import axios from 'axios'
import walletService from './walletService'
import { erc20Abi, encodeFunctionData } from 'viem'

// -------------------------------
// Public: execute one chain plan
// -------------------------------
/**
 * Executes a chain plan: optional approvals then swap txs.
 * @param {Object} chainPlan - { chainId: number, steps: Step[] }
 * @param {string=} fromAddress - optional; will be read from wallet if omitted
 * @returns {Promise<Array<{type:'approval'|'swap', ok:boolean, txHash?:string, error?:string}>>}
 */
export async function executeChainPlan(chainPlan, fromAddress) {
  const receipts = []

  // 0) Ensure wallet is connected & on the right chain
  const connected = await walletService.isConnected?.()
  if (!connected) throw new Error('Wallet not connected')

  const currentChainHex = await walletService.getChainId?.()
  const currentChainId =
    typeof currentChainHex === 'string'
      ? parseInt(currentChainHex, 16)
      : Number(currentChainHex || 0)

  if (Number(chainPlan.chainId) !== Number(currentChainId)) {
    const sw = await walletService.switchChain(Number(chainPlan.chainId))
    if (!sw?.success) {
      throw new Error(sw?.error || `Failed to switch to chain ${chainPlan.chainId}`)
    }
  }

  const from =
    fromAddress ||
    (await walletService.getAddress?.()) ||
    (await (async () => {
      const accs = await walletService.getAccounts?.()
      return accs?.[0] || null
    })())

  if (!from) throw new Error('No sender address available')

  // 1) Execute each step
  for (const step of chainPlan.steps) {
    // --- 1a) Approval (if needed and not using permit) ---
    if (step.needsApproval && !step.usePermit) {
      try {
        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [step.spender, BigInt(step.amount)]
        })

        const res = await walletService.sendTransaction({
          to: step.tokenIn,
          from,
          data
        })

        receipts.push({
          type: 'approval',
          ok: !!res.success,
          txHash: res.txHash,
          error: res.error
        })

        // If approval failed, skip the swap for this step
        if (!res.success) continue
      } catch (err) {
        receipts.push({
          type: 'approval',
          ok: false,
          error: err?.message || 'Approval failed'
        })
        // Skip swap if approval failed
        continue
      }
    }

    // --- 1b) Swap ---
    try {
      let tx
      if (step.aggregator === '1inch') {
        tx = await buildOneInchSwapTx(Number(chainPlan.chainId), step, from)
      } else if (step.aggregator === 'paraswap') {
        tx = await buildParaswapTx(Number(chainPlan.chainId), step, from)
      } else {
        throw new Error(`Unsupported aggregator: ${step.aggregator}`)
      }

      const res = await walletService.sendTransaction(tx)

      receipts.push({
        type: 'swap',
        ok: !!res.success,
        txHash: res.txHash,
        error: res.error
      })
    } catch (err) {
      receipts.push({
        type: 'swap',
        ok: false,
        error: err?.response?.data?.message || err?.message || 'Swap failed'
      })
    }
  }

  return receipts
}

// -------------------------------
// Helpers: aggregator tx builders
// -------------------------------

/**
 * Build a sendable tx for 1inch /swap (v5 API).
 * Add `permit` to params if your step carries it (step.permit).
 */
async function buildOneInchSwapTx(chainId, step, from) {
  const base = `https://api.1inch.io/v5.0/${chainId}`

  const params = {
    fromTokenAddress: step.tokenIn,
    toTokenAddress: step.tokenOut,
    amount: String(step.amount), // wei (string)
    fromAddress: from,
    slippage: step.slippage ?? 1,
    disableEstimate: true
  }

  // Optional: pass permit if you have it on step
  if (step.permit) params.permit = step.permit

  const { data } = await axios.get(`${base}/swap`, { params })

  // data.tx typically includes { to, data, value, gas, gasPrice, etc. }
  // We only pass the fields wallets need; wallet/provider will populate the rest.
  return {
    from,
    to: data.tx.to,
    data: data.tx.data,
    value: data.tx.value ?? '0x0' // 1inch returns hex string or number
  }
}

/**
 * Build a sendable tx for Paraswap:
 * Assumes `step.quote.route` exists (from your earlier price call).
 */
async function buildParaswapTx(chainId, step, from) {
  if (!step.quote?.route) {
    throw new Error('Missing Paraswap priceRoute on step.quote.route')
  }
  const priceRoute = step.quote.route

  const { data } = await axios.post(
    `https://api.paraswap.io/transactions/${chainId}`,
    {
      srcToken: step.tokenIn,
      destToken: step.tokenOut,
      srcAmount: String(step.amount), // wei
      destAmount: priceRoute.destAmount,
      priceRoute,
      userAddress: from,
      slippage: step.slippageBps ?? 100 // 1% default in bps
    }
  )

  // Paraswap returns a populated tx object
  return {
    from,
    to: data.to,
    data: data.data,
    value: data.value ?? '0x0'
  }
}