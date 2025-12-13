// src/services/claimExecutor.js
import axios from 'axios'
import walletService from './walletService'
import { encodeFunctionData } from 'viem'
import DustClaimABI from '../config/contracts/dustclaim.common.json'
import { DEPLOYMENTS } from '../config/deployments'

// -------------------------------
// 0x Swap API hosts (quote only)
// -------------------------------
export const ZEROX_HOST_BY_CHAIN = {
  1: 'https://api.0x.org',
  10: 'https://optimism.api.0x.org',
  56: 'https://bsc.api.0x.org',
  130: 'https://unichain.api.0x.org',
  137: 'https://polygon.api.0x.org',
  143: 'https://monad.api.0x.org',
  146: 'https://sonic.api.0x.org',
  480: 'https://worldchain.api.0x.org',
  5000: 'https://mantle.api.0x.org',
  9745: 'https://plasma.api.0x.org',
  42161: 'https://arbitrum.api.0x.org',
  43114: 'https://avalanche.api.0x.org',
  534352: 'https://scroll.api.0x.org',
  59144: 'https://linea.api.0x.org',
  80094: 'https://berachain.api.0x.org',
  81457: 'https://blast.api.0x.org',
  34443: 'https://mode.api.0x.org',
  8453: 'https://base.api.0x.org',
  57073: 'https://ink.api.0x.org'
}

// --------------------------------------------------
// Execute chain plan THROUGH DustClaimV3
// --------------------------------------------------
export async function executeChainPlan(chainPlan, fromAddress) {
  const receipts = []

  const connected = await walletService.isConnected()
  if (!connected) throw new Error('Wallet not connected')

  const currentChainHex = await walletService.getChainId()
  const currentChainId = parseInt(currentChainHex, 16)

  if (Number(chainPlan.chainId) !== currentChainId) {
    const sw = await walletService.switchChain(chainPlan.chainId)
    if (!sw?.success) throw new Error('Chain switch failed')
  }

  const from =
    fromAddress ||
    (await walletService.getAddress()) ||
    (await walletService.getAccounts())?.[0]

  if (!from) throw new Error('No wallet address')

  const deployment = DEPLOYMENTS[chainPlan.chainId]
  if (!deployment?.dustclaim) {
    throw new Error(`DustClaimV3 not deployed on chain ${chainPlan.chainId}`)
  }

  // Execute each dust swap THROUGH the contract
  for (const step of chainPlan.steps) {
    try {
      if (step.aggregator !== '0x') {
        throw new Error('Only 0x supported')
      }

      // 1) Ask 0x for calldata (taker = DustClaimV3)
      const { swapCalldata, allowanceTarget } =
        await build0xCalldata(chainPlan.chainId, step, deployment.dustclaim)

      // 2) Encode DustClaimV3 call
      const data = encodeFunctionData({
        abi: DustClaimABI,
        functionName: 'claimDustUsingAggregator',
        args: [
          step.tokenIn,
          BigInt(step.amount),
          allowanceTarget,
          swapCalldata
        ]
      })

      // 3) Send tx → DustClaimV3
      const res = await walletService.sendTransaction({
        from,
        to: deployment.dustclaim,
        data
      })

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
        error: err?.response?.data?.message || err.message
      })
    }
  }

  return receipts
}

// --------------------------------------------------
// 0x helper (quote only)
// --------------------------------------------------
async function build0xCalldata(chainId, step, takerAddress) {
  const host = ZEROX_HOST_BY_CHAIN[chainId]
  if (!host) throw new Error(`0x not supported on ${chainId}`)

  const slippagePct = step.slippage != null ? step.slippage : 1

  const { data } = await axios.get(`${host}/swap/v1/quote`, {
    params: {
      sellToken: step.tokenIn,
      buyToken: step.tokenOut,
      sellAmount: String(step.amount),
      takerAddress,
      slippagePercentage: slippagePct / 100
    }
  })

  if (!data?.data || !data?.allowanceTarget) {
    throw new Error('Invalid 0x response')
  }

  return {
    swapCalldata: data.data,
    allowanceTarget: data.allowanceTarget
  }
}