import { ethers } from 'ethers'
import { getContractConfig } from '../config/contracts'
import dexAggregator from './dexAggregatorService'

/**
 * Per-chain wrapped native (WETH/WBNB/WMATIC …) address.
 * Used both for DustClaim ERC-20 swaps and for native sweep (via aggregator).
 */
const WRAPPED_NATIVE_BY_CHAIN = {
  1: '0x73f2Ef769b3Dc5c84390347b05cc1D89dD9644f', // Ethereum ✅
  10: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46', // Optimism
  56: '0x8794D4CD9b641eD623235ca418640e10E4d75D6F', // BNB Smart Chain
  100: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46', // Gnosis
  137: '0xf977f21430b99aE91680aC2e0fFD8cA481ec486F', // Polygon PoS
  195: '', // X1 (not wired yet)
  250: '0xe6292481711419e6035b8Ac263Fd91AF48142966', // Fantom
  1329: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46', // Sei
  8453: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46', // Base
  34443: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46', // Mode
  42161: '0xd7aC005D908Cbf7A9692478c4DEef2525CA2A2fE', // Arbitrum One
  43114: '0xA10980211Cda7228708e774ef11c7E299E6947dB', // Avalanche C-Chain
  59144: '0xEB4931BE941D830425420D1Ba7206e8E43854795', // Linea
  80094: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46', // Berachain bArtio
  7777777: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46', // Zora
  130: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46', // Unichain
  42220: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46', // Celo
  1313161554: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46', // Aurora
  1284: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46' // Moonbeam
}

const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
const NATIVE_ADDR = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

/** Helpers ---------------------------------------------------------------- */

const toWeiString = (v) =>
  typeof v === 'bigint' ? v.toString() : String(v ?? '0')

function isErc20Address(addr) {
  if (!addr) return false
  const a = addr.toLowerCase()
  if (a === ZERO_ADDR.toLowerCase()) return false
  if (a === NATIVE_ADDR.toLowerCase()) return false
  return a.length === 42 && a.startsWith('0x')
}

/**
 * Resolve a token's amount in wei from various shapes the scanner may use.
 * Supports:
 * - amountWei / balanceWei / raw (already wei-like)
 * - balance + decimals (human units)
 */
function resolveAmountWeiFromToken(token) {
  if (!token) return null

  if (token.amountWei != null) return toWeiString(token.amountWei)
  if (token.balanceWei != null) return toWeiString(token.balanceWei)
  if (token.raw != null) return toWeiString(token.raw)

  if (token.balance != null && token.decimals != null) {
    try {
      const bn = ethers.parseUnits(String(token.balance), Number(token.decimals))
      return bn.toString()
    } catch (e) {
      console.warn('resolveAmountWeiFromToken: parseUnits failed', e)
      return null
    }
  }

  return null
}

/** ------------------------------------------------------------------------ */
/** ERC-20 DustClaim route */
/** ------------------------------------------------------------------------ */

/**
 * Build a single DustClaim contract call:
 * claimDustToETH(token, minReturnAmount, swapData)
 *
 * We use a 1inch quote for minReturnAmount. swapData is still "0x" for now,
 * unless/until you wire real router calldata from a backend.
 */
export async function buildDustClaimTx(chainId, token, amountWei, signer) {
  const cfg = getContractConfig(chainId)
  if (!cfg?.address) throw new Error(`No DustClaim deployed on chain ${chainId}`)

  const wrapped = WRAPPED_NATIVE_BY_CHAIN[Number(chainId)]
  if (!wrapped) throw new Error(`No wrapped-native configured for chain ${chainId}`)

  const amountStr = toWeiString(amountWei)

  const q = await dexAggregator.get1InchQuote(
    Number(chainId),
    token,
    wrapped,
    amountStr
  )

  if (!q?.toTokenAmount) {
    throw new Error('1inch quote failed for this token')
  }

  const minReturnAmount = q.toTokenAmount
  const swapData = '0x'

  const iface = new ethers.Interface(cfg.abi)
  const data = iface.encodeFunctionData('claimDustToETH', [
    token,
    minReturnAmount,
    swapData
  ])

  return {
    chainId: Number(chainId),
    to: cfg.address,
    data,
    value: 0n
  }
}

/** ------------------------------------------------------------------------ */
/** Native sweep route (new) */
/** ------------------------------------------------------------------------ */

/**
 * Build a direct aggregator swap for native dust:
 * native (ETH/BNB/MATIC/…) -> wrapped native (WETH/WBNB/WMATIC…)
 *
 * The router tx is executed directly by the wallet; your DustClaim contract
 * isn’t involved here.
 */
async function buildNativeSweepTx(chainId, nativeAmountWei) {
  const wrapped = WRAPPED_NATIVE_BY_CHAIN[Number(chainId)]
  if (!wrapped) throw new Error(`No wrapped-native configured for chain ${chainId}`)

  const amountStr = toWeiString(nativeAmountWei)

  // Use your generic aggregator helper (same pattern as in BatchService)
  const quote = await dexAggregator.getBestQuote(
    Number(chainId),
    NATIVE_ADDR,
    wrapped,
    amountStr,
    1 // 1 bp slippage guard; adjust if needed
  )

  if (!quote?.transaction) {
    throw new Error('No aggregator transaction returned for native sweep')
  }

  const tx = quote.transaction
  const valueBig = BigInt(tx.value || 0)

  return {
    chainId: Number(chainId),
    to: tx.to,
    data: tx.data,
    value: valueBig
    // gasLimit is optional; provider/wallet can estimate
  }
}

/** ------------------------------------------------------------------------ */
/** Batch builder used by ClaimScreen */
/** ------------------------------------------------------------------------ */

/**
 * Build transactions for all claimable balances the scanner found.
 *
 * - ERC-20s → DustClaim.claimDustToETH (same as before)
 * - (NEW) optional native sweeps → aggregator router txs
 *
 * dustResults: array of per-chain objects, coming from Scanner / Dashboard:
 * {
 * chainId,
 * nativeBalance,
 * // one of:
 * claimableTokens?: [...],
 * tokenDust?: [...],
 * tokenDetails?: [...]
 * }
 *
 * options:
 * - includeNative (bool): also sweep native if > 0.
 */
export async function buildDustClaimBatch(
  dustResults = [],
  signer,
  { includeNative = false } = {}
) {
  const txs = []

  for (const r of dustResults || []) {
    const chainId = Number(r.chainId)
    if (!Number.isFinite(chainId)) continue

    const wrapped = WRAPPED_NATIVE_BY_CHAIN[chainId]
    if (!wrapped) {
      // Skip chains without a configured wrapped native / DustClaim deployment.
      continue
    }

    // ------- 1) ERC-20 balances (unchanged logic, just more flexible source) ------
    const tokens =
      (Array.isArray(r.claimableTokens) && r.claimableTokens.length
        ? r.claimableTokens
        : Array.isArray(r.tokenDust) && r.tokenDust.length
        ? r.tokenDust
        : Array.isArray(r.tokenDetails)
        ? r.tokenDetails
        : [])

    for (const t of tokens) {
      const addr = (t.address || '').toLowerCase()
      if (!isErc20Address(addr)) continue

      const amountWei = resolveAmountWeiFromToken(t)
      if (!amountWei) continue

      try {
        const tx = await buildDustClaimTx(chainId, t.address, amountWei, signer)
        txs.push(tx)
      } catch (e) {
        console.warn(
          'buildDustClaimBatch: skipping ERC20 token',
          chainId,
          t.address,
          e?.message || e
        )
      }
    }

    // ------- 2) Native sweep (NEW) -----------------------------------------------
    if (includeNative) {
      const nativeBal = Number(r.nativeBalance || 0)
      if (nativeBal > 0) {
        try {
          // All these chains are 18-decimal native assets
          const nativeWei = ethers.parseUnits(String(r.nativeBalance), 18)
          const nativeTx = await buildNativeSweepTx(chainId, nativeWei)
          txs.push(nativeTx)
        } catch (e) {
          console.warn(
            'buildDustClaimBatch: skipping native sweep',
            chainId,
            e?.message || e
          )
        }
      }
    }
  }

  return txs
}