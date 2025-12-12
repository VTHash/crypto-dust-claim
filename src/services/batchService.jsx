import { ethers } from 'ethers'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import web3Service from './web3Service'
import dexAggregatorService from './dexAggregatorService' // kept to avoid breaking other imports/usage
import axios from 'axios'

/**
 * Use the same wrapped-native idea:
 * sell token -> wrapped-native (WETH/WBNB/WMATIC...) then your contract un-wraps to native.
 */
const WRAPPED_NATIVE_BY_CHAIN = {
  1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  10: "0x4200000000000000000000000000000000000006",
  56: "0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  100: "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d",
  137: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
  195: "",
  250: "0x21be370D5312F44cB42ce377BC9b8a0CeF1A4c83",
  1329: "0xE30FeDd158A2e3b1e39EbaeABaFc5516e95e98C7",
  8453: "0x4200000000000000000000000000000000000006",
  34443:"0x4200000000000000000000000000000000000006",
  42161:"0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  43114:"0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
  59144:"0xE5D7C2a44FfDDf6b295A15c148167daaAf5Cf34F",
  80094:"0x6969696969696969696969696969696969696969",
  7777777:"0x4200000000000000000000000000000000000006",
  130: "0x4200000000000000000000000000000000000006",
  42220:"0x471EcE3750Da237f93B8E339c536989b8978a438",
  1313161554:"0xC9BdeEd33CD01541e1eeD10f90519d2C06Fe3feB",
  1284: "0xAcc15dC74880C9944775448304B263D191c6077F",
  1285: "0x98878B06940aE243284CA214f92Bb71a2b032B8A",
  5000: "0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000",
  9745: "0x4200000000000000000000000000000000000006",
  14: "0x1D80c49bBbCd1c0911346656B529dF9E5c2F783d",
  40: "0xD102cE6A4dB07D247fcc28F366A623Df0938CA9E",
  50: "0x951857744785E80e2De051c32EE7b25f9c458c42",
  57: "0xd3e822f3Ef011Ca5F17D82C956D952D8d7C3A1BB",
  61: "0x82A618305706B14e7bcf2592D4B9324A366b6dAd",
  57073: "0x4200000000000000000000000000000000000006",
  60808: "0x4200000000000000000000000000000000000006",
  81457: "0x4300000000000000000000000000000000000004",
  122: "0x5622F6dC93e08a8b717B149677930C38d5d50682",
  1868:  "0x4200000000000000000000000000000000000006",
  480: "0x4200000000000000000000000000000000000006",
  1135:  "0x4200000000000000000000000000000000000006",
  1923:  "0x4200000000000000000000000000000000000006",
  2741: "0x4200000000000000000000000000000000000006",
  747474: "0x4200000000000000000000000000000000000006",
  146: "0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38",
}

// 0x API hosts per chain (must be these, NOT wrapped token addresses)
const ZEROX_HOST_BY_CHAIN = {
  1: 'https://api.0x.org',
  10: 'https://optimism.api.0x.org',
  56: 'https://bsc.api.0x.org',
  137: 'https://polygon.api.0x.org',
  42161: 'https://arbitrum.api.0x.org',
  8453: 'https://base.api.0x.org',
}

// Minimal ERC20 ABI helper
const ERC20_DECIMALS_ABI = ['function decimals() view returns (uint8)']

/** Normalize any input into a string. */
const toAmountStr = (x) =>
  typeof x === 'bigint' ? x.toString() : String(x ?? '0')

/** Convert "amount" into base units with correct decimals (best effort). */
async function toBaseUnitsStr({ chainId, tokenAddress, amount }) {
  const s = String(amount ?? '0')
  // if already a big integer string (no dot), assume it's already base units
  if (!s.includes('.')) return s

  // else parse with real decimals
  try {
    const provider = web3Service.getProvider(chainId)
    const erc = new ethers.Contract(tokenAddress, ERC20_DECIMALS_ABI, provider)
    const dec = Number(await erc.decimals())
    return ethers.parseUnits(s, dec).toString()
  } catch {
    // fallback to 18 if decimals fetch fails
    return ethers.parseUnits(s, 18).toString()
  }
}

/**
 * Fetch 0x allowanceTarget (spender) by requesting a quote.
 * NOTE: 0x returns allowanceTarget on the quote response.
 */
async function get0xAllowanceTarget({
  chainId,
  sellToken,
  buyToken,
  sellAmount,
  slippagePercentage = 0.01,
}) {
  const host = ZEROX_HOST_BY_CHAIN[Number(chainId)]
  if (!host) return null

  const { data } = await axios.get(`${host}/swap/v1/quote`, {
    params: {
      sellToken,
      buyToken,
      sellAmount: String(sellAmount),
      slippagePercentage,
    },
  })

  return data?.allowanceTarget || null
}

class BatchService {
  constructor() {
    this.erc20ABI = [
      'function approve(address spender, uint256 amount) external returns (bool)',
      'function transfer(address to, uint256 amount) external returns (bool)',
      'function balanceOf(address) view returns (uint256)',
      'function decimals() view returns (uint8)',
    ]

    this.batchTransferABI = [
      'function batchTransfer(address token, address[] calldata recipients, uint256[] calldata amounts) external',
      'function batchTransferETH(address[] calldata recipients, uint256[] calldata amounts) external payable',
    ]

    this.BATCH_CONTRACTS = {
      // optional
    }
  }

  // ===========================================================================
  // PREFERRED: Build an execution PLAN used by ClaimScreen -> executeChainPlan
  // NOW: 0x ONLY (no 1inch / no uniswap / no paraswap)
  // ===========================================================================

  /**
   * claims = [
   * { chainId, tokenAddress, tokenSymbol, amount, recipient }
   * ]
   * Produces:
   * plan = [{ chainId, steps: [{ aggregator:'0x', tokenIn, tokenOut, amount, spender, needsApproval, usePermit, slippage }] }]
   */
  async buildClaimPlan(claims = []) {
    if (!Array.isArray(claims) || !claims.length) return []

    // Group by chain
    const perChain = new Map()
    for (const c of claims) {
      const cid = Number(c.chainId)
      if (!perChain.has(cid)) perChain.set(cid, [])
      perChain.get(cid).push(c)
    }

    const plan = []

    for (const [chainId, items] of perChain.entries()) {
      const wrappedOut = WRAPPED_NATIVE_BY_CHAIN[chainId]
      if (!wrappedOut) continue

      const host = ZEROX_HOST_BY_CHAIN[Number(chainId)]
      if (!host) continue

      const steps = []

      for (const it of items) {
        const tokenIn = it.tokenAddress
        if (!tokenIn) continue

        // IMPORTANT: 0x needs base units
        const sellAmountWeiStr = await toBaseUnitsStr({
          chainId,
          tokenAddress: tokenIn,
          amount: it.amount,
        })

        // skip empty
        if (!sellAmountWeiStr || sellAmountWeiStr === '0' || sellAmountWeiStr === '0x0') continue

        // get allowance target (spender) from 0x quote
        let spender = null
        try {
          spender = await get0xAllowanceTarget({
            chainId,
            sellToken: tokenIn,
            buyToken: wrappedOut,
            sellAmount: sellAmountWeiStr,
            slippagePercentage: 0.01, // 1%
          })
        } catch {
          spender = null
        }
        if (!spender) continue

        steps.push({
          // ClaimExecutor will do approve() if neededApproval=true and usePermit=false
          needsApproval: true,
          usePermit: false,

          aggregator: '0x',
          tokenIn,
          tokenOut: wrappedOut,

          // must be wei/base units string
          amount: sellAmountWeiStr,

          // executeChainPlan uses this spender for ERC20 approve
          spender,

          // executeChainPlan uses step.slippage (percent)
          slippage: 1,

          // keep a spot for UI/debug
          quote: {},
        })
      }

      if (steps.length) {
        plan.push({ chainId, steps })
      }
    }

    return plan
  }

  // ===========================================================================
  // LEGACY: Create raw batch transactions (fallback). ClaimScreen supports it.
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
        chainId,
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
          chainId,
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
          chainId,
        })
      }
    } catch (e) {
      console.error('createTokenBatchTransfers error:', e)
    }
    return txs
  }

  // ---------------------------------------------------------------------------
  // Analytics (unchanged)
  // ---------------------------------------------------------------------------
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
      individualGas > 0 && savings > 0 ? ((savings / individualGas) * 100).toFixed(2) : '0.00'

    return {
      individualGas,
      batchGas,
      savings,
      savingsPercentage: savingsPct,
      estimatedSavingsUSD: this.estimateGasSavingsUSD(savings),
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
