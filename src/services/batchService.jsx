import { ethers } from 'ethers'
import { SUPPORTED_CHAINS } from '../config/walletConnectConfig'
import web3Service from './web3Service'
import dexAggregatorService from './dexAggregatorService'
import axios from 'axios'

/**
 * Use the same wrapped-native idea as dexAggregatorService:
 * sell token -> wrapped-native (WETH/WBNB/WMATIC...) then your contract un-wraps to native.
 * Keep this in sync with dexAggregatorService's WRAPPED_NATIVE_BY_CHAIN.
 */
const WRAPPED_NATIVE_BY_CHAIN = {
  1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // Ethereum WETH
  10: "0x4200000000000000000000000000000000000006", // Optimism WETH
  56: "0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // BNB Smart Chain WBNB
  100: "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d", // Gnosis WXDAI
  137: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // Polygon PoS WMATIC
  195: "", // X1 (no wrapped token yet)
  250: "0x21be370D5312F44cB42ce377BC9b8a0CeF1A4c83", // Fantom WFTM
  1329: "0xE30FeDd158A2e3b1e39EbaeABaFc5516e95e98C7", // Sei Network WSEI
  8453: "0x4200000000000000000000000000000000000006", // Base WETH
  34443:"0x4200000000000000000000000000000000000006", // Mode WETH
  42161:"0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // Arbitrum WETH
  43114:"0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", // Avalanche WAVAX
  59144:"0xE5D7C2a44FfDDf6b295A15c148167daaAf5Cf34F", // Linea WETH
  80094:"0x6969696969696969696969696969696969696969", // Berachain WBERA (canonical)
  7777777:"0x4200000000000000000000000000000000000006", // Zora WETH
  130: "0x4200000000000000000000000000000000000006", // Unichain WETH (Optimism stack)
  42220:"0x471EcE3750Da237f93B8E339c536989b8978a438", // Celo CELO (native wrapper)
  1313161554:"0xC9BdeEd33CD01541e1eeD10f90519d2C06Fe3feB", // Aurora WETH
  1284: "0xAcc15dC74880C9944775448304B263D191c6077F", // Moonbeam WGLMR
  1285: "0x98878B06940aE243284CA214f92Bb71a2b032B8A", // Moonriver WMOVR
  5000: "0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000", // Mantle WMNT
  9745: "0x4200000000000000000000000000000000000006", // Plasma WETH
  14: "0x1D80c49bBbCd1c0911346656B529dF9E5c2F783d", // Flare WFLR
  40: "0xD102cE6A4dB07D247fcc28F366A623Df0938CA9E", // Telos WTLOS
  50: "0x951857744785E80e2De051c32EE7b25f9c458c42", // XDC WXDC
  57: "0xd3e822f3Ef011Ca5F17D82C956D952D8d7C3A1BB", // Syscoin WSYS
  61: "0x82A618305706B14e7bcf2592D4B9324A366b6dAd", // ETC WETC
  57073: "0x4200000000000000000000000000000000000006", // Inkonchain WInk
  60808: "0x4200000000000000000000000000000000000006", // Bob WETH
  81457: "0x4300000000000000000000000000000000000004", // Blast
  122: "0x5622F6dC93e08a8b717B149677930C38d5d50682", // WFUSE
  1868:  "0x4200000000000000000000000000000000000006",// Soneium
  480: "0x4200000000000000000000000000000000000006", // Worldcoin
  1135:  "0x4200000000000000000000000000000000000006", // Lisk
  1923:  "0x4200000000000000000000000000000000000006", // Swellchain
  2741: "0x4200000000000000000000000000000000000006", // Abstract
  747474: "0x4200000000000000000000000000000000000006", // Katana
  146: "0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38", // Sonic native wrapper
  
}

async function getOneInchSpender(chainId) {
  const { data } = await axios.get(
    `https://api.1inch.io/v5.0/${chainId}/approve/spender`
  )
  return data.address
}

/** Normalize any input into a wei-decimal string (no 0x). */
const toAmountStr = (x) =>
  typeof x === 'bigint' ? x.toString() : String(x ?? '0')

/** Best-effort: if a decimal string, parse with 18; otherwise assume raw wei string */
const toWeiStr18 = (maybeDecimal) => {
  const s = String(maybeDecimal ?? '0')
  if (s.includes('.')) return ethers.parseUnits(s, 18).toString()
  return s // assume already wei
}

class BatchService {
  constructor() {
    // Minimal ERC20 ABI used for approvals/transfers
    this.erc20ABI = [
      'function approve(address spender, uint256 amount) external returns (bool)',
      'function transfer(address to, uint256 amount) external returns (bool)',
      'function balanceOf(address) view returns (uint256)',
      'function decimals() view returns (uint8)'
    ]

    // Optional “batch” ABIs – keep for your fallback utilities
    this.batchTransferABI = [
      'function batchTransfer(address token, address[] calldata recipients, uint256[] calldata amounts) external',
      'function batchTransferETH(address[] calldata recipients, uint256[] calldata amounts) external payable'
    ]

    // Optional: sample batch/multisend contracts (replace with your own if you actually use them)
    this.BATCH_CONTRACTS = {
      // 1: '0xYourBatchContractOnMainnet',
      // 137: '0xYourBatchContractOnPolygon',
      // 42161: '0xYourBatchContractOnArbitrum'
    }
  }

  // ===========================================================================
  // PREFERRED: Build an execution PLAN used by ClaimScreen -> executeChainPlan
  // This prevents "Nothing to execute..." when the scanner passes claims forward.
  // ===========================================================================

  /**
   * claims = [
   * { chainId, tokenAddress, tokenSymbol, amount, recipient }
   * ]
   * We group per-chain, and produce steps that:
   * - approve (if needed) then
   * - aggregator swap (1inch) tokenIn -> wrapped-native (your contract will unwrap)
   * NOTE: We only attach quote metadata; executeChainPlan will call the API
   * to get the actual /swap tx at runtime.
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
      if (!wrappedOut) {
        // skip chains not aligned with aggregator helper
        continue
      }

      // Ask 1inch who the router/spender is on this chain
      let spender = null
      try {
        spender = await getOneInchSpender(chainId)
      } catch {
        spender = null
      }
      if (!spender) {
        // if we can't get a spender, we can't build a safe plan for this chain
        continue
      }

      const steps = []

      // One step per token (dust is from user → router)
      for (const it of items) {
        const tokenIn = it.tokenAddress
        const rawAmount = it.amount
        const amountWeiStr = toWeiStr18(rawAmount)

        let quoteMeta = null
        try {
          quoteMeta = await dexAggregatorService.quoteOneInchSingle({
            chainId,
            tokenIn,
            amount: amountWeiStr,
            slippageBps: 100
          })
        } catch {
          quoteMeta = null
        }

        steps.push({
          needsApproval: true,
          usePermit: false,

          aggregator: '1inch',
          tokenIn,
          tokenOut: wrappedOut,

          amount: amountWeiStr,

          // used by executeChainPlan() for ERC20.approve(...)
          spender,

          quote: quoteMeta || {},
          slippage: 1
        })
      }

      if (steps.length) {
        plan.push({ chainId, steps })
      }
    }

    return plan
  }

  // ===========================================================================
  // LEGACY: Create raw batch transactions (fallback). Your ClaimScreen supports it.
  // ===========================================================================

  async createBatchDustClaim(claims) {
    // Keep your previous behavior: group per chain then produce raw txs.
    // Most people prefer the plan-based path; leaving here for compatibility.
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

  // ---------------------------------------------------------------------------
  // Optional “batch transfer” utilities (only used in legacy flows)
  // ---------------------------------------------------------------------------
  async createNativeBatchTransfer(chainId, claims) {
    try {
      const recipients = claims.map((c) => c.recipient)
      const amounts = claims.map((c) => ethers.parseEther(String(c.amount)))
      const total = amounts.reduce((a, b) => a + b, 0n)

      const batch = this.BATCH_CONTRACTS[chainId]
      if (!batch) {
        // no batch contract configured – return null (your UI can fall back)
        return null
      }
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

      // Fallback: individual transfers
      const iface = new ethers.Interface(this.erc20ABI)
      for (let i = 0; i < recipients.length; i++) {
        const data = iface.encodeFunctionData('transfer', [recipients[i], amounts[i]])
        txs.push({
          to: tokenAddress,
          data,
          value: '0x0',
          gasLimit: '0x186A0', // 100k
          chainId
        })
      }
    } catch (e) {
      console.error('createTokenBatchTransfers error:', e)
    }
    return txs
  }

  // ---------------------------------------------------------------------------
  // Convenience helpers: produce swap transactions straight from aggregator
  // (Optional – you can keep using the plan/executor route instead.)
  // ---------------------------------------------------------------------------
  async createNativeToTokenSwap(chainId, amount, targetTokenSymbol) {
    try {
      const target = await this.getTokenAddress(chainId, targetTokenSymbol)
      const quote = await dexAggregatorService.getBestQuote(
        chainId,
        '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // native pseudo-address
        target,
        toWeiStr18(amount),
        1
      )
      if (quote?.transaction) {
        const val = BigInt(quote.transaction.value || 0)
        const gl = BigInt(quote.estimatedGas || 300000)
        return { to: quote.transaction.to, data: quote.transaction.data, value: '0x' + val.toString(16), gasLimit: '0x' + gl.toString(16), chainId }
      }
    } catch (e) {
      console.error('createNativeToTokenSwap error:', e)
    }
    return null
  }

  async createTokenToTokenSwap(chainId, fromToken, amount, targetTokenSymbol) {
    try {
      const toToken = await this.getTokenAddress(chainId, targetTokenSymbol)
      const quote = await dexAggregatorService.getBestQuote(
        chainId,
        fromToken,
        toToken,
        toAmountStr(amount),
        1
      )
      if (quote?.transaction) {
        const val = BigInt(quote.transaction.value || 0)
        const gl = BigInt(quote.estimatedGas || 300000)
        return { to: quote.transaction.to, data: quote.transaction.data, value: '0x' + val.toString(16), gasLimit: '0x' + gl.toString(16), chainId }
      }
    } catch (e) {
      console.error('createTokenToTokenSwap error:', e)
    }
    return null
  }

  // ---------------------------------------------------------------------------
  // Token maps (extend as you like)
  // ---------------------------------------------------------------------------
  async getTokenAddress(chainId, symbol) {
    const map = {
      1: {
        USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F'
      },
      137: {
        USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
      },
      42161: {
        USDC: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
        USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
      },
      56: {
        USDT: '0x55d398326f99059fF775485246999027B3197955',
        USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'
      }
    }
    return map[Number(chainId)]?.[symbol] ?? '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
  }

  // ---------------------------------------------------------------------------
  // Analytics
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
    const avgGwei = {
      1: 30,
      137: 200,
      42161: 0.1,
      10: 0.001
    }
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
