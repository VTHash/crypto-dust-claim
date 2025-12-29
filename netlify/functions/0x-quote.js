// netlify/functions/0x-quote.js
// Browser -> Netlify: POST only (CORS + hide API key)
// Netlify -> 0x v2: GET only
//
// IMPORTANT:
// DustClaimV3 flow is: pull tokens into contract -> approve(spender) -> spender.call(calldata)
// Therefore we must use a quote where the calldata is executable when msg.sender == DustClaimV3
// and where the buyToken (WETH) is delivered to DustClaimV3.
//
// This function intentionally uses 0x v2 standard swap quote:
// GET https://api.0x.org/swap/quote
// with header: 0x-version: v2
//
// It DOES NOT use allowance-holder route, because that route commonly returns tx.to = AllowanceHolder
// which is not compatible with DustClaimV3's "approve then call spender" model.

const ZEROX_BASE = 'https://api.0x.org'

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, x-requested-with',
  'access-control-allow-methods': 'POST, OPTIONS'
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      ...CORS_HEADERS,
      ...extraHeaders
    },
    body: JSON.stringify(body)
  }
}

function safeAddr(x) {
  if (!x) return x
  const s = String(x)
  if (s.length < 12) return s
  return `${s.slice(0, 6)}…${s.slice(-4)}`
}

function isHexAddress(a) {
  return typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a)
}
function isNonZeroAddress(a) {
  return (
    isHexAddress(a) &&
    a.toLowerCase() !== '0x0000000000000000000000000000000000000000'
  )
}
function normAddr(a) {
  return typeof a === 'string' ? a.toLowerCase() : ''
}

// ---------- tiny in-memory cache (warm lambda) ----------
const CACHE_TTL_MS = 25_000
const cache = new Map() // key -> { ts, data }

function getCache(key) {
  const v = cache.get(key)
  if (!v) return null
  if (Date.now() - v.ts > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return v.data
}
function setCache(key, data) {
  cache.set(key, { ts: Date.now(), data })
}

// ---------- fetch with timeout + retry ----------
async function fetchWithTimeout(url, opts, timeoutMs = 12_000) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...opts, signal: controller.signal })
  } finally {
    clearTimeout(t)
  }
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
async function fetch0xWithRetry(url, headers, reqId) {
  const maxAttempts = 3

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let resp
    try {
      resp = await fetchWithTimeout(url, { method: 'GET', headers }, 12_000)
    } catch (e) {
      const msg =
        e?.name === 'AbortError' ? 'fetch timeout' : e?.message || String(e)
      console.log(`[0x] fetch error attempt ${attempt}/${maxAttempts}:`, msg, {
        reqId
      })
      if (attempt === maxAttempts) throw e
      await sleep(250 * attempt)
      continue
    }

    if (resp.status === 429 || (resp.status >= 500 && resp.status <= 599)) {
      console.log(
        `[0x] upstream status ${resp.status} attempt ${attempt}/${maxAttempts} (retrying)`,
        { reqId }
      )
      if (attempt === maxAttempts) return resp
      await sleep(300 * attempt)
      continue
    }

    return resp
  }
}

// Extract spender + tx fields robustly for 0x v2 swap quote responses.
function extractV2ExecutableFields(data) {
  const tx = data?.transaction || null

  const txTo = tx?.to || data?.to || null
  const txData = tx?.data || data?.data || null
  const txGas = tx?.gas ?? data?.gas ?? null
  const txValue = tx?.value ?? data?.value ?? null

  // 0x swap quote typically provides allowanceTarget and/or spender.
  // We use spender in this order (most common first).
  const spender =
    data?.spender ||
    data?.allowanceTarget ||
    data?.issues?.allowance?.spender ||
    data?.allowance?.spender ||
    null

  return { spender, txTo, txData, txGas, txValue }
}

exports.handler = async (event) => {
  const started = Date.now()
  const reqId =
    event.headers?.['x-nf-request-id'] ||
    event.headers?.['x-request-id'] ||
    `local-${Math.random().toString(16).slice(2)}`

  console.log('[0x] ---------- NEW REQUEST ----------')
  console.log('[0x] reqId:', reqId)
  console.log('[0x] method:', event.httpMethod)
  console.log('[0x] path:', event.path)
  console.log('[0x] ua:', event.headers?.['user-agent'] || 'n/a')

  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    }

    if (event.httpMethod !== 'POST') {
      console.log('[0x] Rejected: method not allowed')
      return json(405, { error: 'Method not allowed. Use POST' }, { 'x-req-id': reqId })
    }

    const apiKey = process.env.ZEROX_API_KEY || process.env.VITE_0X_API_KEY
    if (!apiKey) {
      console.log('[0x] ERROR: missing ZEROX_API_KEY / VITE_0X_API_KEY in env')
      return json(
        500,
        { error: 'Missing 0x API key in Netlify env vars.' },
        { 'x-req-id': reqId }
      )
    }

    let body = {}
    try {
      body = event.body ? JSON.parse(event.body) : {}
    } catch {
      console.log('[0x] ERROR: invalid JSON body')
      return json(400, { error: 'Invalid JSON body' }, { 'x-req-id': reqId })
    }

    const chainId = Number(body.chainId)
    const sellToken = body.sellToken
    const buyToken = body.buyToken
    const sellAmount = body.sellAmount ?? body.sellAmountWei

    // For DustClaimV3-compatible quoting:
    // takerAddress = DustClaimV3 (contract that executes the call)
    // recipient = DustClaimV3 (must receive WETH)
    const taker = body.taker // your caller uses `taker` already; we map to takerAddress
    const recipient = body.recipient
    const slippageBps = body.slippageBps

    // txOrigin is NOT used by standard /swap/quote, but we accept it for compatibility
    const txOrigin = body.txOrigin

    console.log('[0x] REQUEST PARAMS:', {
      chainId,
      sellToken: safeAddr(sellToken),
      buyToken: safeAddr(buyToken),
      sellAmount: sellAmount ? String(sellAmount) : sellAmount,
      taker: safeAddr(taker),
      recipient: safeAddr(recipient),
      txOrigin: safeAddr(txOrigin),
      route: 'swap/quote',
      version: 'v2'
    })

    if (!Number.isFinite(chainId) || chainId <= 0) {
      return json(400, { error: 'Invalid chainId' }, { 'x-req-id': reqId })
    }

    if (!sellToken || !buyToken || !sellAmount || !taker || !recipient) {
      return json(
        400,
        { error: 'Missing required fields: chainId,sellToken,buyToken,sellAmount,taker,recipient' },
        { 'x-req-id': reqId }
      )
    }

    if (!isNonZeroAddress(sellToken) || !isNonZeroAddress(buyToken)) {
      return json(400, { error: 'Invalid sellToken or buyToken address' }, { 'x-req-id': reqId })
    }
    if (!isNonZeroAddress(taker)) {
      return json(400, { error: 'Invalid taker (DustClaimV3) address' }, { 'x-req-id': reqId })
    }
    if (!isNonZeroAddress(recipient)) {
      return json(400, { error: 'Invalid recipient (DustClaimV3) address' }, { 'x-req-id': reqId })
    }

    const cacheKey = JSON.stringify([
      'v2_swap_quote_norm',
      chainId,
      sellToken.toLowerCase(),
      buyToken.toLowerCase(),
      String(sellAmount),
      taker.toLowerCase(),
      recipient.toLowerCase(),
      String(slippageBps ?? 100)
    ])

    const cached = getCache(cacheKey)
    if (cached) {
      console.log('[0x] cache hit', { reqId })
      return json(200, cached, { 'x-req-id': reqId, 'x-cache': 'HIT' })
    }

    // 0x v2 standard quote
    const upstream = new URL(`${ZEROX_BASE}/swap/quote`)

    const params = new URLSearchParams({
      chainId: String(chainId),
      sellToken,
      buyToken,
      sellAmount: String(sellAmount),

      // v2 expects takerAddress for standard swap quote.
      // We map your existing `taker` field to takerAddress.
      takerAddress: taker,

      // Must receive WETH in DustClaimV3 for WETH balance delta check.
      recipient
    })

    // slippageBps is supported in v2; default 100 if not passed.
    if (slippageBps !== undefined && slippageBps !== null) {
      params.set('slippageBps', String(slippageBps))
    }

    upstream.search = params.toString()

    console.log('[0x] Calling URL (GET):', upstream.toString())

    const resp = await fetch0xWithRetry(
      upstream.toString(),
      {
        '0x-api-key': apiKey,
        '0x-version': 'v2',
        accept: 'application/json'
      },
      reqId
    )

    const elapsed = Date.now() - started
    console.log('[0x] 0x response status:', resp.status, resp.statusText, 'elapsed(ms):', elapsed)

    const text = await resp.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }

    const { spender, txTo, txData, txGas, txValue } = extractV2ExecutableFields(data)

    const summary = {
      ok: resp.ok,
      status: resp.status,
      spender: safeAddr(spender),
      tx_to: safeAddr(txTo),
      tx_data_len: txData ? String(txData.length) : '0',
      gas: txGas ?? null,
      buyAmount: data?.buyAmount ?? null,
      sellAmount: data?.sellAmount ?? null,
      message: data?.message ?? null,
      reason: data?.reason ?? null,
      code: data?.code ?? null
    }
    console.log('[0x] Response summary:', summary)

    if (!resp.ok) {
      console.log('[0x] 0x ERROR body (capped 12k):', (text || '').slice(0, 12000))
      return json(resp.status, { error: '0x error', status: resp.status, data }, { 'x-req-id': reqId })
    }

    // Reject “200 but missing executable tx”
    if (
      !isNonZeroAddress(spender) ||
      !isNonZeroAddress(txTo) ||
      typeof txData !== 'string' ||
      txData.length < 10
    ) {
      const reason = data?.message || data?.reason || 'No executable route returned by 0x'
      console.log('[0x] VALIDATION FAILED:', 'NO_EXECUTABLE_ROUTE', {
        spender: safeAddr(spender),
        txTo: safeAddr(txTo),
        dataLen: txData ? txData.length : 0,
        reqId
      })

      return json(
        422,
        {
          error: 'NO_EXECUTABLE_ROUTE',
          message: reason,
          details: { spender, txTo, dataLen: txData ? txData.length : 0 },
          data
        },
        { 'x-req-id': reqId }
      )
    }

    // Strict DustClaimV3 compatibility:
    // DustClaimV3 approves `spender` then calls `spender` with txData,
    // so spender MUST equal transaction.to.
    if (normAddr(spender) !== normAddr(txTo)) {
      const reason = 'DustClaimV3 incompatible route: spender != transaction.to'
      console.log('[0x] VALIDATION FAILED:', 'INCOMPATIBLE_ROUTE', {
        spender: safeAddr(spender),
        txTo: safeAddr(txTo),
        reqId
      })

      return json(
        422,
        { error: 'INCOMPATIBLE_ROUTE', message: reason, details: { spender, txTo }, data },
        { 'x-req-id': reqId }
      )
    }

    // Normalized response for claimExecutor (single consistent shape)
    const normalized = {
      chainId,
      sellToken,
      buyToken,
      sellAmount: data?.sellAmount ?? String(sellAmount),
      buyAmount: data?.buyAmount ?? null,
      spender,
      transaction: {
        to: txTo,
        data: txData,
        gas: txGas ?? null,
        value: txValue ?? null
      },
      raw: data
    }

    setCache(cacheKey, normalized)
    return json(200, normalized, { 'x-req-id': reqId, 'x-cache': 'MISS' })
  } catch (e) {
    console.log('[0x] FUNCTION ERROR:', e?.message || e)
    return json(500, { error: e?.message || 'Function error' }, { 'x-req-id': reqId })
  } finally {
    console.log('[0x] ---------- END REQUEST ----------')
  }
}