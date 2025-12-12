// src/services/claimExecutor.js
import axios from 'axios'
import walletService from './walletService'
import { erc20Abi, encodeFunctionData } from 'viem'

// 0x Swap API hosts per chain (19 supported chains)
export const ZEROX_HOST_BY_CHAIN = {
  1: 'https://api.0x.org',                 // Ethereum (Mainnet)

  10: 'https://optimism.api.0x.org',        // Optimism
  56: 'https://bsc.api.0x.org',             // BSC
  130: 'https://unichain.api.0x.org',       // Unichain
  137: 'https://polygon.api.0x.org',        // Polygon
  143: 'https://monad.api.0x.org',          // Monad
  146: 'https://sonic.api.0x.org',          // Sonic
  480: 'https://worldchain.api.0x.org',     // World Chain
  5000: 'https://mantle.api.0x.org',        // Mantle
  9745: 'https://plasma.api.0x.org',        // Plasma

  42161: 'https://arbitrum.api.0x.org',     // Arbitrum
  43114: 'https://avalanche.api.0x.org',    // Avalanche
  534352: 'https://scroll.api.0x.org',      // Scroll
  59144: 'https://linea.api.0x.org',        // Linea

  80094: 'https://berachain.api.0x.org',    // Berachain
  81457: 'https://blast.api.0x.org',        // Blast
  34443: 'https://mode.api.0x.org',         // Mode
  8453: 'https://base.api.0x.org',          // Base
  57073: 'https://ink.api.0x.org',          // Ink
}

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
      // If we don't have a spender, skip approval instead of killing the flow
      if (!step.spender) {
        console.warn(
          '[executeChainPlan] step.needsApproval=true but no step.spender set – skipping approval for this step',
          step
        )
      } else {
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
    }

    // --- 1b) Swap (0x only now) ---
    try {
      if (step.aggregator !== '0x') {
        throw new Error(`Unsupported aggregator: ${step.aggregator || 'none'} (only 0x supported now)`)
      }

      const tx = await build0xSwapTx(Number(chainPlan.chainId), step, from)

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
// Helpers: 0x tx builder
// -------------------------------

/**
 * Build a sendable tx for 0x /swap/v1/quote.
 * Uses step.{tokenIn, tokenOut, amount, slippage} and takerAddress = from.
 */
async function build0xSwapTx(chainId, step, from) {
  const host = ZEROX_HOST_BY_CHAIN[Number(chainId)]
  if (!host) {
    throw new Error(`0x not supported on chain ${chainId}`)
  }

  const slippagePct = step.slippage != null ? Number(step.slippage) : 1 // 1% default

  const { data } = await axios.get(`${host}/swap/v1/quote`, {
    params: {
      sellToken: step.tokenIn,
      buyToken: step.tokenOut,
      sellAmount: String(step.amount), // wei (string)
      takerAddress: from,
      slippagePercentage: slippagePct / 100
    }
  })

  if (!data?.to || !data?.data) {
    throw new Error('Malformed 0x quote response')
  }

  return {
    from,
    to: data.to,
    data: data.data,
    value: data.value ?? '0x0'
  }
}
