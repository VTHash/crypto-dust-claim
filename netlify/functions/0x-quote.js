// netlify/functions/0x-quote.js
// 0x Swap API v2 proxy for DustClaimV3
// - avoids CORS
// - keeps API key off the browser
// - logs request + response (safe summaries) for debugging
// - supports POST (app) + optional GET (manual debug in browser)

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

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
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

function pick(obj, keys) {
  const out = {};
  for (const k of keys) out[k] = obj?.[k];
  return out;
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
      console.log("[0x] OPTIONS preflight OK");
      return {
        statusCode: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "content-type",
          "access-control-allow-methods": "POST, GET, OPTIONS",
        },
        body: "",
      };
    }

    const apiKey = process.env.ZEROX_API_KEY || process.env.VITE_0X_API_KEY;
    if (!apiKey) {
      console.log("[0x] ERROR: missing ZEROX_API_KEY / VITE_0X_API_KEY in env");
      return json(500, { error: "Missing 0x API key in Netlify env vars." }, { "x-req-id": reqId });
    }

    // ---- Input parsing: POST body OR GET query (debug) ----
    let body = {};
    if (event.httpMethod === "POST") {
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch (e) {
        console.log("[0x] ERROR: invalid JSON body");
        return json(400, { error: "Invalid JSON body" }, { "x-req-id": reqId });
      }
    } else if (event.httpMethod === "GET") {
      // Optional debug mode: /0x-quote?chainId=1&sellToken=...&buyToken=...&sellAmount=...&taker=...&txOrigin=...&recipient=...&slippageBps=100
      body = event.queryStringParameters || {};
    } else {
      console.log("[0x] Rejected: method not allowed");
      return json(405, { error: "Method not allowed. Use POST (or GET for debug)." }, { "x-req-id": reqId });
    }

    const {
      chainId,
      sellToken,
      buyToken,
      sellAmount, // wei string
      taker, // DustClaimV3 address (contract)
      txOrigin, // user EOA (required if taker is contract)
      recipient, // DustClaimV3 address (contract receives WETH)
      slippageBps, // integer (e.g. 100 = 1%)
    } = body;

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

    const cid = Number(chainId);
    const host = ZEROX_HOST_BY_CHAIN[cid];
    if (!host) {
      console.log("[0x] ERROR: unsupported chainId:", chainId);
      return json(400, { error: `0x unsupported chainId: ${chainId}` }, { "x-req-id": reqId });
    }

    // Basic validation
    if (!sellToken || !buyToken || !sellAmount || !taker || !recipient) {
      console.log("[0x] ERROR: missing required fields");
      return json(
        400,
        { error: "Missing required fields: chainId,sellToken,buyToken,sellAmount,taker,recipient" },
        { "x-req-id": reqId }
      );
    }
    if (!txOrigin) {
      console.log("[0x] ERROR: missing txOrigin (required when taker is contract)");
      return json(
        400,
        { error: "Missing txOrigin (user EOA). Required when taker is a contract." },
        { "x-req-id": reqId }
      );
    }

    // v2 uses slippageBps
    const bps = Number.isFinite(Number(slippageBps))
      ? String(Math.trunc(Number(slippageBps)))
      : "100";

    // ✅ IMPORTANT: include chainId in query (per v2 docs/examples)
    // even if you select host by chain. 
    const url = new URL(`${host}/swap/allowance-holder/quote`);
    url.searchParams.set("chainId", String(cid));
    url.searchParams.set("sellToken", sellToken);
    url.searchParams.set("buyToken", buyToken);
    url.searchParams.set("sellAmount", String(sellAmount));
    url.searchParams.set("taker", taker);
    url.searchParams.set("recipient", recipient);
    url.searchParams.set("slippageBps", bps);
    url.searchParams.set("txOrigin", txOrigin);

    console.log("[0x] Calling URL:", url.toString());

    const resp = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "0x-api-key": apiKey, // do NOT log this
        "0x-version": "v2",
      },
    });

    const elapsed = Date.now() - started;
    console.log("[0x] 0x response status:", resp.status, resp.statusText, "elapsed(ms):", elapsed);

    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    // Safe summary (helps debug why buildClaimPlan becomes [])
    const summary = {
      ok: resp.ok,
      status: resp.status,

      // v2 response often includes these (per docs example response) 
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

    // If you need the full JSON for ONE request, log a capped version:
    console.log("[0x] Full JSON (capped 12k):", (text || "").slice(0, 12000));

    if (!resp.ok) {
      console.log("[0x] 0x ERROR body (capped 12k):", (text || "").slice(0, 12000));
      return json(resp.status, { error: "0x error", status: resp.status, data }, { "x-req-id": reqId });
    }

    return json(200, data, { "x-req-id": reqId });
  } catch (e) {
    console.log("[0x] FUNCTION ERROR:", e?.message || e);
    return json(500, { error: e?.message || "Function error" }, { "x-req-id": reqId });
  } finally {
    console.log("[0x] ---------- END REQUEST ----------");
  }
};
