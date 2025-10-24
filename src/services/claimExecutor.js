import walletService from './walletService.js'
import { erc20Abi, encodeFunctionData } from 'viem'
import axios from 'axios';

/**
 * Executes a chain plan: approvals (if needed) then swap TXs.
 * Returns per-step receipts (hashes or errors).
 */
export async function executeChainPlan(chainPlan, fromAddress) {
  const receipts = []

  for (const step of chainPlan.steps) {
    // 1) approval (if needed and no permit)
    if (step.needsApproval && !step.usePermit) {
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [step.spender, BigInt(step.amount)],
      })

      const res = await walletService.sendTransaction({
        to: step.tokenIn,
        from: fromAddress,
        data,
      })
      receipts.push({ type: 'approval', ok: res.success, txHash: res.txHash, error: res.error })
      if (!res.success) continue // skip swap if approval failed
    }

    // 2) swap — build tx via aggregator API
    if (step.aggregator === '1inch') {
      // 1inch swap endpoint provides complete tx
      const tx = await buildOneInchSwapTx(chainPlan.chainId, step, fromAddress)
      const res = await walletService.sendTransaction(tx)
      receipts.push({ type: 'swap', ok: res.success, txHash: res.txHash, error: res.error })
    } else if (step.aggregator === 'paraswap') {
      const tx = await buildParaswapTx(chainPlan.chainId, step, fromAddress)
      const res = await walletService.sendTransaction(tx)
      receipts.push({ type: 'swap', ok: res.success, txHash: res.txHash, error: res.error })
    }
  }

  return receipts
}

async function buildOneInchSwapTx(chainId, step, from) {
  // NOTE: add permit params if step.usePermit (1inch supports it via "permit" param in /swap)
  const base = `https://api.1inch.io/v5.0/${chainId}`
  const { data } = await axios.get(`${base}/swap`, {
    params: {
      fromTokenAddress: step.tokenIn,
      toTokenAddress: step.tokenOut,
      amount: step.amount,
      fromAddress: from,
      slippage: 1,
      disableEstimate: true,
    },
  })
  // data.tx contains { to, data, value, gas } etc.
  return { ...data.tx, from }
}

async function buildParaswapTx(chainId, step, from) {
  // Paraswap flow: /prices -> /transactions
  const priceRoute = step.quote.route
  const { data } = await axios.post(`${'https://api.paraswap.io'}/transactions/${chainId}`, {
    srcToken: step.tokenIn,
    destToken: step.tokenOut,
    srcAmount: step.amount,
    destAmount: priceRoute.destAmount,
    priceRoute,
    userAddress: from,
    slippage: 100, // bps
  })
  return { ...data, from }
}