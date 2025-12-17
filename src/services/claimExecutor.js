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
  if (!connected) throw new Error('Wallet not connected')

  const currentChainHex = await walletService.getChainId?.()
  const currentChainId =
    typeof currentChainHex === 'string'
      ? parseInt(currentChainHex, 16)
      : Number(currentChainHex || 0)

  if (Number(chainPlan.chainId) !== Number(currentChainId)) {
    const sw = await walletService.switchChain(Number(chainPlan.chainId))
    if (!sw?.success) throw new Error(sw?.error || 'Chain switch failed')
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
    const tokenIn = step.tokenIn
    const amountWei = BigInt(step.amount || 0)

    // 1) APPROVE spender (0x allowance-holder spender) so DustClaimV3 can execute allowance-holder flow
    if (step.needsApproval && !step.usePermit) {
      // ✅ IMPORTANT: approve step.spender (from plan), fallback to routerSpender, last resort dep.dustClaimV3
      const spender =
        step.spender ||
        step.routerSpender ||
        dep.dustClaimV3

      try {
        // Skip approval if already enough allowance
        let hasAllowance = false
        try {
          const allowanceData = encodeFunctionData({
            abi: erc20Abi,
            functionName: 'allowance',
            args: [from, spender]
          })

          const provider = await walletService.getBrowserProvider?.()
          if (provider?.call) {
            const raw = await provider.call({ to: tokenIn, data: allowanceData })
            // raw is hex-encoded uint256
            const current = BigInt(raw)
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
          // If allowance call fails for weird tokens, just proceed with approve
        }

        if (!hasAllowance) {
          const approvalData = encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [spender, amountWei]
          })

          console.debug('[claimExecutor] approving', {
            chainId: Number(chainPlan.chainId),
            tokenIn,
            spender,
            amount: String(amountWei)
          })

          const res = await walletService.sendTransaction({
            from,
            to: tokenIn,
            data: approvalData,
            value: 0n
          })

          receipts.push({
            type: 'approval',
            ok: !!res.success,
            txHash: res.txHash,
            error: res.error,
            tokenIn,
            spender,
            amount: String(amountWei)
          })

          if (!res.success) continue
        }
      } catch (err) {
        receipts.push({
          type: 'approval',
          ok: false,
          error: err?.message || 'Approval failed',
          tokenIn,
          spender: step.spender || step.routerSpender || dep.dustClaimV3,
          amount: String(amountWei)
        })
        continue
      }
    }

    // 2) SWAP THROUGH DustClaimV3 using 0x calldata
    try {
      if (step.aggregator !== '0x') {
        throw new Error(`Unsupported aggregator: ${step.aggregator || 'none'} (only 0x supported)`)
      }

      // Prefer plan’s data (best), fallback to re-quote via Netlify (safe)
      let routerSpender = step.routerSpender
      let swapCalldata = step.swapCalldata
      let gasFromQuote = null

      if (!routerSpender || !swapCalldata) {
        const { data: q } = await axios.post(
          '/.netlify/functions/0x-quote',
          {
            chainId: Number(chainPlan.chainId),
            sellToken: step.tokenIn,
            buyToken: step.tokenOut, // should be chain WETH
            sellAmount: String(step.amount),
            taker: dep.dustClaimV3,
            recipient: dep.dustClaimV3,
            txOrigin: from,
            slippageBps: Math.round(Number(step.slippage ?? 1) * 100)
          },
          { headers: { 'content-type': 'application/json' } }
        )

        gasFromQuote = q?.transaction?.gas ?? null

        const callTarget = q?.transaction?.to || null
        const spender =
          q?.issues?.allowance?.spender ||
          q?.allowanceTarget ||
          null
        const calldata = q?.transaction?.data || null

        // HARD GUARD — must come FIRST
        if (!callTarget || !spender || !calldata) {
          console.warn('[0x] invalid quote, missing fields', {
            chainId: Number(chainPlan.chainId),
            tokenIn: step.tokenIn,
            callTarget,
            spender,
            calldataLen: calldata?.length || 0,
            keys: Object.keys(q || {})
          })
          receipts.push({
            type: 'swap',
            ok: false,
            error: '0x quote missing transaction fields (no route/liquidity?)',
            tokenIn: step.tokenIn
          })
          continue
        }

        // Do NOT force spender == tx.to; allowance-holder commonly uses same, but we shouldn’t hard fail.
        routerSpender = spender
        swapCalldata = calldata
      }

      const data = encodeFunctionData({
        abi: DUSTCLAIM_V3_ABI,
        functionName: 'claimDustUsingAggregator',
        args: [step.tokenIn, BigInt(step.amount), routerSpender, swapCalldata]
      })

      const gas = gasFromQuote ? BigInt(gasFromQuote) + 50_000n : 900_000n // buffer

      const tx = {
        from,
        to: dep.dustClaimV3,
        data,
        value: 0n,
        gas
      }

      console.debug('[claimExecutor] swap tx', {
        chainId: Number(chainPlan.chainId),
        from,
        dustClaimV3: dep.dustClaimV3,
        tokenIn: step.tokenIn,
        amount: String(step.amount),
        routerSpender,
        calldataLen: swapCalldata?.length || 0,
        gas: String(gas)
      })

      const res = await walletService.sendTransaction(tx)

      receipts.push({
        type: 'swap',
        ok: !!res.success,
        txHash: res.txHash,
        error: res.error,
        tokenIn: step.tokenIn,
        routerSpender
      })
    } catch (err) {
      receipts.push({
        type: 'swap',
        ok: false,
        error: err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Swap failed',
        tokenIn: step.tokenIn
      })
    }
  }

  return receipts
}