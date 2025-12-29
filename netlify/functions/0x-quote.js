// netlify/functions/0x-quote.js
// Browser -> Netlify: POST only (CORS + hide API key)
// Netlify -> 0x v2: GET only
//
// 0x API v2 (Allowance Holder) requires:
// - endpoint: https://api.0x.org/swap/allowance-holder/quote
// - headers: 0x-api-key + 0x-version: v2
// - REQUIRED query params: chainId, sellToken, buyToken, sellAmount, taker
// - optional: txOrigin (only if taker is a smart contract), recipient, slippageBps
//
// DUSTCLAIM V3 COMPATIBILITY:
// DustClaimV3 does: pull tokens -> approve(spender) -> spender.call(calldata)
// For Allowance Holder quotes:
// - spender MUST equal transaction.to
// - transaction.data must be present
// - Some tokens return 200 but without executable tx fields; treat as NO_EXECUTABLE_ROUTE and return 422.

const ZEROX_BASE = "https://api.0x.org";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-requested-with",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function safeAddr(x) {
  if (!x) return x;
  const s = String(x);
  if (s.length < 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function isHexAddress(a) {
  return typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a);
}
function isNonZeroAddress(a) {
  return isHexAddress(a) && a.toLowerCase() !== "0x0000000000000000000000000000000000000000";
}
function normAddr(a) {
  return typeof a === "string" ? a.toLowerCase() : "";
}

// ---------- tiny in-memory cache (warm lambda) ----------
const CACHE_TTL_MS = 25_000;
const cache = new Map(); // key -> { ts, data }

function getCache(key) {
  const v = cache.get(key);
  if (!v) return null;
  if (Date.now() - v.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return v.data;
}
function setCache(key, data) {
  cache.set(key, { ts: Date.now(), data });
}

// ---------- fetch with timeout + retry ----------
async function fetchWithTimeout(url, opts, timeoutMs = 12_000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function fetch0xWithRetry(url, headers, reqId) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let resp;
    try {
      resp = await fetchWithTimeout(url, { method: "GET", headers }, 12_000);
    } catch (e) {
      const msg = e?.name === "AbortError" ? "fetch timeout" : (e?.message || String(e));
      console.log(`[0x] fetch error attempt ${attempt}/${maxAttempts}:`, msg, { reqId });
      if (attempt === maxAttempts) throw e;
      await sleep(250 * attempt);
      continue;
    }

    if (resp.status === 429 || (resp.status >= 500 && resp.status <= 599)) {
      console.log(`[0x] upstream status ${resp.status} attempt ${attempt}/${maxAttempts} (retrying)`, { reqId });
      if (attempt === maxAttempts) return resp;
      await sleep(300 * attempt);
      continue;
    }

    return resp;
  }
}

// Extract spender + tx fields robustly for 0x v2 allowance-holder responses.
function extractV2ExecutableFields(data) {
  const tx = data?.transaction || null;

  const txTo = tx?.to || data?.to || null;
  const txData = tx?.data || data?.data || null;
  const txGas = tx?.gas ?? data?.gas ?? null;
  const txValue = tx?.value ?? data?.value ?? null;

  // v2 allowance-holder spender typically at issues.allowance.spender
  // some responses also include allowanceTarget
  const spender =
    data?.issues?.allowance?.spender ||
    data?.allowance?.spender ||
    data?.allowanceTarget ||
    null;

  return { spender, txTo, txData, txGas, txValue };
}

exports.handler = async (event) => {
  const started = Date.now();
  const reqId =
    event.headers?.["x-nf-request-id"] ||
    event.headers?.["x-request-id"] ||
    `local-${Math.random().toString(16).slice(2)}`;

  console.log("[0x] ---------- NEW REQUEST ----------");
  console.log("[0x] reqId:", reqId);
  console.log("[0x] method:", event.httpMethod);
  console.log("[0x] path:", event.path);
  console.log("[0x] ua:", event.headers?.["user-agent"] || "n/a");

  try {
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: CORS_HEADERS, body: "" };
    }

    if (event.httpMethod !== "POST") {
      console.log("[0x] Rejected: method not allowed");
      return json(405, { error: "Method not allowed. Use POST" }, { "x-req-id": reqId });
    }

    const apiKey = process.env.ZEROX_API_KEY || process.env.VITE_0X_API_KEY;
    if (!apiKey) {
      console.log("[0x] ERROR: missing ZEROX_API_KEY / VITE_0X_API_KEY in env");
      return json(500, { error: "Missing 0x API key in Netlify env vars." }, { "x-req-id": reqId });
    }

    let body = {};
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      console.log("[0x] ERROR: invalid JSON body");
      return json(400, { error: "Invalid JSON body" }, { "x-req-id": reqId });
    }

    const chainId = Number(body.chainId);
    const sellToken = body.sellToken;
    const buyToken = body.buyToken;
    const sellAmount = body.sellAmount ?? body.sellAmountWei;

    // Allowance-holder v2:
    // taker = the address that will be the caller at execution (DustClaimV3)
    // txOrigin = the EOA originator (user) when taker is a contract
    const taker = body.taker;
    const txOrigin = body.txOrigin;
    const recipient = body.recipient;
    const slippageBps = body.slippageBps;

    console.log("[0x] REQUEST PARAMS:", {
      chainId,
      sellToken: safeAddr(sellToken),
      buyToken: safeAddr(buyToken),
      sellAmount: sellAmount ? String(sellAmount) : sellAmount,
      taker: safeAddr(taker),
      txOrigin: safeAddr(txOrigin),
      recipient: safeAddr(recipient),
      slippageBps,
      route: "swap/allowance-holder/quote",
      version: "v2",
    });

    if (!Number.isFinite(chainId) || chainId <= 0) {
      return json(400, { error: "Invalid chainId" }, { "x-req-id": reqId });
    }

    if (!sellToken || !buyToken || !sellAmount || !taker) {
      console.log("[0x] ERROR: missing required fields");
      return json(
        400,
        { error: "Missing required fields: chainId,sellToken,buyToken,sellAmount,taker" },
        { "x-req-id": reqId }
      );
    }

    if (!isNonZeroAddress(sellToken) || !isNonZeroAddress(buyToken)) {
      return json(400, { error: "Invalid sellToken or buyToken address" }, { "x-req-id": reqId });
    }
    if (!isNonZeroAddress(taker)) {
      return json(400, { error: "Invalid taker address" }, { "x-req-id": reqId });
    }
    if (txOrigin && !isNonZeroAddress(txOrigin)) {
      return json(400, { error: "Invalid txOrigin address" }, { "x-req-id": reqId });
    }
    if (recipient && !isNonZeroAddress(recipient)) {
      return json(400, { error: "Invalid recipient address" }, { "x-req-id": reqId });
    }

    const cacheKey = JSON.stringify([
      "v2_allowance_holder_quote_norm",
      chainId,
      sellToken.toLowerCase(),
      buyToken.toLowerCase(),
      String(sellAmount),
      taker.toLowerCase(),
      (txOrigin || "").toLowerCase(),
      (recipient || "").toLowerCase(),
      String(slippageBps ?? 100),
    ]);

    const cached = getCache(cacheKey);
    if (cached) {
      console.log("[0x] cache hit", { reqId });
      return json(200, cached, { "x-req-id": reqId, "x-cache": "HIT" });
    }

    const upstream = new URL(`${ZEROX_BASE}/swap/allowance-holder/quote`);

    const params = new URLSearchParams({
      chainId: String(chainId),
      sellToken,
      buyToken,
      sellAmount: String(sellAmount),
      taker,
    });

    if (txOrigin) params.set("txOrigin", txOrigin);
    if (recipient) params.set("recipient", recipient);
    if (slippageBps !== undefined && slippageBps !== null) params.set("slippageBps", String(slippageBps));

    upstream.search = params.toString();

    console.log("[0x] Calling URL (GET):", upstream.toString());

    const resp = await fetch0xWithRetry(
      upstream.toString(),
      {
        "0x-api-key": apiKey,
        "0x-version": "v2",
        accept: "application/json",
      },
      reqId
    );

    const elapsed = Date.now() - started;
    console.log("[0x] 0x response status:", resp.status, resp.statusText, "elapsed(ms):", elapsed);

    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    const { spender, txTo, txData, txGas, txValue } = extractV2ExecutableFields(data);

    const summary = {
      ok: resp.ok,
      status: resp.status,
      spender: safeAddr(spender),
      tx_to: safeAddr(txTo),
      tx_data_len: txData ? String(txData.length) : "0",
      gas: txGas ?? null,
      buyAmount: data?.buyAmount ?? null,
      sellAmount: data?.sellAmount ?? null,
      message: data?.message ?? null,
      reason: data?.reason ?? null,
      code: data?.code ?? null,
    };
    console.log("[0x] Response summary:", summary);

    if (!resp.ok) {
      console.log("[0x] 0x ERROR body (capped 12k):", (text || "").slice(0, 12000));
      return json(resp.status, { error: "0x error", status: resp.status, data }, { "x-req-id": reqId });
    }

    // Treat "200 but missing executable tx" as NO_EXECUTABLE_ROUTE (common edge case)
    if (!isNonZeroAddress(spender) || !isNonZeroAddress(txTo) || typeof txData !== "string" || txData.length < 10) {
      const reason = data?.message || data?.reason || "No executable route returned by 0x";
      console.log("[0x] VALIDATION FAILED:", "NO_EXECUTABLE_ROUTE", {
        spender: safeAddr(spender),
        txTo: safeAddr(txTo),
        dataLen: txData ? txData.length : 0,
        reqId,
      });

      return json(
        422,
        {
          error: "NO_EXECUTABLE_ROUTE",
          message: reason,
          details: { spender, txTo, dataLen: txData ? txData.length : 0 },
          data,
        },
        { "x-req-id": reqId }
      );
    }

    // Strict DustClaimV3 compatibility:
    // DustClaimV3 approves `spender` then calls `spender` with `txData`,
    // so spender MUST equal txTo.
    if (normAddr(spender) !== normAddr(txTo)) {
      const reason = "DustClaimV3 incompatible route: spender != transaction.to";
      console.log("[0x] VALIDATION FAILED:", "INCOMPATIBLE_ROUTE", {
        spender: safeAddr(spender),
        txTo: safeAddr(txTo),
        reqId,
      });

      return json(
        422,
        { error: "INCOMPATIBLE_ROUTE", message: reason, details: { spender, txTo }, data },
        { "x-req-id": reqId }
      );
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
        value: txValue ?? null,
      },
      // Keep raw for debugging (optional). If you want smaller payloads, remove this.
      raw: data,
    };

    setCache(cacheKey, normalized);
    return json(200, normalized, { "x-req-id": reqId, "x-cache": "MISS" });
  } catch (e) {
    console.log("[0x] FUNCTION ERROR:", e?.message || e);
    return json(500, { error: e?.message || "Function error" }, { "x-req-id": reqId });
  } finally {
    console.log("[0x] ---------- END REQUEST ----------");
  }
};