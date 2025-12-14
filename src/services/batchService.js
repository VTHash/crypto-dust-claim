// src/services/batchService.jsx
import { ethers } from 'ethers'
import axios from 'axios'
import web3Service from './web3Service'
import dexAggregatorService from './dexAggregatorService' // kept to avoid breaking imports
import { DEPLOYMENTS } from '../config/deployments'

/** Normalize any input into a wei-decimal string */
const toWeiStr = (maybeDecimal, decimals = 18) => {
  const s = String(maybeDecimal ?? '0')
  if (s.includes('.')) return ethers.parseUnits(s, decimals).toString()
  return s
}

/**
 * Try 0x legacy v1 quote first (best match for your DustClaimV3: allowanceTarget == call target).
 * Host comes from DEPLOYMENTS[chainId].zeroXHost (per-chain host).
 */
async function get0xV1Quote({ zeroXHost, sellToken, buyToken, sellAmountWei, takerAddress, slippagePct }) {
  if (!zeroXHost) return null
  const url = `${zeroXHost}/swap/v1/quote`

  const { data } = await axios.get(url, {
    params: {
      sellToken,
      buyToken,
      sellAmount: String(sellAmountWei),
      takerAddress,
      slippagePercentage: Number(slippagePct) / 100
    }
  })

  // v1 response: { to, data, value, allowanceTarget, ... }
  if (!data?.to || !data?.data || !data?.allowanceTarget) return null

  return {
    kind: 'v1',
    callTarget: data.to,
    allowanceTarget: data.allowanceTarget,
    calldata: data.data
  }
}

/**
 * Fallback: 0x allowance-holder v2 quote (single global host).
 * IMPORTANT: Only usable with DustClaimV3 if allowance spender == transaction.to.
 */
async function get0xAllowanceHolderQuote({
  chainId,
  sellToken,
  buyToken,
  sellAmountWei,
  taker,
  txOrigin,
  recipient,
  slippagePct,
  apiKey
}) {
  if (!apiKey) return null

  const url = `https://api.0x.org/swap/allowance-holder/quote`

  const { data } = await axios.get(url, {
    params: {
      chainId: Number(chainId),
      sellToken,
      buyToken,
      sellAmount: String(sellAmountWei),
      taker, // your DustClaimV3
      recipient, // your DustClaimV3 (must receive WETH)
      txOrigin, // user EOA (required because taker is a contract)
      slippageBps: Math.round(Number(slippagePct) * 100) // 1% => 100 bps
    },
    headers: {
      '0x-api-key': apiKey,
      '0x-version': 'v2'
    }
  })

  // v2 allowance-holder response: transaction.to + transaction.data + issues.allowance.spender
  const callTarget = data?.transaction?.to
  const calldata = data?.transaction?.data
  const allowanceSpender = data?.issues?.allowance?.spender

  if (!callTarget || !calldata || !allowanceSpender) return null

  return {
    kind: 'allowance-holder',
    callTarget,
    allowanceSpender,
    calldata
  }
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

  // ===========================================================================
  // ✅ Build PLAN for ClaimScreen -> executeChainPlan (0x through DustClaimV3)
  // ===========================================================================
  /**
   * claims = [{ chainId, tokenAddress, tokenSymbol, amount, decimals, recipient }]
   * options = { slippagePct?: number, txOrigin?: string }
   */
  async buildClaimPlan(claims = [], options = {}) {
    if (!Array.isArray(claims) || !claims.length) return []

    const slippagePct = Number(options.slippagePct ?? 1)
    const txOrigin = options.txOrigin || null

    // group by chain
    const perChain = new Map()
    for (const c of claims) {
      const cid = Number(c.chainId)
      if (!perChain.has(cid)) perChain.set(cid, [])
      perChain.get(cid).push(c)
    }

    const plan = []
    const apiKey = import.meta.env.VITE_0X_API_KEY || ''

    for (const [chainId, items] of perChain.entries()) {
      const dep = DEPLOYMENTS?.[Number(chainId)]
      if (!dep?.dustClaimV3 || !dep?.weth) continue

      // if chain has no 0x host, skip
      // (this is your “unsupported by 0x = null” requirement)
      if (!dep?.zeroXHost) continue

      const steps = []

      for (const it of items) {
        const tokenIn = it.tokenAddress
        const decimals = Number(it.decimals ?? 18)
        const sellAmountWei = toWeiStr(it.amount, decimals)

        // --------------------------
        // 1) Try legacy 0x v1 quote
        // --------------------------
        let q = null
        try {
          q = await get0xV1Quote({
            zeroXHost: dep.zeroXHost,
            sellToken: tokenIn,
            buyToken: dep.weth,
            sellAmountWei,
            takerAddress: dep.dustClaimV3,
            slippagePct
          })
        } catch {
          q = null
        }

        // ---------------------------------------
        // 2) Fallback to allowance-holder v2 quote
        // ONLY if compatible with DustClaimV3
        // ---------------------------------------
        if (!q) {
          try {
            const q2 = await get0xAllowanceHolderQuote({
              chainId,
              sellToken: tokenIn,
              buyToken: dep.weth,
              sellAmountWei,
              taker: dep.dustClaimV3,
              recipient: dep.dustClaimV3,
              txOrigin: txOrigin || it.recipient, // best fallback is user address
              slippagePct,
              apiKey
            })

            // DustClaimV3 supports a single spender for approve+call
            // so we require allowanceSpender == callTarget
            if (q2 && q2.allowanceSpender?.toLowerCase() === q2.callTarget?.toLowerCase()) {
              q = {
                kind: q2.kind,
                callTarget: q2.callTarget,
                allowanceTarget: q2.allowanceSpender,
                calldata: q2.calldata
              }
            }
          } catch {
            q = null
          }
        }

        if (!q?.allowanceTarget || !q?.calldata) continue

        steps.push({
          aggregator: '0x',

          // user approves DustClaimV3 (because DustClaimV3 does transferFrom)
          needsApproval: true,
          usePermit: false,
          spender: dep.dustClaimV3,

          tokenIn,
          tokenOut: dep.weth,
          amount: sellAmountWei,

          // DustClaimV3 will approve+call this spender with calldata
          routerSpender: q.allowanceTarget,
          swapCalldata: q.calldata,

          slippage: slippagePct
        })
      }

      if (steps.length) plan.push({ chainId, steps })
    }

    return plan
  }

  // ===========================================================================
  // LEGACY methods below unchanged (kept so app imports don't break)
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
}

export default new BatchService()