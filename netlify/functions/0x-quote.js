// netlify/functions/0x-quote.js
// Browser -> Netlify: POST only (CORS + hide API key)
// Netlify -> 0x: GET only
//
// UPDATED FOR 0x API v2 (Swap API v2)
// Uses: /swap/allowance-holder/quote
//
// IMPORTANT FOR DUSTCLAIM V3 FLOW:
// - User approves DustClaimV3.
// - DustClaimV3 pulls tokens from user, approves the 0x spender (AllowanceHolder), then does spender.call(calldata).
// - Therefore the quote MUST be compatible with: spender === transaction.to
// - For contract takers, 0x v2 requires txOrigin (the user EOA) in addition to taker (DustClaimV3).

const ZEROX_HOST_BY_CHAIN = {
  1: "https://api.0x.org",
  10: "https://optimism.api.0x.org",
  56: "https://bsc.api.0x.org",
  130: "https://unichain.api.0x.org",
  137: "https://polygon.api.0x.org",
  143: "https://monad.api.0x.org",
  146: "https://sonic.api.0x.org",
  480: "https://worldchain.api.0x.org",
  5000: "https://mantle.api.0x.org",
  9745: "https://plasma.api.0x.org",
  42161: "https://arbitrum.api.0x.org",
  43114: "https://avalanche.api.0x.org",
  534352: "https://scroll.api.0x.org",
  59144: "https://linea.api.0x.org",
  80094: "https://berachain.api.0x.org",
  81457: "https://blast.api.0x.org",
  34443: "https://mode.api.0x.org",
  8453: "https://base.api.0x.org",
  57073: "https://ink.api.0x.org",
};

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
  return (
    isHexAddress(a) &&
    a.toLowerCase() !== "0x0000000000000000000000000000000000000000"
  );
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
      const msg =
        e?.name === "AbortError" ? "fetch timeout" : e?.message || String(e);
      console.log(
        `[0x] fetch error attempt ${attempt}/${maxAttempts}:`,
        msg,
        { reqId }
      );
      if (attempt === maxAttempts) throw e;
      await sleep(250 * attempt);
      continue;
    }

    if (resp.status === 429 || (resp.status >= 500 && resp.status <= 599)) {
      console.log(
        `[0x] upstream status ${resp.status} attempt ${attempt}/${maxAttempts} (retrying)`,
        { reqId }
      );
      if (attempt === maxAttempts) return resp;
      await sleep(300 * attempt);
      continue;
    }

    return resp;
  }
}

// Slippage for v2: slippageBps (basis points)
function normalizeSlippageBps(slippageBps) {
  const n = Number(slippageBps);
  if (!Number.isFinite(n) || n < 0) return "100"; // default 1%
  const clamped = Math.max(0, Math.min(5000, Math.trunc(n))); // 0% .. 50%
  return String(clamped);
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

    // For DustClaimV3 compatibility:
    // - taker should be DustClaimV3 (the contract that will be the taker)
    // - txOrigin should be the user EOA (wallet address initiating the tx)
    // - recipient should be DustClaimV3 (receive output into contract so it can unwrap/send back)
    const taker = body.taker;       // DustClaimV3
    const recipient = body.recipient; // DustClaimV3
    const txOrigin = body.txOrigin; // USER EOA (REQUIRED when taker is contract)
    const slippageBps = body.slippageBps;

    console.log("[0x] REQUEST PARAMS:", {
      chainId,
      sellToken: safeAddr(sellToken),
      buyToken: safeAddr(buyToken),
      sellAmount: sellAmount ? String(sellAmount) : sellAmount,
      taker: safeAddr(taker),
      recipient: safeAddr(recipient),
      txOrigin: safeAddr(txOrigin),
      slippageBps,
      route: "swap/allowance-holder/quote",
      version: "v2",
    });

    if (!Number.isFinite(chainId) || chainId <= 0) {
      return json(400, { error: "Invalid chainId" }, { "x-req-id": reqId });
    }

    const host = ZEROX_HOST_BY_CHAIN[chainId];
    if (!host) {
      console.log("[0x] ERROR: unsupported chainId:", chainId);
      return json(400, { error: `0x unsupported chainId: ${chainId}` }, { "x-req-id": reqId });
    }

    if (!sellToken || !buyToken || !sellAmount || !taker || !recipient || !txOrigin) {
      console.log("[0x] ERROR: missing required fields");
      return json(
        400,
        { error: "Missing required fields: chainId,sellToken,buyToken,sellAmount,taker,recipient,txOrigin" },
        { "x-req-id": reqId }
      );
    }

    if (!isNonZeroAddress(sellToken) || !isNonZeroAddress(buyToken)) {
      return json(400, { error: "Invalid sellToken or buyToken address" }, { "x-req-id": reqId });
    }
    if (!isNonZeroAddress(taker) || !isNonZeroAddress(recipient) || !isNonZeroAddress(txOrigin)) {
      return json(400, { error: "Invalid taker/recipient/txOrigin address" }, { "x-req-id": reqId });
    }

    const slippageBpsNorm = normalizeSlippageBps(slippageBps);

    const cacheKey = JSON.stringify([
      chainId,
      sellToken.toLowerCase(),
      buyToken.toLowerCase(),
      String(sellAmount),
      taker.toLowerCase(),
      recipient.toLowerCase(),
      txOrigin.toLowerCase(),
      slippageBpsNorm,
      "swap_allowance_holder_quote_v2",
    ]);

    const cached = getCache(cacheKey);
    if (cached) {
      console.log("[0x] cache hit", { reqId });
      return json(200, cached, { "x-req-id": reqId, "x-cache": "HIT" });
    }

    // 0x v2 Allowance Holder Quote:
    // GET {host}/swap/allowance-holder/quote?buyToken&sellToken&sellAmount&taker&txOrigin&recipient&slippageBps
    const upstream = new URL(`${host}/swap/allowance-holder/quote`);
    upstream.search = new URLSearchParams({
      sellToken,
      buyToken,
      sellAmount: String(sellAmount),
      taker: taker,
      txOrigin: txOrigin,
      recipient: recipient,
      slippageBps: slippageBpsNorm,
    }).toString();

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

    // v2 typical fields: { transaction: { to, data, value, gas, ... }, issues: { allowance: { spender } }, ... }
    const txTo = data?.transaction?.to;
    const txData = data?.transaction?.data;
    const spender =
      data?.issues?.allowance?.spender ||
      data?.allowanceTarget || // defensive (some payloads may still include)
      data?.allowance?.spender ||
      null;

    const summary = {
      ok: resp.ok,
      status: resp.status,
      tx_to: safeAddr(txTo),
      tx_data_len: typeof txData === "string" ? String(txData.length) : "0",
      spender: safeAddr(spender),
      gas: data?.transaction?.gas ?? null,
      buyAmount: data?.buyAmount ?? null,
      sellAmount: data?.sellAmount ?? null,
      code: data?.code ?? null,
      reason: data?.reason ?? null,
      message: data?.message ?? null,
    };

    console.log("[0x] Response summary:", summary);

    if (!resp.ok) {
      console.log("[0x] 0x ERROR body (capped 12k):", (text || "").slice(0, 12000));
      return json(resp.status, { error: "0x error", status: resp.status, data }, { "x-req-id": reqId });
    }

    // Strict DustClaimV3 compatibility checks:
    // - DustClaimV3 will call spender.call(calldata)
    // - So spender MUST exist and MUST equal transaction.to
    if (!isNonZeroAddress(txTo) || typeof txData !== "string" || txData.length < 10) {
      const reason = "Quote missing transaction.to / transaction.data";
      console.log("[0x] VALIDATION FAILED:", reason, { txTo: safeAddr(txTo), reqId });
      return json(
        422,
        { error: reason, details: { txTo, dataLen: txData ? txData.length : 0 }, data },
        { "x-req-id": reqId }
      );
    }

    if (!isNonZeroAddress(spender)) {
      const reason = "Quote missing allowance spender";
      console.log("[0x] VALIDATION FAILED:", reason, { reqId });
      return json(
        422,
        { error: reason, details: { spender }, data },
        { "x-req-id": reqId }
      );
    }

    if (normAddr(spender) !== normAddr(txTo)) {
      const reason = "DustClaimV3 incompatible route: spender != transaction.to";
      console.log("[0x] VALIDATION FAILED:", reason, {
        spender: safeAddr(spender),
        txTo: safeAddr(txTo),
        reqId,
      });
      return json(
        422,
        { error: reason, details: { spender, txTo }, data },
        { "x-req-id": reqId }
      );
    }

    setCache(cacheKey, data);
    return json(200, data, { "x-req-id": reqId, "x-cache": "MISS" });
  } catch (e) {
    console.log("[0x] FUNCTION ERROR:", e?.message || e);
    return json(500, { error: e?.message || "Function error" }, { "x-req-id": reqId });
  } finally {
    console.log("[0x] ---------- END REQUEST ----------");
  }
};
