// src/services/claimExecutor.js
import axios from 'axios'
import walletService from './walletService'
import { encodeFunctionData, erc20Abi } from 'viem'
import { DEPLOYMENTS, DUSTCLAIM_V3_ABI } from '../config/deployments'

// -------------------------------
// 0x Swap API v2 (Allowance Holder)
// -------------------------------
const ZEROX_V2_HOST = 'https://api.0x.org'

async function get0xAllowanceHolderQuote({
  chainId,
  sellToken,
  buyToken,
  sellAmountWei,
  taker,
  txOrigin,
  slippageBps
}) {
  const { data } = await axios.post('/.netlify/functions/0x-quote', {
  chainId: Number(chainId),
  sellToken: tokenIn,
  buyToken: dep.weth,
  sellAmount: String(sellAmountWei),

  taker: dep.dustClaimV3,
  recipient: dep.dustClaimV3,
  txOrigin: options.txOrigin, // <-- user EOA
  slippageBps: Math.round(slippagePct * 100) // 1% => 100
})

  return data || null
}

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

  if (!from) throw new Error('No wallet address')

  const dep = DEPLOYMENTS?.[Number(chainPlan.chainId)]
  if (!dep?.dustClaimV3) throw new Error(`Missing DustClaimV3 deployment for chain ${chainPlan.chainId}`)
  if (!dep?.weth) throw new Error(`Missing wrapped native (weth) for chain ${chainPlan.chainId}`)

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
          from,
          to: step.tokenIn,
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
    // 2) SWAP via DustClaimV3
    // -------------------------
    try {
      if (step.aggregator !== '0x') {
        throw new Error(`Unsupported aggregator: ${step.aggregator || 'none'} (only 0x supported)`)
      }

      // If plan already included calldata/spender, use it; otherwise fetch again.
      let routerSpender = step.routerSpender
      let swapCalldata = step.swapCalldata

      if (!routerSpender || !swapCalldata) {
        const slippagePct = Number(step.slippage ?? 1)
        const slippageBps = Math.max(1, Math.round(slippagePct * 100))

        const quote = await get0xAllowanceHolderQuote({
          chainId: Number(chainPlan.chainId),
          sellToken: step.tokenIn,
          buyToken: dep.weth,
          sellAmountWei: String(step.amount),
          taker: dep.dustClaimV3,
          txOrigin: from,
          slippageBps
        })

        const callTarget = quote?.transaction?.to
        swapCalldata = quote?.transaction?.data
        routerSpender =
          quote?.issues?.allowance?.spender ||
          quote?.allowanceTarget ||
          callTarget

        if (!routerSpender || !swapCalldata) {
          throw new Error('Invalid 0x v2 quote response')
        }
      }

      // Encode DustClaimV3 call:
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