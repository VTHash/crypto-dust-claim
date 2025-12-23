const STORAGE_KEY = 'dustclaim.txStore.v1'

const now = () => Date.now()

function safeParse(raw) {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function readAll() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  return safeParse(raw)
}

function writeAll(txs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(txs))
}

function upsert(tx) {
  const all = readAll()
  const idx = all.findIndex((t) => t.id === tx.id)
  if (idx >= 0) all[idx] = tx
  else all.unshift(tx)
  writeAll(all)
}

function patch(id, partial) {
  const all = readAll()
  const idx = all.findIndex((t) => t.id === id)
  if (idx < 0) return
  const updated = { ...all[idx], ...partial, updatedAt: now() }
  all[idx] = updated
  writeAll(all)
}

function remove(id) {
  writeAll(readAll().filter((t) => t.id !== id))
}

function clear() {
  localStorage.removeItem(STORAGE_KEY)
}

function getById(id) {
  return readAll().find((t) => t.id === id) || null
}

function list(filters = {}) {
  let all = readAll()

  if (filters.chainId != null) all = all.filter((t) => t.chainId === filters.chainId)

  if (filters.from) {
    const f = String(filters.from).toLowerCase()
    all = all.filter((t) => String(t.from).toLowerCase() === f)
  }

  if (filters.status) {
    const s = Array.isArray(filters.status) ? filters.status : [filters.status]
    all = all.filter((t) => s.includes(t.status))
  }

  if (filters.kind) {
    const k = Array.isArray(filters.kind) ? filters.kind : [filters.kind]
    all = all.filter((t) => k.includes(t.kind))
  }

  if (filters.limit) all = all.slice(0, filters.limit)
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
  list
}