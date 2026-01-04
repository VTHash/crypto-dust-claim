import { ethers } from 'ethers'

// ---- Multicall v3 addresses (same on many chains) ----
const MULTICALL3 = {
1: '0xcA11bde05977b3631167028862bE2a173976CA11', // Ethereum
10: '0xcA11bde05977b3631167028862bE2a173976CA11', // Optimism
14: '0xcA11bde05977b3631167028862bE2a173976CA11', // Flare
40: '0xcA11bde05977b3631167028862bE2a173976CA11', // Telos (best-effort)
50: '0xcA11bde05977b3631167028862bE2a173976CA11', // XDC (best-effort)
56: '0xcA11bde05977b3631167028862bE2a173976CA11', // BNB
57: '0xcA11bde05977b3631167028862bE2a173976CA11', // Syscoin (best-effort)
61: '0xcA11bde05977b3631167028862bE2a173976CA11', // ETC (best-effort)
100: '0xcA11bde05977b3631167028862bE2a173976CA11', // Gnosis
130: '0xcA11bde05977b3631167028862bE2a173976CA11', // Unichain (best-effort)
137: '0xcA11bde05977b3631167028862bE2a173976CA11', // Polygon
195: null, // X1 (unknown)
250: '0xcA11bde05977b3631167028862bE2a173976CA11', // Fantom
1284: '0xcA11bde05977b3631167028862bE2a173976CA11', // Moonbeam
1285: '0xcA11bde05977b3631167028862bE2a173976CA11', // Moonriver
1329: '0xcA11bde05977b3631167028862bE2a173976CA11', // Sei EVM (best-effort)
34443: '0xcA11bde05977b3631167028862bE2a173976CA11', // Mode
42161: '0xcA11bde05977b3631167028862bE2a173976CA11', // Arbitrum
43114: '0xcA11bde05977b3631167028862bE2a173976CA11', // Avalanche
5000: '0xcA11bde05977b3631167028862bE2a173976CA11', // Mantle
59144: '0xcA11bde05977b3631167028862bE2a173976CA11', // Linea
7777777: '0xcA11bde05977b3631167028862bE2a173976CA11', // Zora
80094: '0xcA11bde05977b3631167028862bE2a173976CA11', // Berachain
8453: '0xcA11bde05977b3631167028862bE2a173976CA11', // Base
9745: '0xcA11bde05977b3631167028862bE2a173976CA11', // Plasma (best-effort)
1313161554: '0xcA11bde05977b3631167028862bE2a173976CA11', // Aurora
57073: '0xcA11bde05977b3631167028862bE2a173976CA11', // Inkonchain (best-effort)
170000: '0xcA11bde05977b3631167028862bE2a173976CA11', // Taiko
42170: '0xcA11bde05977b3631167028862bE2a173976CA11', // Arbitrum Nova
534352: '0xcA11bde05977b3631167028862bE2a173976CA11', // Scroll (best-effort)
28105: '0xcA11bde05977b3631167028862bE2a173976CA11', // Morph (best-effort)
}

// Simple ERC-20 ABI
const ERC20_ABI = [
'function balanceOf(address) view returns (uint256)',
'function decimals() view returns (uint8)',
'function symbol() view returns (string)',
'function name() view returns (string)',
]

// -------------------------------
// Tokenlist sources (NO 1INCH)
// -------------------------------
//
// Notes:
// - Uniswap list is multi-chain and very reliable.
// - CoinGecko chain lists are broad (good coverage).
// - Polygon has its own official token APIs (mapped/popular).
//
const TOKENLIST_SOURCES = {
// Ethereum
1: [
'https://tokens.uniswap.org',
'https://tokens.coingecko.com/uniswap/all.json',
],

// Optimism
10: [
'https://tokens.uniswap.org',
'https://tokens.coingecko.com/optimistic-ethereum/all.json',
],

// BNB
56: [
'https://tokens.uniswap.org',
'https://tokens.coingecko.com/binance-smart-chain/all.json',
],

// Gnosis
100: [
'https://tokens.uniswap.org',
'https://tokens.coingecko.com/xdai/all.json',
],

// Polygon
137: [
'https://tokens.uniswap.org',
'https://tokens.coingecko.com/polygon-pos/all.json',
// Polygon official token APIs (tokenlists)
'https://api-polygon-tokens.polygon.technology/tokenlists/mapped/tokens.json',
'https://api-polygon-tokens.polygon.technology/tokenlists/popular/tokens.json',
],

// Fantom
250: [
'https://tokens.uniswap.org',
'https://tokens.coingecko.com/fantom/all.json',
],

// Mode
34443: [
'https://tokens.uniswap.org',
'https://raw.githubusercontent.com/mode-network/asset-list/main/list.json',
],

// Arbitrum
42161: [
'https://tokens.uniswap.org',
'https://tokens.coingecko.com/arbitrum-one/all.json',
],

// Avalanche
43114: [
'https://tokens.uniswap.org',
'https://tokens.coingecko.com/avalanche/all.json',
],

// Base
8453: [
'https://tokens.uniswap.org',
'https://tokens.coingecko.com/base/all.json',
],

// Linea
59144: [
'https://tokens.uniswap.org',
'linea-mainnet-token-shortlist.json',
'https://raw.githubusercontent.com/Consensys/linea-token-list/main/json/linea-mainnet-token-shortlist.json',
],

// Zora
7777777: [
'https://tokens.uniswap.org',
'https://raw.githubusercontent.com/zora-community/token-list/main/zora.tokenlist.json',
],

// Berachain
80094: [
'https://tokens.uniswap.org',
'https://raw.githubusercontent.com/Berachain/token-list/main/bera.tokenlist.json',
],

// Unichain
130: [
'https://tokens.uniswap.org',
'https://raw.githubusercontent.com/Uniswap/token-lists/refs/heads/main/test/schema/bigexample.tokenlist.json',
],

// Celo
42220: [
'https://tokens.uniswap.org',
'https://tokens.coingecko.com/celo/all.json',
],

// Aurora
1313161554: [
'https://tokens.uniswap.org',
'https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/aurora.tokenlist.json',
],

// Moonbeam
1284: [
'https://tokens.uniswap.org',
'https://raw.githubusercontent.com/moonbeam-foundation/moonbeam-token-list/main/tokens/moonbeam.json',
],

// Moonriver
1285: [
'https://tokens.uniswap.org',
'https://raw.githubusercontent.com/moonbeam-foundation/moonbeam-token-list/main/tokens/moonriver.json',
],

// Mantle
5000: [
'https://tokens.uniswap.org',
'https://raw.githubusercontent.com/mantlenetworkio/mantle-token-list/main/mantle.tokenlist.json',
],

// Sei EVM (best-effort)
1329: [
'https://tokens.uniswap.org',
'https://raw.githubusercontent.com/sei-protocol/token-list/main/sei.tokenlist.json',
],

// Plasma (best-effort)
9745: [
'https://tokens.uniswap.org',
'https://raw.githubusercontent.com/plasma-network/token-list/main/plasma.tokenlist.json',
],

// Flare (best-effort)
14: [
'https://tokens.uniswap.org',
'https://raw.githubusercontent.com/flare-labs/token-list/main/flare.tokenlist.json',
],
}

// -------------------------------
// helpers
// -------------------------------
async function fetchJson(url) {
const r = await fetch(url, { cache: 'no-store' })
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
logoURI: t.logoURI || '',
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
logoURI: t.logoURI || '',
})
}
}

// Polygon token API: { tokens: [...] } OR { result: [...] } (varies)
if (Array.isArray(raw.result)) {
for (const t of raw.result) {
if (!t?.address) continue
out.push({
chainId: Number(chainId),
address: t.address,
symbol: t.symbol || '',
decimals: t.decimals ?? 18,
name: t.name || '',
logoURI: t.logoURI || '',
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
const urls = TOKENLIST_SOURCES[Number(chainId)] || []
const merged = []

for (const url of urls) {
try {
const json = await fetchJson(url)
merged.push(...normalizeTokenList(chainId, json))
} catch {
// ignore bad sources
}
}

// Final dedupe (in case multiple sources overlap)
const byAddr = new Map()
for (const t of merged) {
byAddr.set(String(t.address).toLowerCase(), t)
}
return Array.from(byAddr.values())
}

async function multicallBalances(provider, chainId, owner, tokens) {
const mcAddr = MULTICALL3[Number(chainId)]
if (!mcAddr) return []

const aggregateIface = new ethers.Interface([
'function aggregate((address target, bytes callData)[]) public returns (uint256 blockNumber, bytes[] returnData)',
])
const erc20Iface = new ethers.Interface(ERC20_ABI)

const calls = tokens.map((t) => ({
target: t.address,
callData: erc20Iface.encodeFunctionData('balanceOf', [owner]),
}))

const CHUNK = 200
const results = []

for (let i = 0; i < calls.length; i += CHUNK) {
const slice = calls.slice(i, i + CHUNK)
try {
const data = await provider.call({
to: mcAddr,
data: aggregateIface.encodeFunctionData('aggregate', [slice]),
})

const decoded = aggregateIface.decodeFunctionResult('aggregate', data)  
  const returnData = decoded[1]  

  for (let j = 0; j < returnData.length; j++) {  
    const raw = returnData[j]  
    const bal = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], raw)[0]  
    if (bal > 0n) {  
      const tok = tokens[i + j]  
      results.push({  
        chainId: Number(chainId),  
        address: tok.address,  
        symbol: tok.symbol || '',  
        decimals: tok.decimals ?? 18,  
        balance: bal.toString(),  
        name: tok.name || '',  
        logoURI: tok.logoURI || '',  
      })  
    }  
  }  
} catch {  
  // ignore chunk errors  
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

// 1) Load token candidates from public tokenlists
const tokens = await loadTokenListForChain(chainId)

// 2) Multicall balance scan
const balances = tokens.length
? await multicallBalances(provider, chainId, owner, tokens)
: []

// 3) Return only positives (already filtered)
return balances
}