
// src/services/txStore.js
const STORAGE_KEY = 'dustclaim.txStore.v1'

// ---------- environment guards ----------
const hasWindow = () => typeof window !== 'undefined'
const hasStorage = () => {
  try {
    return hasWindow() && !!window.localStorage
  } catch {
    return false
  }
}

const now = () => Date.now()

// ---------- BigInt-safe JSON ----------
function safeStringify(value) {
  return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
}

function safeParse(raw) {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// ---------- in-memory fallback (if localStorage unavailable) ----------
let memory = [] // used only when localStorage can't be used
function readFromMemory() {
  return Array.isArray(memory) ? memory : []
}
function writeToMemory(txs) {
  memory = Array.isArray(txs) ? txs : []
  notify(memory)
}

// ---------- read/write ----------
function readAll() {
  if (!hasStorage()) return readFromMemory()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return safeParse(raw)
  } catch {
    // fallback to memory if localStorage breaks
    return readFromMemory()
  }
}

function writeAll(txs) {
  const arr = Array.isArray(txs) ? txs : []
  if (!hasStorage()) return writeToMemory(arr)

  try {
    window.localStorage.setItem(STORAGE_KEY, safeStringify(arr))
  } catch {
    // If storage quota / blocked, fall back to memory
    return writeToMemory(arr)
  }

  notify(arr)
}

// ---------- subscriptions ----------
let listeners = []

function notify(txs = null) {
  const all = Array.isArray(txs) ? txs : readAll()
  for (const fn of listeners) {
    try {
      fn(all)
    } catch {
      // listener errors must never break app
    }
  }
}

function subscribe(cb) {
  if (typeof cb !== 'function') return () => {}

  listeners.push(cb)

  // immediate emit (so UI paints)
  try {
    cb(readAll())
  } catch {
    // ignore
  }

  // cross-tab updates
  const onStorage = (e) => {
    try {
      if (!e) return
      if (e.key !== STORAGE_KEY) return
      cb(readAll())
    } catch {
      // ignore
    }
  }

  if (hasWindow()) {
    try {
      window.addEventListener('storage', onStorage)
    } catch {
      // ignore
    }
  }

  return () => {
    listeners = listeners.filter((x) => x !== cb)
    if (hasWindow()) {
      try {
        window.removeEventListener('storage', onStorage)
      } catch {
        // ignore
      }
    }
  }
}

// ---------- CRUD ----------
function upsert(tx) {
  if (!tx || !tx.id) return

  const all = readAll()
  const idx = all.findIndex((t) => t?.id === tx.id)

  const nextTx = {
    ...tx,
    updatedAt: tx.updatedAt ?? now()
  }

  if (idx >= 0) all[idx] = nextTx
  else all.unshift(nextTx)

  writeAll(all)
}

function patch(id, partial) {
  if (!id || !partial) return

  const all = readAll()
  const idx = all.findIndex((t) => t?.id === id)
  if (idx < 0) return

  const updated = {
    ...all[idx],
    ...partial,
    updatedAt: now()
  }

  all[idx] = updated
  writeAll(all)
}

function remove(id) {
  if (!id) return
  const next = readAll().filter((t) => t?.id !== id)
  writeAll(next)
}

function clear() {
  if (!hasStorage()) return writeToMemory([])

  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }

  notify([])
}

function getById(id) {
  if (!id) return null
  return readAll().find((t) => t?.id === id) || null
}

function list(filters = {}) {
  let all = readAll()

  // defensive: if somehow corrupted into non-array, recover
  if (!Array.isArray(all)) all = []

  if (filters.chainId != null) {
    all = all.filter((t) => Number(t?.chainId) === Number(filters.chainId))
  }

  if (filters.from) {
    const f = String(filters.from).toLowerCase()
    all = all.filter((t) => String(t?.from || '').toLowerCase() === f)
  }

  if (filters.status) {
    const s = Array.isArray(filters.status) ? filters.status : [filters.status]
    all = all.filter((t) => s.includes(t?.status))
  }

  if (filters.kind) {
    const k = Array.isArray(filters.kind) ? filters.kind : [filters.kind]
    all = all.filter((t) => k.includes(t?.kind))
  }

  if (filters.flowId) {
    all = all.filter((t) => t?.flowId === filters.flowId)
  }

  if (filters.limit) {
    const lim = Number(filters.limit)
    if (Number.isFinite(lim) && lim > 0) all = all.slice(0, lim)
  }

  return all
}

export const txStore = {
  readAll,
  writeAll,
  upsert,
  patch,
  remove,
  clear,
  getById,
  list,

  // ✅ required by your useTxStore hook
  subscribe,

  // optional (handy for manual UI refresh)
  notify
}

export default txStore
