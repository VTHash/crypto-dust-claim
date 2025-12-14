// src/services/claimExecutor.js
import axios from 'axios'
import walletService from './walletService'
import { encodeFunctionData, erc20Abi } from 'viem'
import { DEPLOYMENTS, DUSTCLAIM_V3_ABI } from '../config/deployments'

// --------------------------------------------------
// Execute chain plan THROUGH DustClaimV3
// --------------------------------------------------
export async function executeChainPlan(chainPlan, fromAddress) {
  const receipts = []

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
      throw new Error(sw?.error || `Chain switch failed`)
    }
  }

  const from =
    fromAddress ||
    (await walletService.getAddress?.()) ||
    (await (async () => {
      const accs = await walletService.getAccounts?.()
      return accs?.[0] || null
    })())

  if (!from) throw new Error('No wallet address')

  const dep = DEPLOYMENTS?.[Number(chainPlan.chainId)]
  if (!dep?.dustClaimV3) throw new Error(`Missing DustClaimV3 deployment for chain ${chainPlan.chainId}`)

  for (const step of chainPlan.steps) {
    // -------------------------
    // 1) APPROVE DustClaimV3
    // -------------------------
    if (step.needsApproval && !step.usePermit) {
      try {
        const approvalData = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [dep.dustClaimV3, BigInt(step.amount)]
        })

        const res = await walletService.sendTransaction({
          to: step.tokenIn,
          from,
          data: approvalData
        })

        receipts.push({
          type: 'approval',
          ok: !!res.success,
          txHash: res.txHash,
          error: res.error
        })

        if (!res.success) continue
      } catch (err) {
        receipts.push({
          type: 'approval',
          ok: false,
          error: err?.message || 'Approval failed'
        })
        continue
      }
    }

    // -------------------------
    // 2) SWAP THROUGH DustClaimV3
    // -------------------------
    try {
      if (step.aggregator !== '0x') {
        throw new Error(`Unsupported aggregator: ${step.aggregator || 'none'} (only 0x supported now)`)
      }

      // Use plan calldata/spender if present
      let routerSpender = step.routerSpender
      let swapCalldata = step.swapCalldata

      // Fallback: attempt to rebuild via legacy v1 (best compatibility)
      if (!routerSpender || !swapCalldata) {
        if (!dep?.zeroXHost) throw new Error('0x not supported on this chain (missing zeroXHost)')
        if (!dep?.weth) throw new Error('Missing WETH for this chain')

        const { data } = await axios.get(`${dep.zeroXHost}/swap/v1/quote`, {
          params: {
            sellToken: step.tokenIn,
            buyToken: dep.weth,
            sellAmount: String(step.amount),
            takerAddress: dep.dustClaimV3,
            slippagePercentage: (Number(step.slippage ?? 1)) / 100
          }
        })

        routerSpender = data?.allowanceTarget
        swapCalldata = data?.data
        if (!routerSpender || !swapCalldata) throw new Error('Invalid 0x v1 quote response')
      }

      // Encode DustClaimV3 call
      const data = encodeFunctionData({
        abi: DUSTCLAIM_V3_ABI,
        functionName: 'claimDustUsingAggregator',
        args: [
          step.tokenIn,
          BigInt(step.amount),
          routerSpender,
          swapCalldata
        ]
      })

      const tx = {
        from,
        to: dep.dustClaimV3,
        data,
        value: '0x0'
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