import { ethers } from 'ethers'
import { getContractConfig } from '../config/contracts'
import dexAggregator from './dexAggregatorService'

/**
 * Per-chain wrapped native (WETH/WBNB/WMATIC …) address.
 * Used both for DustClaim ERC-20 swaps and for native sweep (via aggregator).
 */
const WRAPPED_NATIVE_BY_CHAIN = {
 1: "0xa87B722979D3c2D381A225E224427498455d535e", // Ethereum ✅
  10: "0xEB4931BE941D830425420D1Ba7206e8E43854795", // OP Mainnet
  56: "0xC9b01707cE50803783ECcD0A995233Ab3052Fd1A", // BNB Smart Chain
  100: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Gnosis
  137: "0x6f04783806684760f841b981d1823b46584200D8", // Polygon PoS
  195: "", // X1
  250: "0xe6292481711419e6035b8Ac263Fd91AF48142966", // Fantom
  1329: "0x7692fDf5bbcA49ACE485D31B760e8A082d193D3d", // Sei
  8453: "0xBfc253Ffc3fDD5533D91937f062bf0CD7d4A1551", // Base
  34443: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Mode
  42161: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // Arbitrum One
  43114: "0xe41a31664DaCf9cE696545Cf770e7F6662CF61fd", // Avalanche C
  59144: "0xBB45cc85B5e6505Ad1C8403227Da68ba0F13357B", // Linea
  80094: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Berachain (matches your SUPPORTED_CHAINS)
  7777777: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Zora
  130: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Unichain
  42220: "0x7692fDf5bbcA49ACE485D31B760e8A082d193D3d", // Celo
  1313161554: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Aurora
  1284: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Moonbeam
  1285: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Moonriver
  5000: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Mantle
  9745: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Plasma
  14: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Flare
  40: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Telos
  57: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Syscoin
  61: "0x7692fDf5bbcA49ACE485D31B760e8A082d193D3d", // ETC
  57073: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Inkonchain
  122: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Fuse
  60808: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Bob
  81457:  "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Blast
 1868:  "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Soneium
 480:  "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Worldcoin
 1135:  "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Lisk
 1923: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Swellchain
 2741: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Abstract
 747474: "0x7692fDf5bbcA49ACE485D31B760e8A082d193D3d", // Katana
 146: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Sonic
 534352: "0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc", // Scroll
  167000: '0xd63C9015624491f6Ba7cC137E46D8dF2132F2b46', // Taiko
  42170: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc', // Arbitrum Nova
  28185: '0xe7A0350d7D99441A0f67B4E4e7f8391f09c574dc', // Morph
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