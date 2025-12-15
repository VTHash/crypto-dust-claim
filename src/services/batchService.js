// src/services/batchService.jsx
import { ethers } from 'ethers'
import web3Service from './web3Service'
import dexAggregatorService from './dexAggregatorService' // kept to avoid breaking imports
import axios from 'axios'
import walletService from './walletService'
import { DEPLOYMENTS } from '../config/deployments'

// -------------------------------
// 0x Swap API v2 (single host + chainId param)
// -------------------------------
const ZEROX_V2_HOST = 'https://api.0x.org'

// Normalize any input into a wei-decimal string
const toWeiStr = (amount, decimals = 18) => {
  const s = String(amount ?? '0')
  return s.includes('.') ? ethers.parseUnits(s, decimals).toString() : s
}

async function getTxOriginFallback(optionsTxOrigin) {
  if (optionsTxOrigin) return optionsTxOrigin

  // Best-effort: pull wallet address from walletService (so UI doesn’t need changes)
  const from =
    (await walletService.getAddress?.()) ||
    (await (async () => {
      const accs = await walletService.getAccounts?.()
      return accs?.[0] || null
    })())

  return from || null
}

// 0x v2 quote helper (Allowance Holder)
async function get0xAllowanceHolderQuote({
  chainId,
  sellToken,
  buyToken,
  sellAmountWei,
  taker,      // DustClaimV3
  txOrigin,   // user EOA
  recipient,  // DustClaimV3
  slippageBps
}) {
  const { data } = await axios.post(
    '/.netlify/functions/0x-quote',
    {
      chainId: Number(chainId),
      sellToken,
      buyToken,
      sellAmount: String(sellAmountWei),
      taker,
      txOrigin,
      recipient,
      slippageBps: Number(slippageBps)
    },
    {
      headers: { 'content-type': 'application/json' }
    }
  )

  return data || null
}

class BatchService {
  async buildClaimPlan(claims = [], options = {}) {
    if (!Array.isArray(claims) || claims.length === 0) return []

    const { txOrigin, slippagePct = 1 } = options
    if (!txOrigin) throw new Error('txOrigin (user EOA) is required')

    // group claims by chain
    const byChain = new Map()
    for (const c of claims) {
      const cid = Number(c.chainId)
      if (!byChain.has(cid)) byChain.set(cid, [])
      byChain.get(cid).push(c)
    }

    const plan = []

    for (const [chainId, items] of byChain.entries()) {
      const dep = DEPLOYMENTS?.[chainId]
      if (!dep?.dustClaimV3 || !dep?.weth) continue

      const steps = []

      for (const it of items) {
        const tokenIn = it.tokenAddress
        const decimals = Number(it.decimals ?? 18)
        const sellAmountWei = toWeiStr(it.amount, decimals)

        console.log('[0x:v2] requesting quote', {
          chainId,
          tokenIn,
          sellAmountWei,
          taker: dep.dustClaimV3,
          txOrigin
        })

        let data
        try {
          const res = await axios.get(ZEROX_V2_URL, {
            params: {
              chainId,
              sellToken: tokenIn,
              buyToken: dep.weth,
              sellAmount: sellAmountWei,

              // CRITICAL (per docs)
              taker: dep.dustClaimV3,
              txOrigin,
              recipient: dep.dustClaimV3,

              slippageBps: Math.round(slippagePct * 100)
            },
            headers: {
              '0x-api-key': import.meta.env.VITE_0X_API_KEY,
              '0x-version': 'v2'
            }
          })
          data = res.data
        } catch (e) {
          console.warn('[0x:v2] quote failed', tokenIn, e?.response?.data || e.message)
          continue
        }

        const callTarget = data?.transaction?.to
        const swapCalldata = data?.transaction?.data
        const allowanceTarget = data?.allowanceTarget

        // HARD requirements for DustClaimV3
        if (!callTarget || !swapCalldata || !allowanceTarget) {
          console.warn('[0x:v2] invalid quote response', data)
          continue
        }

        // safety: DustClaimV3 expects ONE external target
        if (callTarget.toLowerCase() !== allowanceTarget.toLowerCase()) {
          console.warn('[0x:v2] callTarget != allowanceTarget, skipping', {
            callTarget,
            allowanceTarget
          })
          continue
        }

        steps.push({
          aggregator: '0x',

          // user approves DustClaimV3
          needsApproval: true,
          usePermit: false,
          spender: dep.dustClaimV3,

          tokenIn,
          tokenOut: dep.weth,
          amount: sellAmountWei,

          // DustClaimV3 will approve + call this
          routerSpender: allowanceTarget,
          swapCalldata,

          slippage: slippagePct
        })
      }

      if (steps.length > 0) {
        plan.push({ chainId, steps })
      }
    }

    return plan
  }

  // ===========================================================================
  // LEGACY: Create raw batch transactions (not used by 0x plan)
  // ===========================================================================
  async createBatchDustClaim(claims) {
    const txs = []
    const byChain = this.groupClaimsByChain(claims)

    for (const [chainIdStr, chainClaims] of Object.entries(byChain)) {
      const chainId = Number(chainIdStr)
      for (const [tokenAddr, tokenClaims] of Object.entries(chainClaims)) {
        if (tokenAddr === '0x0000000000000000000000000000000000000000') {
          const nativeTx = await this.createNativeBatchTransfer(chainId, tokenClaims)
          if (nativeTx) txs.push(nativeTx)
        } else {
          const tokenTxs = await this.createTokenBatchTransfers(chainId, tokenAddr, tokenClaims)
          txs.push(...tokenTxs)
        }
      }
    }
    return txs
  }

  groupClaimsByChain(claims = []) {
    const result = {}
    for (const c of claims) {
      const cid = Number(c.chainId)
      if (!result[cid]) result[cid] = {}
      if (!result[cid][c.tokenAddress]) result[cid][c.tokenAddress] = []
      result[cid][c.tokenAddress].push(c)
    }
    return result
  }

  async createNativeBatchTransfer(chainId, claims) {
    try {
      const recipients = claims.map((c) => c.recipient)
      const amounts = claims.map((c) => ethers.parseEther(String(c.amount)))
      const total = amounts.reduce((a, b) => a + b, 0n)

      const batch = this.BATCH_CONTRACTS[chainId]
      if (!batch) return null

      const iface = new ethers.Interface(this.batchTransferABI)
      const data = iface.encodeFunctionData('batchTransferETH', [recipients, amounts])
      return {
        to: batch,
        data,
        value: '0x' + total.toString(16),
        gasLimit: '0x' + (50000 + recipients.length * 21000).toString(16),
        chainId
      }
    } catch (e) {
      console.error('createNativeBatchTransfer error:', e)
      return null
    }
  }

  async createTokenBatchTransfers(chainId, tokenAddress, claims) {
    const txs = []
    const recipients = claims.map((c) => c.recipient)

    try {
      const provider = web3Service.getProvider(chainId)
      const erc = new ethers.Contract(tokenAddress, this.erc20ABI, provider)
      const decimals = await erc.decimals()

      const amounts = claims.map((c) => ethers.parseUnits(String(c.amount), decimals))

      const batch = this.BATCH_CONTRACTS[chainId]
      if (batch) {
        const iface = new ethers.Interface(this.batchTransferABI)
        const data = iface.encodeFunctionData('batchTransfer', [tokenAddress, recipients, amounts])
        const gasEstimate = 100000 + recipients.length * 25000
        txs.push({
          to: batch,
          data,
          value: '0x0',
          gasLimit: '0x' + gasEstimate.toString(16),
          chainId
        })
        return txs
      }

      const iface = new ethers.Interface(this.erc20ABI)
      for (let i = 0; i < recipients.length; i++) {
        const data = iface.encodeFunctionData('transfer', [recipients[i], amounts[i]])
        txs.push({
          to: tokenAddress,
          data,
          value: '0x0',
          gasLimit: '0x186A0',
          chainId
        })
      }
    } catch (e) {
      console.error('createTokenBatchTransfers error:', e)
    }
    return txs
  }

  calculateGasSavings(individualTxs, batchTxs) {
    const individualGas = (individualTxs || []).reduce((sum, tx) => {
      const isData = tx?.data && tx.data !== '0x'
      return sum + (isData ? 65000 : 21000)
    }, 0)

    const batchGas = (batchTxs || []).reduce((sum, tx) => {
      const d = tx?.data || ''
      if (d.includes('batchTransfer')) {
        const approxRecipients = Math.max(0, Math.floor((d.length - 138) / 64))
        return sum + 100000 + approxRecipients * 20000
      }
      if (d.includes('multiSend')) {
        const approxTransfers = Math.max(0, Math.floor((d.length - 138) / 64))
        return sum + 150000 + approxTransfers * 5000
      }
      return sum + 65000
    }, 0)

    const savingsRaw = individualGas - batchGas
    const savings = savingsRaw > 0 ? savingsRaw : 0
    const savingsPct =
      individualGas > 0 && savings > 0
        ? ((savings / individualGas) * 100).toFixed(2)
        : '0.00'

    return {
      individualGas,
      batchGas,
      savings,
      savingsPercentage: savingsPct,
      estimatedSavingsUSD: this.estimateGasSavingsUSD(savings)
    }
  }

  estimateGasSavingsUSD(gasUnits, chainId = 1) {
    const avgGwei = { 1: 30, 137: 200, 42161: 0.1, 10: 0.001 }
    const gwei = avgGwei[Number(chainId)] ?? 30
    const ethPrice = 2500
    const ethSaved = (Number(gasUnits) * gwei * 1e9) / 1e18
    return ethSaved * ethPrice
  }

  validateBatchTransactions(txs) {
    const errors = []
    ;(txs || []).forEach((tx, i) => {
      if (!tx?.to) errors.push(`Tx ${i + 1}: missing 'to'`)
      if (!tx?.data && !tx?.value) errors.push(`Tx ${i + 1}: no data or value`)
      if (!tx?.chainId) errors.push(`Tx ${i + 1}: missing chainId`)
      if (tx?.value && !/^0x[0-9a-fA-F]+$/.test(tx.value)) errors.push(`Tx ${i + 1}: bad value`)
      if (tx?.gasLimit && !/^0x[0-9a-fA-F]+$/.test(tx.gasLimit)) errors.push(`Tx ${i + 1}: bad gasLimit`)
    })
    return { isValid: errors.length === 0, errors }
  }

  optimizeTransactionOrder(txs = []) {
    return [...txs].sort((a, b) => {
      const aNative = !a.data || a.data === '0x'
      const bNative = !b.data || b.data === '0x'
      if (aNative && !bNative) return -1
      if (!aNative && bNative) return 1
      return Number(a.chainId) - Number(b.chainId)
    })
  }
}

export default new BatchService()
