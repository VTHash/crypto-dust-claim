// netlify/functions/0x-quote.js
// POST-only 0x Swap API v2 proxy for DustClaimV3
// - avoids CORS
// - keeps API key off the browser
// - adds cache + retry + timeout for production stability

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

// ---------- tiny in-memory cache (warm lambda) ----------
const CACHE_TTL_MS = 25_000; // reduces burst rate limiting during scans
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
      console.log(`[0x] fetch error attempt ${attempt}/${maxAttempts}:`, msg);
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
    // CORS preflight
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: CORS_HEADERS, body: "" };
    }

    // POST only
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
    const sellAmount = body.sellAmount ?? body.sellAmountWei; // defensive
    const taker = body.taker;
    const txOrigin = body.txOrigin;
    const recipient = body.recipient;
    const slippageBps = body.slippageBps;

    console.log("[0x] REQUEST PARAMS:", {
      chainId,
      sellToken: safeAddr(sellToken),
      buyToken: safeAddr(buyToken),
      sellAmount,
      taker: safeAddr(taker),
      txOrigin: safeAddr(txOrigin),
      recipient: safeAddr(recipient),
      slippageBps,
    });

    const host = ZEROX_HOST_BY_CHAIN[chainId];
    if (!host) {
      console.log("[0x] ERROR: unsupported chainId:", chainId);
      return json(400, { error: `0x unsupported chainId: ${chainId}` }, { "x-req-id": reqId });
    }

    if (!sellToken || !buyToken || !sellAmount || !taker || !recipient) {
      console.log("[0x] ERROR: missing required fields");
      return json(
        400,
        { error: "Missing required fields: chainId,sellToken,buyToken,sellAmount,taker,recipient" },
        { "x-req-id": reqId }
      );
    }

    if (!txOrigin) {
      console.log("[0x] ERROR: missing txOrigin");
      return json(
        400,
        { error: "Missing txOrigin (user EOA). Required when taker is a contract." },
        { "x-req-id": reqId }
      );
    }

    const bps = Number.isFinite(Number(slippageBps))
      ? String(Math.trunc(Number(slippageBps)))
      : "100";

    const url = new URL(`${host}/swap/allowance-holder/quote`);
    url.searchParams.set("chainId", String(chainId));
    url.searchParams.set("sellToken", sellToken);
    url.searchParams.set("buyToken", buyToken);
    url.searchParams.set("sellAmount", String(sellAmount));
    url.searchParams.set("taker", taker);
    url.searchParams.set("recipient", recipient);
    url.searchParams.set("slippageBps", bps);
    url.searchParams.set("txOrigin", txOrigin);

    const cacheKey = url.toString();
    const cached = getCache(cacheKey);
    if (cached) {
      console.log("[0x] cache hit", { reqId });
      return json(200, cached, { "x-req-id": reqId, "x-cache": "HIT" });
    }

    console.log("[0x] Calling URL:", url.toString());

    const resp = await fetch0xWithRetry(
      url.toString(),
      { "0x-api-key": apiKey, "0x-version": "v2" },
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

    const summary = {
      ok: resp.ok,
      status: resp.status,
      allowanceTarget: safeAddr(data?.allowanceTarget),
      issues_allowance_spender: safeAddr(data?.issues?.allowance?.spender),
      hasTransaction: !!data?.transaction,
      tx_to: safeAddr(data?.transaction?.to),
      tx_data_len: data?.transaction?.data ? String(data.transaction.data.length) : "0",
      tx_value: data?.transaction?.value ?? null,
      buyAmount: data?.buyAmount ?? null,
      sellAmount: data?.sellAmount ?? null,
      liquidityAvailable: data?.liquidityAvailable ?? null,
      issuesKeys: data?.issues ? Object.keys(data.issues) : [],
      validationErrors: data?.validationErrors ?? null,
      code: data?.code ?? null,
      reason: data?.reason ?? null,
      message: data?.message ?? null,
    };

    console.log("[0x] Response summary:", summary);

    if (!resp.ok) {
      console.log("[0x] 0x ERROR body (capped 12k):", (text || "").slice(0, 12000));
      return json(resp.status, { error: "0x error", status: resp.status, data }, { "x-req-id": reqId });
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