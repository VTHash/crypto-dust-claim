import axios from 'axios'
import { ethers } from 'ethers'
import walletService from './walletService'
import { encodeFunctionData, erc20Abi } from 'viem'
import { DEPLOYMENTS, DUSTCLAIM_V3_ABI } from '../config/deployments'

// Small delay helps MetaMask mobile not choke on back-to-back requests
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Execute chain plan THROUGH DustClaimV3
export async function executeChainPlan(chainPlan, fromAddress) {
  const receipts = []

  // Ensure wallet connected
  const connected = await walletService.isConnected?.()
  if (!connected) {
    const res = await walletService.connect?.()
    if (!res?.success) throw new Error(res?.error || 'Wallet connection failed')
  }

  // Ensure correct chain
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

  // BrowserProvider (ethers v6)
  const provider = await walletService.getBrowserProvider?.()
  if (!provider) throw new Error('Provider unavailable')

  // Start reconciler (safe no-op if already running)
  try {
    walletService.startTxReconciler?.()
  } catch {
    // ignore
  }

  // Helper: best-effort allowance check via eth_call
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
      // If allowance read fails, we conservatively say "unknown" and try approve.
      return false
    }
  }

  for (const step of chainPlan.steps) {
    const tokenIn = step.tokenIn
    const tokenOut = step.tokenOut
    const amountWei = BigInt(step.amount || 0)

    // ---------------------------
    // 1) APPROVE (if needed)
    // ---------------------------
    if (step.needsApproval && !step.usePermit) {
      const spender = step.spender || step.routerSpender || dep.dustClaimV3

      try {
        const okAllowance = await hasSufficientAllowance(tokenIn, from, spender, amountWei)
        if (okAllowance) {
          receipts.push({
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

          // RELIABLE SENDER (stores hash immediately + waits best-effort)
          const approvalRes = await walletService.sendTransactionWithReceipt(
            {
              from,
              to: tokenIn,
              data: approvalData,
              value: 0n
            },
            {
              kind: 'approval',
              tokenAddress: tokenIn,
              spender,
              amount: String(amountWei),
              waitConfirms: 1,
              waitTimeoutMs: 180000
            }
          )

          if (approvalRes?.success && !approvalRes?.txHash) {
            receipts.push({
              type: 'approval',
              ok: false,
              error: 'Approval: wallet returned success but no txHash (not submitted)',
              tokenIn,
              spender,
              amount: String(amountWei)
            })
            continue
          }

          receipts.push({
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

          // Small delay so MetaMask mobile reliably presents the next prompt
          await sleep(650)
        }
      } catch (err) {
        receipts.push({
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
            type: 'swap',
            ok: false,
            error: q?.message || '0x quote has no transaction (no route/liquidity)',
            tokenIn,
            tokenOut
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
            tokenIn,
            tokenOut
          })
          continue
        }
      }

      // ---------------------------
      // IMPORTANT CHANGE (MetaMask Mobile-safe):
      // Use ethers.Contract + signer + estimateGas + buffered gasLimit.
      // ---------------------------
      const signer = await walletService.getSigner?.()
      if (!signer) {
        throw new Error('Signer unavailable (wallet not hydrated). Reconnect wallet and retry.')
      }

      const contract = new ethers.Contract(dep.dustClaimV3, DUSTCLAIM_V3_ABI, signer)

      // estimate gas from the contract call
      let estGas
      try {
        estGas = await contract.claimDustUsingAggregator.estimateGas(
          tokenIn,
          BigInt(step.amount),
          routerSpender,
          swapCalldata
        )
      } catch (e) {
        // If estimate fails, we still proceed with a conservative limit,
        // but we do NOT hide the reason from logs.
        estGas = null
      }

      // Base gas: prefer quote if provided; otherwise conservative 900k.
      const baseGas = gasFromQuote ? BigInt(gasFromQuote) + 50_000n : 900_000n

      // If estimation worked, use max(baseGas, estGas * 1.30).
      let gasLimit = baseGas
      if (estGas != null) {
        const bumped = (BigInt(estGas) * 130n) / 100n
        if (bumped > gasLimit) gasLimit = bumped
      }

      const tx = await contract.claimDustUsingAggregator(
        tokenIn,
        BigInt(step.amount),
        routerSpender,
        swapCalldata,
        { gasLimit }
      )

      if (!tx?.hash) {
        throw new Error('No tx hash (MetaMask Mobile did not broadcast)')
      }

      const receipt = await tx.wait()

      receipts.push({
        type: 'swap',
        ok: true,
        txId: null,
        txHash: tx.hash,
        status: receipt?.status ?? null,
        chainId: Number(chainPlan.chainId),
        tokenIn,
        tokenOut,
        routerSpender,
        blockNumber: receipt?.blockNumber ?? null,
        error: null
      })

      // Small delay before next step, again for MetaMask mobile stability
      await sleep(650)
    } catch (err) {
      receipts.push({
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

  return receipts
}