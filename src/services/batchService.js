// src/services/batchService.jsx
import { Contract, ethers } from 'ethers'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import web3Service from './web3Service'
import dexAggregatorService from './dexAggregatorService' // kept (not used for 0x plan) to avoid breaking other imports
import axios from 'axios'
import { DEPLOYMENTS, DUSTCLAIM_V3_ABI } from '../config/deployments'

/**
 * Wrapped native per chain (used ONLY as fallback output token if no outTokenByChain provided)
 
 */
export const ZEROX_HOST_BY_CHAIN = {
  1: 'https://api.0x.org',                 // Ethereum (Mainnet)

  10: 'https://optimism.api.0x.org',        // Optimism
  56: 'https://bsc.api.0x.org',             // BSC
  130: 'https://unichain.api.0x.org',       // Unichain
  137: 'https://polygon.api.0x.org',        // Polygon
  143: 'https://monad.api.0x.org',          // Monad
  146: 'https://sonic.api.0x.org',          // Sonic
  480: 'https://worldchain.api.0x.org',     // World Chain
  5000: 'https://mantle.api.0x.org',        // Mantle
  9745: 'https://plasma.api.0x.org',        // Plasma

  42161: 'https://arbitrum.api.0x.org',     // Arbitrum
  43114: 'https://avalanche.api.0x.org',    // Avalanche
  534352: 'https://scroll.api.0x.org',      // Scroll
  59144: 'https://linea.api.0x.org',        // Linea

  80094: 'https://berachain.api.0x.org',    // Berachain
  81457: 'https://blast.api.0x.org',        // Blast
  34443: 'https://mode.api.0x.org',         // Mode
  8453: 'https://base.api.0x.org',          // Base
  57073: 'https://ink.api.0x.org',          // Ink
}

/** Normalize any input into a wei-decimal string */
const toAmountStr = (x) =>
  typeof x === 'bigint' ? x.toString() : String(x ?? '0')

/**
 * Best-effort: if a decimal string, parse with decimals; otherwise assume already wei string
 */
const toWeiStr = (maybeDecimal, decimals = 18) => {
  const s = String(maybeDecimal ?? '0')
  if (s.includes('.')) return ethers.parseUnits(s, decimals).toString()
  return s
}


async function get0xQuote({ chainId, sellToken, buyToken, sellAmountWei, taker  }) {
  const host = ZEROX_HOST_BY_CHAIN[Number(chainId)]
  if (!host) return null

  const { data } = await axios.get(`${host}/swap/allowance-holder/quote`, {
    params: {
      sellToken,
      buyToken,
      sellAmount: String(sellAmountWei),
      taker,
      slippagePercentage: 0.01,
      recipient: taker,
      slippageBps: 100,
    },
  })
      
  return data || null
}

class BatchService {
  constructor() {
    this.erc20ABI = [
      'function approve(address spender, uint256 amount) external returns (bool)',
      'function transfer(address to, uint256 amount) external returns (bool)',
      'function balanceOf(address) view returns (uint256)',
      'function decimals() view returns (uint8)'
    ]

    this.batchTransferABI = [
      'function batchTransfer(address token, address[] calldata recipients, uint256[] calldata amounts) external',
      'function batchTransferETH(address[] calldata recipients, uint256[] calldata amounts) external payable'
    ]

    this.BATCH_CONTRACTS = {
      // (optional legacy)
    }
  }

  
  async buildClaimPlan(claims = [], options = {}) {
  if (!Array.isArray(claims) || !claims.length) return []

  const slippagePct = Number(options.slippagePct ?? 1)

  // group by chain
  const perChain = new Map()
  for (const c of claims) {
    const cid = Number(c.chainId)
    if (!perChain.has(cid)) perChain.set(cid, [])
    perChain.get(cid).push(c)
  }

  const plan = []

  for (const [chainId, items] of perChain.entries()) {
    const dep = DEPLOYMENTS?.[Number(chainId)]
    if (!dep?.dustClaimV3 || !dep?.weth || !dep?.zeroXHost) continue // skip chains without 0x or missing config

    const steps = []

    for (const it of items) {
      const tokenIn = it.tokenAddress
      const decimals = Number(it.decimals ?? 18)

      // amount MUST be wei string
      const sellAmountWei = toWeiStr(it.amount, decimals)

      // IMPORTANT: for DustClaimV3, buyToken MUST be chain WETH and takerAddress MUST be the CONTRACT
      const { data } = await axios.get(`${dep.zeroXHost}/swap/allowance-holder/quote`, {
        params: {
          chainId: Number(chainId),
          sellToken: tokenIn,
          buyToken: dep.weth,
          sellAmount: String(sellAmountWei),
          takerAddress: dep.dustClaimV3,
          slippagePercentage: slippagePct / 100
        }
      })

      if (!data?.data || !data?.allowanceTarget) continue

      steps.push({
        aggregator: '0x',

        // approval must be to the DustClaimV3 contract (because it transferFrom's user)
        needsApproval: true,
        usePermit: false,
        spender: dep.dustClaimV3,

        tokenIn,
        tokenOut: dep.weth,
        amount: sellAmountWei,

        // these are used later by claimExecutor to call the contract
        routerSpender: data.allowanceTarget,
        swapCalldata: data.data,

        slippage: slippagePct
      })
    }

    if (steps.length) plan.push({ chainId, steps })
  }

  return plan
}

// ===========================================================================
// LEGACY: Create raw batch transactions (fallback). Not used for 0x swap plans.
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
