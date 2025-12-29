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

// ---------- id helpers ----------
const genId = (prefix = 'tx') =>
  `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`

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
let memory = []
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
    return readFromMemory()
  }
}

function writeAll(txs) {
  const arr = Array.isArray(txs) ? txs : []
  if (!hasStorage()) return writeToMemory(arr)

  try {
    window.localStorage.setItem(STORAGE_KEY, safeStringify(arr))
  } catch {
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
      // never break app
    }
  }
}

function subscribe(cb) {
  if (typeof cb !== 'function') return () => {}

  listeners.push(cb)

  try {
    cb(readAll())
  } catch {
    // ignore
  }

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

// ---------- normalization ----------
function normalizeTx(tx) {
  const t = { ...(tx || {}) }

  // normalize hash naming (support both)
  if (t.txHash && !t.hash) t.hash = t.txHash
  if (t.hash && !t.txHash) t.txHash = t.hash

  // ensure ids exist
  if (!t.id) {
    const prefix = t.kind || 'tx'
    t.id = genId(prefix)
  }

  if (t.createdAt == null) t.createdAt = now()
  if (t.updatedAt == null) t.updatedAt = now()

  return t
}

// ---------- CRUD ----------
function upsert(tx) {
  const nextTx = normalizeTx(tx)
  const all = readAll()

  const idx = all.findIndex((t) => t?.id === nextTx.id)
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...nextTx, updatedAt: now() }
  } else {
    all.unshift({ ...nextTx, updatedAt: now() })
  }

  writeAll(all)
  return nextTx.id
}

function patch(id, partial) {
  if (!id || !partial) return

  const all = readAll()
  const idx = all.findIndex((t) => t?.id === id)
  if (idx < 0) return

  const merged = { ...all[idx], ...(partial || {}) }

  // normalize hash fields on patch too
  if (merged.txHash && !merged.hash) merged.hash = merged.txHash
  if (merged.hash && !merged.txHash) merged.txHash = merged.hash

  all[idx] = { ...merged, updatedAt: now() }
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
  subscribe,
  notify
}

export default txStore