// src/services/claimExecutor.js
import axios from 'axios'
import walletService from './walletService'
import { encodeFunctionData, erc20Abi } from 'viem'
import { DEPLOYMENTS, DUSTCLAIM_V3_ABI } from '../config/deployments'

// Small helper to keep addresses normalized
const lower = (x) => (x ? String(x).toLowerCase() : '')

// Execute chain plan THROUGH DustClaimV3
export async function executeChainPlan(chainPlan, fromAddress) {
  const receipts = []

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

    // Re-read to ensure the wallet actually switched (mobile wallets can lag)
    const afterHex = await walletService.getChainId?.()
    const afterId = typeof afterHex === 'string' ? parseInt(afterHex, 16) : Number(afterHex || 0)
    if (Number(afterId) !== Number(chainPlan.chainId)) {
      throw new Error(`Chain switch did not complete (expected ${chainPlan.chainId}, got ${afterId})`)
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

  const provider = await walletService.getBrowserProvider?.()

  for (const step of chainPlan.steps) {
    const tokenIn = step.tokenIn
    const amountWei = BigInt(step.amount || 0)

    // ---------------------------
    // 1) APPROVE (if needed)
    // ---------------------------
    if (step.needsApproval && !step.usePermit) {
      const spender = step.spender || step.routerSpender || dep.dustClaimV3

      try {
        // Check allowance first
        let hasAllowance = false
        try {
          const allowanceData = encodeFunctionData({
            abi: erc20Abi,
            functionName: 'allowance',
            args: [from, spender]
          })

          if (provider?.call) {
            const raw = await provider.call({ to: tokenIn, data: allowanceData })
            const [current] = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], raw)
            if (current >= amountWei) {
              hasAllowance = true
              receipts.push({
                type: 'approval',
                ok: true,
                skipped: true,
                reason: 'allowance already sufficient',
                tokenIn,
                spender,
                amount: String(amountWei)
              })
            }
          }
        } catch {
          // ignore allowance read failures; attempt approve
        }

        if (!hasAllowance) {
          const approvalData = encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [spender, amountWei]
          })

          const res = await walletService.sendTransaction({
            from,              // ✅ REQUIRED
            to: tokenIn,
            data: approvalData,
            value: 0n
          })

          // ✅ Hard guard: no hash = not sent
          if (res?.success && !res?.txHash) {
            receipts.push({
              type: 'approval',
              ok: false,
              error: 'Wallet returned success but no txHash (approval not submitted)',
              tokenIn,
              spender,
              amount: String(amountWei)
            })
            continue
          }

          receipts.push({
            type: 'approval',
            ok: !!res?.success,
            txHash: res?.txHash || null,
            error: res?.error || null,
            tokenIn,
            spender,
            amount: String(amountWei)
          })

          if (!res?.success) continue
        }
      } catch (err) {
        receipts.push({
          type: 'approval',
          ok: false,
          error: err?.message || 'Approval failed',
          tokenIn,
          spender,
          amount: String(amountWei)
        })
        continue
      }
    }

    // ---------------------------
    // 2) SWAP via DustClaimV3 (0x)
    // ---------------------------
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
            sellToken: step.tokenIn,
            buyToken: step.tokenOut,
            sellAmount: String(step.amount),
            taker: dep.dustClaimV3,
            recipient: dep.dustClaimV3,
            txOrigin: from,
            slippageBps: Math.round(Number(step.slippage ?? 1) * 100)
          },
          { headers: { 'content-type': 'application/json' } }
        )

        // Guard: no transaction means no route
        if (!q?.transaction?.to || !q?.transaction?.data) {
          receipts.push({
            type: 'swap',
            ok: false,
            error: q?.message || '0x quote has no transaction (no route/liquidity)',
            tokenIn: step.tokenIn
          })
          continue
        }

        gasFromQuote = q?.transaction?.gas ?? null
        routerSpender =
          q?.issues?.allowance?.spender ||
          q?.allowanceTarget ||
          null
        swapCalldata = q?.transaction?.data || null

        if (!routerSpender || !swapCalldata) {
          receipts.push({
            type: 'swap',
            ok: false,
            error: '0x quote missing spender/calldata (no route/liquidity)',
            tokenIn: step.tokenIn
          })
          continue
        }
      }

      const data = encodeFunctionData({
        abi: DUSTCLAIM_V3_ABI,
        functionName: 'claimDustUsingAggregator',
        args: [step.tokenIn, BigInt(step.amount), routerSpender, swapCalldata]
      })

      const gasLimit = gasFromQuote ? BigInt(gasFromQuote) + 50_000n : 900_000n

      const res = await walletService.sendTransaction({
        from,                 // ✅ REQUIRED
        to: dep.dustClaimV3,
        data,
        value: 0n,
        gasLimit
      })

      // ✅ Hard guard: no hash = not sent
      if (res?.success && !res?.txHash) {
        receipts.push({
          type: 'swap',
          ok: false,
          error: 'Wallet returned success but no txHash (swap not submitted)',
          tokenIn: step.tokenIn,
          routerSpender
        })
        continue
      }

      receipts.push({
        type: 'swap',
        ok: !!res?.success,
        txHash: res?.txHash || null,
        error: res?.error || null,
        tokenIn: step.tokenIn,
        routerSpender
      })
    } catch (err) {
      receipts.push({
        type: 'swap',
        ok: false,
        error:
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          'Swap failed',
        tokenIn: step.tokenIn
      })
    }
  }

  return receipts
}
