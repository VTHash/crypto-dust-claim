import { getStore } from '@netlify/blobs'

// Name of the blob store and key we’ll use
const STORE_NAME = 'dustclaim-global-stats'
const STORE_KEY = 'global-stats'

// Simple label map so top chains look nice in the widget
const CHAIN_LABELS = {
  1: 'Ethereum',
  10: 'Optimism',
  56: 'BNB Smart Chain',
  137: 'Polygon PoS',
  42161: 'Arbitrum One',
  8453: 'Base',
  130: 'Unichain',
  5000: 'Mantle',
  9745: 'Plasma',
  324: 'zkSync',
  14: 'Flare',
  40: 'Telos',
  57: 'Syscoin',
  50: 'XDC Network',
  61: 'Ethereum Classic',
  57073: 'Inkonchain',
  122: 'Fuse',
  60808: 'BOB',
  81457: 'Blast',
  1868: 'Soneium',
  480: 'World Chain',
  1135: 'Lisk',
  1923: 'Swellchain',
  2741: 'Abstract',
  747474: 'Katana',
  146: 'Sonic'
}

function createEmptyStats() {
  return {
    // Global totals
    totalScans: 0,
    totalAddresses: 0,

    // address -> true (for uniqueness)
    addresses: {},

    // chainId(string) -> { chainId, name, scans, lastActivity }
    chains: {},

    lastUpdated: null
  }
}

export async function loadStats() {
  const store = getStore(STORE_NAME)

  const data = await store.get(STORE_KEY, { type: 'json' }).catch(() => null)
  if (!data || typeof data !== 'object') {
    return createEmptyStats()
  }

  // Make sure all keys exist even if older structure
  return {
    ...createEmptyStats(),
    ...data,
    addresses: data.addresses || {},
    chains: data.chains || {}
  }
}

export async function saveStats(stats) {
  const store = getStore(STORE_NAME)
  await store.set(STORE_KEY, stats)
}

/**
 * Called by stats-scan when a scan finishes.
 * - address: wallet address string
 * - chains: array of numeric chain IDs used in the scan
 */
export async function recordScan({ address, chains }) {
  const stats = await loadStats()
  const nowIso = new Date().toISOString()

  // Global scan count
  stats.totalScans = (stats.totalScans || 0) + 1

  // Unique address tracking
  if (address) {
    const addr = String(address).toLowerCase()
    if (!stats.addresses[addr]) {
      stats.addresses[addr] = true
      stats.totalAddresses = (stats.totalAddresses || 0) + 1
    }
  }

  // Per-chain stats
  stats.chains = stats.chains || {}
  for (const raw of chains || []) {
    const id = Number(raw)
    if (!Number.isFinite(id)) continue

    const key = String(id)
    if (!stats.chains[key]) {
      stats.chains[key] = {
        chainId: id,
        name: CHAIN_LABELS[id] || `Chain #${id}`,
        scans: 0,
        lastActivity: null
      }
    }

    stats.chains[key].scans += 1
    stats.chains[key].lastActivity = nowIso
  }

  stats.lastUpdated = nowIso
  await saveStats(stats)
  return stats
}

/**
 * Shape the JSON exactly how the frontend widget expects it.
 */
export async function buildStatsView() {
  const stats = await loadStats()

  const chainsArray = Object.values(stats.chains || {})
  chainsArray.sort((a, b) => (b.scans || 0) - (a.scans || 0))

  const topChains = chainsArray.slice(0, 5)

  return {
    totalScans: stats.totalScans || 0,
    totalAddresses: stats.totalAddresses || 0,
    topChains,
    lastUpdated: stats.lastUpdated || null
  }
}