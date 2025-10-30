import { ethers } from 'ethers'
import { getContractConfig } from '../config/contracts'
import dexAggregator from './dexAggregatorService'

/**
 * Per-chain wrapped native (WETH/WBNB/WMATIC …) address.
 * We only need it to quote token -> wrappedNative; contract unwraps to ETH.
 */
const WRAPPED_NATIVE_BY_CHAIN = {
  1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // Ethereum
  10: '0x4200000000000000000000000000000000000006', // Optimism
  56: '0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // BNB
  137:'0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // Polygon (WMATIC)
  42161:'0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // Arbitrum
  8453:'0x4200000000000000000000000000000000000006', // Base
}

/**
 * Build a single DustClaim contract call:
 * claimDustToETH(token, minReturnAmount, swapData)
 * We use a 1inch quote for minReturnAmount. swapData is left 0x unless you add a backend builder.
 */
export async function buildDustClaimTx(chainId, token, amountWei, signer) {
  const cfg = getContractConfig(chainId)
  if (!cfg?.address) throw new Error(`No DustClaim deployed on chain ${chainId}`)

  const wrapped = WRAPPED_NATIVE_BY_CHAIN[Number(chainId)]
  if (!wrapped) throw new Error(`No wrapped-native configured for chain ${chainId}`)

  // Quote token -> wrappedNative on 1inch to get minReturnAmount
  const q = await dexAggregator.get1InchQuote(
    Number(chainId),
    token,
    wrapped,
    typeof amountWei === 'bigint' ? amountWei.toString() : String(amountWei)
  )
  if (!q?.toTokenAmount) throw new Error('1inch quote failed for this token')

  const minReturnAmount = q.toTokenAmount
  const swapData = '0x' // placeholder; wire real router calldata when backend is ready

  // Encode function call
  const iface = new ethers.Interface(cfg.abi)
  const data = iface.encodeFunctionData('claimDustToETH', [
    token,
    minReturnAmount,
    swapData,
  ])

  return {
    chainId: Number(chainId),
    to: cfg.address,
    data,
    value: 0n,
  }
}

/**
 * Build a list of transactions for all ERC-20 dust items found by the scanner.
 * Expects dustResults shape from DustScanner (with tokenDust[] each having {address, balance, amountWei?}).
 */
export async function buildDustClaimBatch(dustResults, signer) {
  const txs = []
  for (const r of (dustResults || [])) {
    const chainId = Number(r.chainId)
    for (const t of (r.tokenDust || [])) {
      // prefer exact wei if you stored it; otherwise parse from balance + decimals (already handled by scanner)
      const amountWei = t.amountWei ?? t.balanceWei ?? t.balance // must be wei-like string
      if (!amountWei) continue
      const tx = await buildDustClaimTx(chainId, t.address, amountWei, signer)
      txs.push(tx)
    }
  }
  return txs
}