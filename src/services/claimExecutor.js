// claimExecutor.js
import axios from 'axios'
import { ethers } from 'ethers'
import walletService from './walletService'
import { encodeFunctionData, erc20Abi } from 'viem'
import { DEPLOYMENTS, DUSTCLAIM_V3_ABI } from '../config/deployments'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const newFlowId = () => `flow_${Math.random().toString(16).slice(2)}_${Date.now()}`

// ------------------------------
// Mobile-safe helpers
// ------------------------------
const isNonZeroAddress = (a) =>
  typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a) && a.toLowerCase() !== '0x0000000000000000000000000000000000000000'

const isHexData = (d) => typeof d === 'string' && d.startsWith('0x') && d.length > 10

const normalize0xQuote = (q) => {
  const txTo = q?.transaction?.to || null
  const txData = q?.transaction?.data || null
  const gas = q?.transaction?.gas ?? null
  const spender = q?.issues?.allowance?.spender || q?.allowanceTarget || null
  const liquidityAvailable = q?.liquidityAvailable

  const okTx = isNonZeroAddress(txTo) && isHexData(txData)
  const okSpender = isNonZeroAddress(spender)

  return {
    okTx,
    okSpender,
    txTo,
    txData,
    gas,
    spender,
    liquidityAvailable,
    message: q?.message || null
  }
}

const axiosPostJson = async (url, body) => {
  // MetaMask mobile webview can be picky; be explicit.
  return axios.post(url, body, {
    headers: {
      'content-type': 'application/json',
      accept: 'application/json'
    },
    timeout: 30000
  })
}

// ------------------------------
// NEW: Flow-aware version (returns { flowId, receipts })
// ------------------------------
export async function executeChainPlanWithFlow(chainPlan, fromAddress) {
  const receipts = []
  const flowId = newFlowId()

  // Guard: chainPlan shape
  if (!chainPlan || !Array.isArray(chainPlan.steps)) {
    return {
      flowId,
      receipts: [
        {
          flowId,
          type: 'error',
          ok: false,
          error: 'Invalid chainPlan: missing steps[]'
        }
      ]
    }
  }

  // Ensure wallet connected
  const connected = await walletService.isConnected?.()
  if (!connected) {
    const res = await walletService.connect?.()
    if (!res?.success) throw new Error(res?.error || 'Wallet connection failed')
  }

  // Ensure correct chain
  const currentChainHex = await walletService.getChainId?.()
  const currentChainId =
    typeof currentChainHex === 'string' ? parseInt(currentChainHex, 16) : Number(currentChainHex || 0)

  if (Number(chainPlan.chainId) !== Number(currentChainId)) {
    const sw = await walletService.switchChain(Number(chainPlan.chainId))
    if (!sw?.success) throw new Error(sw?.error || 'Chain switch failed')

    const afterHex = await walletService.getChainId?.()
    const afterId = typeof afterHex === 'string' ? parseInt(afterHex, 16) : Number(afterHex || 0)
    if (Number(afterId) !== Number(chainPlan.chainId)) {
      throw new Error(`Chain switch did not complete (expected ${chainPlan.chainId}, got ${afterId})`)
    }

    await sleep(500)
  }

  // Resolve from address
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

  // Provider
  const provider = await walletService.getBrowserProvider?.()
  if (!provider) throw new Error('Provider unavailable')

  // Start reconciler (safe no-op)
  try {
    walletService.startTxReconciler?.()
  } catch {
    // ignore
  }

  // Helper: best-effort allowance check
  async function hasSufficientAllowance(token, owner, spender, needed) {
    try {
      if (!isNonZeroAddress(token) || !isNonZeroAddress(owner) || !isNonZeroAddress(spender)) return false

      const allowanceData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'allowance',
        args: [owner, spender]
      })

      const raw = await provider.call({ to: token, data: allowanceData })
      const [current] = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], raw)
      return BigInt(current.toString()) >= BigInt(needed)
    } catch {
      // unknown → force approve path (safer)
      return false
    }
  }

  // ------------------------------
  // Main loop: ALWAYS continue on failures.
  // Never abort full run because one token has no route.
  // ------------------------------
  for (const step of chainPlan.steps) {
    const tokenIn = step?.tokenIn
    const tokenOut = step?.tokenOut
    const amountRaw = step?.amount

    // Basic validation → skip bad step safely
    if (!isNonZeroAddress(tokenIn) || !isNonZeroAddress(tokenOut)) {
      receipts.push({
        flowId,
        type: 'swap',
        ok: false,
        skipped: true,
        reason: 'Invalid token address (tokenIn/tokenOut)',
        tokenIn: tokenIn || null,
        tokenOut: tokenOut || null,
        chainId: Number(chainPlan.chainId)
      })
      continue
    }

    let amountWei = 0n
    try {
      amountWei = BigInt(amountRaw || 0)
    } catch {
      receipts.push({
        flowId,
        type: 'swap',
        ok: false,
        skipped: true,
        reason: 'Invalid amount (cannot convert to BigInt)',
        tokenIn,
        tokenOut,
        chainId: Number(chainPlan.chainId)
      })
      continue
    }

    if (amountWei <= 0n) {
      receipts.push({
        flowId,
        type: 'swap',
        ok: true,
        skipped: true,
        reason: 'Zero amount',
        tokenIn,
        tokenOut,
        chainId: Number(chainPlan.chainId)
      })
      continue
    }

    // ---------------------------
    // 1) APPROVE (if needed)
    // ---------------------------
    if (step.needsApproval && !step.usePermit) {
      const spender = step.spender || step.routerSpender || dep.dustClaimV3

      // If spender is invalid, skip approval and also skip swap (cannot proceed)
      if (!isNonZeroAddress(spender)) {
        receipts.push({
          flowId,
          type: 'approval',
          ok: false,
          skipped: true,
          reason: 'Invalid spender for approval',
          tokenIn,
          spender: spender || null,
          amount: String(amountWei),
          chainId: Number(chainPlan.chainId)
        })
        // Cannot safely proceed to swap without a valid spender
        receipts.push({
          flowId,
          type: 'swap',
          ok: false,
          skipped: true,
          reason: 'Skipped swap due to invalid spender',
          tokenIn,
          tokenOut,
          chainId: Number(chainPlan.chainId)
        })
        continue
      }

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
            amount: String(amountWei),
            chainId: Number(chainPlan.chainId)
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

          if (!approvalRes?.success) {
            // Approval failed → skip swap but continue to next token
            receipts.push({
              flowId,
              type: 'swap',
              ok: false,
              skipped: true,
              reason: 'Skipped swap due to approval failure',
              tokenIn,
              tokenOut,
              chainId: Number(chainPlan.chainId)
            })
            await sleep(650)
            continue
          }

          await sleep(750) // mobile stability
        }
      } catch (err) {
        receipts.push({
          flowId,
          type: 'approval',
          ok: false,
          error: err?.shortMessage || err?.reason || err?.message || 'Approval failed',
          tokenIn,
          spender,
          amount: String(amountWei),
          chainId: Number(chainPlan.chainId)
        })

        receipts.push({
          flowId,
          type: 'swap',
          ok: false,
          skipped: true,
          reason: 'Skipped swap due to approval exception',
          tokenIn,
          tokenOut,
          chainId: Number(chainPlan.chainId)
        })

        await sleep(650)
        continue
      }
    }

    // ---------------------------
    // 2) SWAP via DustClaimV3 (0x)
    // ---------------------------
    try {
      if (step.aggregator !== '0x') {
        receipts.push({
          flowId,
          type: 'swap',
          ok: false,
          skipped: true,
          reason: `Unsupported aggregator: ${step.aggregator || 'none'} (only 0x supported)`,
          tokenIn,
          tokenOut,
          chainId: Number(chainPlan.chainId)
        })
        continue
      }

      let routerSpender = step.routerSpender
      let swapCalldata = step.swapCalldata
      let gasFromQuote = null

      // Always fetch a quote if we don't already have fully valid fields
      // (and even if we do, we still validate them)
      if (!isNonZeroAddress(routerSpender) || !isHexData(swapCalldata)) {
        const { data: q } = await axiosPostJson('/.netlify/functions/0x-quote', {
          chainId: Number(chainPlan.chainId),
          sellToken: tokenIn,
          buyToken: tokenOut,
          sellAmount: String(amountWei),
          taker: dep.dustClaimV3,
          recipient: dep.dustClaimV3,
          txOrigin: from,
          slippageBps: Math.round(Number(step.slippage ?? 1) * 100)
        })

        const norm = normalize0xQuote(q)

        // ✅ BULLETPROOF SKIP: If 0x has no tx route OR spender OR calldata, skip ONLY this token.
        if (!norm.okTx || !norm.okSpender) {
          receipts.push({
            flowId,
            type: 'swap',
            ok: false,
            skipped: true,
            reason: norm.message || (norm.liquidityAvailable === false ? 'No 0x liquidity/route' : '0x quote missing tx/spender'),
            tokenIn,
            tokenOut,
            chainId: Number(chainPlan.chainId)
          })
          await sleep(350)
          continue
        }

        if (norm.liquidityAvailable === false) {
          receipts.push({
            flowId,
            type: 'swap',
            ok: false,
            skipped: true,
            reason: '0x reports liquidityAvailable=false',
            tokenIn,
            tokenOut,
            chainId: Number(chainPlan.chainId)
          })
          await sleep(350)
          continue
        }

        gasFromQuote = norm.gas ?? null
        routerSpender = norm.spender
        swapCalldata = norm.txData
      }

      // Final validation before touching the contract
      if (!isNonZeroAddress(routerSpender) || !isHexData(swapCalldata)) {
        receipts.push({
          flowId,
          type: 'swap',
          ok: false,
          skipped: true,
          reason: 'Invalid spender or calldata after quote (safety skip)',
          tokenIn,
          tokenOut,
          chainId: Number(chainPlan.chainId)
        })
        await sleep(350)
        continue
      }

      const data = encodeFunctionData({
        abi: DUSTCLAIM_V3_ABI,
        functionName: 'claimDustUsingAggregator',
        args: [tokenIn, amountWei, routerSpender, swapCalldata]
      })

      // Gas strategy:
      // - baseline from quote if present
      // - plus contract-level estimateGas buffer (Mobile-safe)
      let gasLimit = gasFromQuote ? BigInt(gasFromQuote) + 80_000n : 950_000n

      // Try estimateGas with signer; if estimate fails, we still proceed with conservative gasLimit.
      try {
        const signer = await walletService.getSigner?.()
        if (signer) {
          const contract = new ethers.Contract(dep.dustClaimV3, DUSTCLAIM_V3_ABI, signer)
          const est = await contract.claimDustUsingAggregator.estimateGas(tokenIn, amountWei, routerSpender, swapCalldata)
          const bumped = (BigInt(est) * 135n) / 100n
          if (bumped > gasLimit) gasLimit = bumped
        }
      } catch {
        // keep fallback gas
      }

      // Send tx (walletService should persist tx hash; on mobile it can lag)
      const swapRes = await walletService.sendTransactionWithReceipt(
        { from, to: dep.dustClaimV3, data, value: 0n, gasLimit },
        {
          flowId,
          kind: 'swap',
          title: 'Swap via 0x',
          step: 'swap',
          tokenAddress: tokenIn,
          spender: routerSpender,
          amount: String(amountWei),
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

      // If wallet said success but hash missing (MetaMask mobile quirk), mark as "submitted_unknown"
      if (swapRes?.success && !swapRes?.txHash) {
        receipts.push({
          flowId,
          type: 'swap',
          ok: true,
          skipped: false,
          warning: true,
          reason: 'Wallet returned success but no txHash (mobile provider delay). Check Activity tab.',
          tokenIn,
          tokenOut,
          chainId: Number(chainPlan.chainId)
        })
      }

      await sleep(800)
    } catch (err) {
      // Do NOT throw; record error and continue to next token.
      receipts.push({
        flowId,
        type: 'swap',
        ok: false,
        skipped: false,
        error:
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.shortMessage ||
          err?.reason ||
          err?.message ||
          'Swap failed',
        tokenIn,
        tokenOut,
        chainId: Number(chainPlan.chainId)
      })

      // Mobile stability: pause, then continue
      await sleep(650)
      continue
    }
  }

  return { flowId, receipts }
}

// ------------------------------
// Backwards-compatible version (returns receipts[])
// This prevents UI crashes if your UI expects an array and does .map()
// ------------------------------
export async function executeChainPlan(chainPlan, fromAddress) {
  const { receipts } = await executeChainPlanWithFlow(chainPlan, fromAddress)
  return receipts
    }
