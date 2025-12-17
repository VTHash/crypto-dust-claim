// src/services/tokenDiscoveryService.js
import { ethers } from 'ethers'

// ---- Multicall v3 addresses (same on many chains) ----
const MULTICALL3 = {
  1: '0xcA11bde05977b3631167028862bE2a173976CA11',
  10: '0xcA11bde05977b3631167028862bE2a173976CA11',
  14: '0xcA11bde05977b3631167028862bE2a173976CA11',
  40: '0xcA11bde05977b3631167028862bE2a173976CA11',
  50: '0xcA11bde05977b3631167028862bE2a173976CA11',
  56: '0xcA11bde05977b3631167028862bE2a173976CA11',
  57: '0xcA11bde05977b3631167028862bE2a173976CA11',
  61: '0xcA11bde05977b3631167028862bE2a173976CA11',
  100: '0xcA11bde05977b3631167028862bE2a173976CA11',
  130: '0xcA11bde05977b3631167028862bE2a173976CA11',
  137: '0xcA11bde05977b3631167028862bE2a173976CA11',
  250: '0xcA11bde05977b3631167028862bE2a173976CA11',
  1284: '0xcA11bde05977b3631167028862bE2a173976CA11',
  1285: '0xcA11bde05977b3631167028862bE2a173976CA11',
  1329: '0xcA11bde05977b3631167028862bE2a173976CA11',
  34443: '0xcA11bde05977b3631167028862bE2a173976CA11',
  42161: '0xcA11bde05977b3631167028862bE2a173976CA11',
  43114: '0xcA11bde05977b3631167028862bE2a173976CA11',
  5000: '0xcA11bde05977b3631167028862bE2a173976CA11',
  59144: '0xcA11bde05977b3631167028862bE2a173976CA11',
  7777777: '0xcA11bde05977b3631167028862bE2a173976CA11',
  80094: '0xcA11bde05977b3631167028862bE2a173976CA11',
  8453: '0xcA11bde05977b3631167028862bE2a173976CA11',
  9745: '0xcA11bde05977b3631167028862bE2a173976CA11',
  1313161554: '0xcA11bde05977b3631167028862bE2a173976CA11',
  57073: '0xcA11bde05977b3631167028862bE2a173976CA11',
  170000: '0xcA11bde05977b3631167028862bE2a173976CA11',
  42170: '0xcA11bde05977b3631167028862bE2a173976CA11',
  534352: '0xcA11bde05977b3631167028862bE2a173976CA11',
  28105: '0xcA11bde05977b3631167028862bE2a173976CA11'
}

// Simple ERC-20 ABI
const ERC20_ABI = ['function balanceOf(address) view returns (uint256)']

// -------------------------------
// Tokenlist sources (NO GitHub raw URLs)
// -------------------------------
//
// We only keep sources that are typically CORS-friendly:
// - Uniswap list
// - CoinGecko tokenlists (tokens.coingecko.com)
// - Polygon official token APIs
//
const TOKENLIST_SOURCES = {
  // Ethereum
  1: ['https://tokens.uniswap.org', 'https://tokens.coingecko.com/uniswap/all.json'],

  // Optimism
  10: ['https://tokens.uniswap.org', 'https://tokens.coingecko.com/optimistic-ethereum/all.json'],

  // BNB
  56: ['https://tokens.uniswap.org', 'https://tokens.coingecko.com/binance-smart-chain/all.json'],

  // Gnosis
  100: ['https://tokens.uniswap.org', 'https://tokens.coingecko.com/xdai/all.json'],

  // Polygon
  137: [
    'https://tokens.uniswap.org',
    'https://tokens.coingecko.com/polygon-pos/all.json',
    'https://api-polygon-tokens.polygon.technology/tokenlists/mapped/tokens.json',
    'https://api-polygon-tokens.polygon.technology/tokenlists/popular/tokens.json'
  ],

  // Fantom
  250: ['https://tokens.uniswap.org', 'https://tokens.coingecko.com/fantom/all.json'],

  // Arbitrum
  42161: ['https://tokens.uniswap.org', 'https://tokens.coingecko.com/arbitrum-one/all.json'],

  // Avalanche
  43114: ['https://tokens.uniswap.org', 'https://tokens.coingecko.com/avalanche/all.json'],

  // Base
  8453: ['https://tokens.uniswap.org', 'https://tokens.coingecko.com/base/all.json'],

  // Celo
  42220: ['https://tokens.uniswap.org', 'https://tokens.coingecko.com/celo/all.json']
}

// -------------------------------
// caching + dedupe (important during scans)
// -------------------------------
const listCache = new Map() // chainId -> { tokens, ts }
const inFlight = new Map() // chainId -> Promise
const LIST_TTL_MS = 5 * 60_000 // 5 minutes

function now() {
  return Date.now()
}

function getCachedList(chainId) {
  const entry = listCache.get(Number(chainId))
  if (!entry) return null
  if (now() - entry.ts > LIST_TTL_MS) {
    listCache.delete(Number(chainId))
    return null
  }
  return entry.tokens
}

function setCachedList(chainId, tokens) {
  listCache.set(Number(chainId), { tokens, ts: now() })
}

// -------------------------------
// helpers
// -------------------------------
async function fetchJson(url) {
  // Some hosts can be flaky—set conservative options
  const r = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: { accept: 'application/json' }
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

function normalizeTokenList(chainId, raw) {
  const out = []
  if (!raw) return out

  // Uniswap/CoinGecko-style: { tokens: [...] }
  if (Array.isArray(raw.tokens)) {
    for (const t of raw.tokens) {
      if (!t?.address) continue
      out.push({
        chainId: t.chainId ?? Number(chainId),
        address: t.address,
        symbol: t.symbol || '',
        decimals: t.decimals ?? 18,
        name: t.name || '',
        logoURI: t.logoURI || ''
      })
    }
  }

  // Some lists are arrays directly: [...]
  if (Array.isArray(raw)) {
    for (const t of raw) {
      if (!t?.address) continue
      out.push({
        chainId: t.chainId ?? Number(chainId),
        address: t.address,
        symbol: t.symbol || '',
        decimals: t.decimals ?? 18,
        name: t.name || '',
        logoURI: t.logoURI || ''
      })
    }
  }

  // Polygon token API: { result: [...] } (varies)
  if (Array.isArray(raw.result)) {
    for (const t of raw.result) {
      if (!t?.address) continue
      out.push({
        chainId: Number(chainId),
        address: t.address,
        symbol: t.symbol || '',
        decimals: t.decimals ?? 18,
        name: t.name || '',
        logoURI: t.logoURI || ''
      })
    }
  }

  // Deduplicate by address (lowercase)
  const seen = new Set()
  return out
    .filter((t) => {
      const k = String(t.address).toLowerCase()
      if (!k || seen.has(k)) return false
      seen.add(k)
      return true
    })
    .map((t) => ({ ...t, chainId: Number(chainId) }))
}

async function loadTokenListForChain(chainId) {
  const cid = Number(chainId)

  const cached = getCachedList(cid)
  if (cached) return cached

  const existing = inFlight.get(cid)
  if (existing) return existing

  const p = (async () => {
    const urls = TOKENLIST_SOURCES[cid] || []
    if (!urls.length) {
      setCachedList(cid, [])
      return []
    }

    const merged = []
    for (const url of urls) {
      try {
        const json = await fetchJson(url)
        merged.push(...normalizeTokenList(cid, json))
      } catch (e) {
        // keep quiet but useful during debugging
        // console.warn('[tokenDiscovery] tokenlist fetch failed:', cid, url, e?.message)
      }
    }

    // Final dedupe (in case multiple sources overlap)
    const byAddr = new Map()
    for (const t of merged) {
      byAddr.set(String(t.address).toLowerCase(), t)
    }

    const finalList = Array.from(byAddr.values())
    setCachedList(cid, finalList)
    return finalList
  })().finally(() => {
    inFlight.delete(cid)
  })

  inFlight.set(cid, p)
  return p
}

async function multicallBalances(provider, chainId, owner, tokens) {
  const mcAddr = MULTICALL3[Number(chainId)]
  if (!mcAddr) return []

  // ✅ Use tryAggregate(requireSuccess=false) so one failing token doesn't revert the whole chunk
  const multicallIface = new ethers.Interface([
    'function tryAggregate(bool requireSuccess, (address target, bytes callData)[] calls) public returns (tuple(bool success, bytes returnData)[] returnData)'
  ])

  const erc20Iface = new ethers.Interface(ERC20_ABI)

  const calls = tokens.map((t) => ({
    target: t.address,
    callData: erc20Iface.encodeFunctionData('balanceOf', [owner])
  }))

  const CHUNK = 200
  const results = []

  for (let i = 0; i < calls.length; i += CHUNK) {
    const sliceCalls = calls.slice(i, i + CHUNK)

    let raw
    try {
      raw = await provider.call({
        to: mcAddr,
        data: multicallIface.encodeFunctionData('tryAggregate', [false, sliceCalls])
      })
    } catch {
      // If multicall itself fails on this chain/provider, bail out
      continue
    }

    let decoded
    try {
      decoded = multicallIface.decodeFunctionResult('tryAggregate', raw)
    } catch {
      continue
    }

    const tuples = decoded?.[0] || []
    for (let j = 0; j < tuples.length; j++) {
      const [ok, ret] = tuples[j] || []
      if (!ok || !ret || ret === '0x') continue

      try {
        const bal = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], ret)[0]
        if (bal > 0n) {
          const tok = tokens[i + j]
          results.push({
            chainId: Number(chainId),
            address: tok.address,
            symbol: tok.symbol || '',
            decimals: tok.decimals ?? 18,
            balance: bal, // keep as bigint so caller can formatUnits safely
            name: tok.name || '',
            logoURI: tok.logoURI || ''
          })
        }
      } catch {
        // ignore decode failures per-token
      }
    }
  }

  return results
}

// -------------------------------
// Public API
// -------------------------------
export async function discoverAllERC20s({ provider, chainId, owner }) {
  if (!provider) throw new Error('Missing provider')
  if (!owner) throw new Error('Missing owner')

  // 1) Load token candidates from public tokenlists (non-GitHub sources only)
  const tokens = await loadTokenListForChain(chainId)

  // 2) Multicall balance scan (safe: tryAggregate(false))
  const balances = tokens.length ? await multicallBalances(provider, chainId, owner, tokens) : []

// 3) Return positives (already filtered)
  return balances
}