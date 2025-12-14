import walletService from './walletService'
import { encodeFunctionData } from 'viem'
import DustClaimABI from '../config/contracts/dustclaim.common.json'
import { DEPLOYMENTS, DUSTCLAIM_V3_ABI } from '../config/deployments'

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

  const connected = await walletService.isConnected?.()
  if (!connected) throw new Error('Wallet not connected')

  const currentChainHex = await walletService.getChainId?.()
  const currentChainId =
    typeof currentChainHex === 'string'
      ? parseInt(currentChainHex, 16)
      : Number(currentChainHex || 0)

  if (Number(chainPlan.chainId) !== Number(currentChainId)) {
    const sw = await walletService.switchChain(Number(chainPlan.chainId))
    if (!sw?.success) throw new Error(sw?.error || `Chain switch failed`)
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
  if (!dep?.dustClaimV3) {
    throw new Error(`Missing DustClaimV3 deployment for chain ${chainPlan.chainId}`)
  }

  for (const step of chainPlan.steps) {
    // 1) APPROVE DustClaimV3 (contract pulls tokens)
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

    // 2) SWAP THROUGH DustClaimV3 using 0x calldata
    try {
      if (step.aggregator !== '0x') throw new Error('Only 0x supported')

      const { swapCalldata, allowanceTarget } = await build0xCalldata(
        Number(chainPlan.chainId),
        step,
        dep.dustClaimV3 // takerAddress = contract
      )

      const data = encodeFunctionData({
        abi: DUSTCLAIM_V3_ABI,
        functionName: 'claimDustUsingAggregator',
        args: [
          step.tokenIn,
          BigInt(step.amount),
          allowanceTarget,
          swapCalldata
        ]
      })

      const res = await walletService.sendTransaction({
        from,
        to: dep.dustClaimV3,
        data,
        value: '0x0'
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
        error: err?.response?.data?.message || err?.message || 'Swap failed'
      })
    }
  }

  return receipts
}

async function build0xCalldata(chainId, step, takerAddress) {
  const host = ZEROX_HOST_BY_CHAIN?.[Number(chainId)]
  if (!host) throw new Error(`0x not supported on chain ${chainId}`)

  const slippagePct = step.slippage != null ? Number(step.slippage) : 1

  const { data } = await axios.get(`${host}/swap/v1/quote`, {
    params: {
      sellToken: step.tokenIn,
      buyToken: step.tokenOut,
      sellAmount: String(step.amount),
      takerAddress, // MUST be DustClaimV3
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