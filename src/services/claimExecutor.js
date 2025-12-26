import axios from 'axios'
import { ethers } from 'ethers'
import walletService from './walletService'
import { encodeFunctionData, erc20Abi } from 'viem'
import { DEPLOYMENTS, DUSTCLAIM_V3_ABI } from '../config/deployments'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const newFlowId = () => `flow_${Math.random().toString(16).slice(2)}_${Date.now()}`

export async function executeChainPlan(chainPlan, fromAddress) {
  const receipts = []
  const flowId = newFlowId()

  const connected = await walletService.isConnected?.()
  if (!connected) {
    const res = await walletService.connect?.()
    if (!res?.success) throw new Error(res?.error || 'Wallet connection failed')
  }

  const currentChainHex = await walletService.getChainId?.()
  const currentChainId =
    typeof currentChainHex === 'string'
      ? parseInt(currentChainHex, 16)
      : Number(currentChainHex || 0)

  if (Number(chainPlan.chainId) !== Number(currentChainId)) {
    const sw = await walletService.switchChain(Number(chainPlan.chainId))
    if (!sw?.success) throw new Error(sw?.error || 'Chain switch failed')

    const afterHex = await walletService.getChainId?.()
    const afterId = typeof afterHex === 'string' ? parseInt(afterHex, 16) : Number(afterHex || 0)
    if (Number(afterId) !== Number(chainPlan.chainId)) {
      throw new Error(`Chain switch did not complete (expected ${chainPlan.chainId}, got ${afterId})`)
    }

    await sleep(400)
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

  const provider = await walletService.getBrowserProvider?.()
  if (!provider) throw new Error('Provider unavailable')

  try {
    walletService.startTxReconciler?.()
  } catch {
    // ignore
  }

  async function hasSufficientAllowance(token, owner, spender, needed) {
    try {
      const allowanceData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'allowance',
        args: [owner, spender]
      })

      const raw = await provider.call({ to: token, data: allowanceData })
      const [current] = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], raw)
      return BigInt(current.toString()) >= BigInt(needed)
    } catch {
      return false
    }
  }

  for (const step of chainPlan.steps) {
    const tokenIn = step.tokenIn
    const tokenOut = step.tokenOut
    const amountWei = BigInt(step.amount || 0)

    // 1) APPROVE
    if (step.needsApproval && !step.usePermit) {
      const spender = step.spender || step.routerSpender || dep.dustClaimV3

      try {
        const okAllowance = await hasSufficientAllowance(tokenIn, from, spender, amountWei)
        if (okAllowance) {
          receipts.push({
            flowId,
            type: 'approval',
            ok: true,
            skipped: true,
            reason: 'allowance already sufficient',
            tokenIn,
            spender,
            amount: String(amountWei)
          })
        } else {
          const approvalData = encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [spender, amountWei]
          })

          const approvalRes = await walletService.sendTransactionWithReceipt(
            { from, to: tokenIn, data: approvalData, value: 0n },
            {
              flowId,
              kind: 'approval',
              title: 'Approve token',
              step: 'approval',
              tokenAddress: tokenIn,
              spender,
              amount: String(amountWei),
              waitConfirms: 1,
              waitTimeoutMs: 180000
            }
          )

          receipts.push({
            flowId,
            type: 'approval',
            ok: !!approvalRes?.success,
            txId: approvalRes?.txId || null,
            txHash: approvalRes?.txHash || null,
            status: approvalRes?.status || null,
            chainId: Number(chainPlan.chainId),
            tokenIn,
            spender,
            amount: String(amountWei),
            blockNumber: approvalRes?.receipt?.blockNumber ?? null,
            error: approvalRes?.error || null
          })

          if (!approvalRes?.success) continue
          await sleep(650)
        }
      } catch (err) {
        receipts.push({
          flowId,
          type: 'approval',
          ok: false,
          error: err?.shortMessage || err?.reason || err?.message || 'Approval failed',
          tokenIn,
          spender,
          amount: String(amountWei)
        })
        continue
      }
    }

    // 2) SWAP via DustClaimV3 (0x)
    try {
      if (step.aggregator !== '0x') {
        throw new Error(`Unsupported aggregator: ${step.aggregator || 'none'} (only 0x supported)`)
      }

      let routerSpender = step.routerSpender
      let swapCalldata = step.swapCalldata
      let gasFromQuote = null

      if (!routerSpender || !swapCalldata) {
        const { data: q } = await axios.post(
          '/.netlify/functions/0x-quote',
          {
            chainId: Number(chainPlan.chainId),
            sellToken: tokenIn,
            buyToken: tokenOut,
            sellAmount: String(step.amount),
            taker: dep.dustClaimV3,
            recipient: dep.dustClaimV3,
            txOrigin: from,
            slippageBps: Math.round(Number(step.slippage ?? 1) * 100)
          },
          { headers: { 'content-type': 'application/json' } }
        )

        if (!q?.transaction?.to || !q?.transaction?.data) {
          receipts.push({
            flowId,
            type: 'swap',
            ok: false,
            error: q?.message || '0x quote has no transaction (no route/liquidity)',
            tokenIn,
            tokenOut
          })
          continue
        }

        gasFromQuote = q?.transaction?.gas ?? null
        routerSpender = q?.issues?.allowance?.spender || q?.allowanceTarget || null
        swapCalldata = q?.transaction?.data || null

        if (!routerSpender || !swapCalldata) {
          receipts.push({
            flowId,
            type: 'swap',
            ok: false,
            error: '0x quote missing spender/calldata (no route/liquidity)',
            tokenIn,
            tokenOut
          })
          continue
        }
      }

      const data = encodeFunctionData({
        abi: DUSTCLAIM_V3_ABI,
        functionName: 'claimDustUsingAggregator',
        args: [tokenIn, BigInt(step.amount), routerSpender, swapCalldata]
      })

      // Gas strategy:
      // - baseline from quote if present
      // - plus contract-level estimateGas buffer (Mobile-safe)
      let gasLimit = gasFromQuote ? BigInt(gasFromQuote) + 50_000n : 900_000n

      try {
        const signer = await walletService.getSigner?.()
        if (signer) {
          const contract = new ethers.Contract(dep.dustClaimV3, DUSTCLAIM_V3_ABI, signer)
          const est = await contract.claimDustUsingAggregator.estimateGas(
            tokenIn,
            BigInt(step.amount),
            routerSpender,
            swapCalldata
          )
          const bumped = (BigInt(est) * 130n) / 100n
          if (bumped > gasLimit) gasLimit = bumped
        }
      } catch {
        // keep fallback gas
      }

      const swapRes = await walletService.sendTransactionWithReceipt(
        { from, to: dep.dustClaimV3, data, value: 0n, gasLimit },
        {
          flowId,
          kind: 'swap',
          title: 'Swap via 0x',
          step: 'swap',
          tokenAddress: tokenIn,
          spender: routerSpender,
          amount: String(step.amount),
          waitConfirms: 1,
          waitTimeoutMs: 240000
        }
      )

      receipts.push({
        flowId,
        type: 'swap',
        ok: !!swapRes?.success,
        txId: swapRes?.txId || null,
        txHash: swapRes?.txHash || null,
        status: swapRes?.status || null,
        chainId: Number(chainPlan.chainId),
        tokenIn,
        tokenOut,
        routerSpender,
        blockNumber: swapRes?.receipt?.blockNumber ?? null,
        error: swapRes?.error || null
      })

      await sleep(650)
    } catch (err) {
      receipts.push({
        flowId,
        type: 'swap',
        ok: false,
        error:
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.shortMessage ||
          err?.reason ||
          err?.message ||
          'Swap failed',
        tokenIn,
        tokenOut
      })
    }
  }

  return { flowId, receipts }
}