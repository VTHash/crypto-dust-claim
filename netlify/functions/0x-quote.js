// netlify/functions/0x-quote.js
// 0x Swap API v2 proxy for DustClaimV3
// - avoids CORS
// - keeps API key off the browser
// - normalizes request params

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

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "content-type",
          "access-control-allow-methods": "POST, OPTIONS",
        },
        body: "",
      };
    }

    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed. Use POST." });
    }

    const apiKey = process.env.ZEROX_API_KEY || process.env.VITE_0X_API_KEY;
    if (!apiKey) {
      return json(500, { error: "Missing 0x API key in Netlify env vars." });
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const {
      chainId,
      sellToken,
      buyToken,
      sellAmount, // wei string
      taker, // DustClaimV3 address (contract)
      txOrigin, // user EOA (required if taker is contract)
      recipient, // DustClaimV3 address (contract receives WETH)
      slippageBps // integer (e.g. 100 = 1%)
    } = body;

    const cid = Number(chainId);
    const host = ZEROX_HOST_BY_CHAIN[cid];
    if (!host) return json(400, { error: `0x unsupported chainId: ${chainId}` });

    // Basic validation
    if (!sellToken || !buyToken || !sellAmount || !taker || !recipient) {
      return json(400, { error: "Missing required fields: sellToken,buyToken,sellAmount,taker,recipient" });
    }
    if (!txOrigin) {
      return json(400, { error: "Missing txOrigin (user EOA). Required when taker is a contract." });
    }

    const url = new URL(`${host}/swap/allowance-holder/quote`);
    url.searchParams.set("sellToken", sellToken);
    url.searchParams.set("buyToken", buyToken);
    url.searchParams.set("sellAmount", String(sellAmount));
    url.searchParams.set("taker", taker);
    url.searchParams.set("recipient", recipient);

    // v2 uses slippageBps (not slippagePercentage)
    const bps = Number.isFinite(Number(slippageBps)) ? String(Math.trunc(Number(slippageBps))) : "100";
    url.searchParams.set("slippageBps", bps);

    // required when taker is contract
    url.searchParams.set("txOrigin", txOrigin);

    const resp = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "0x-api-key": apiKey,
        "0x-version": "v2",
      },
    });

    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!resp.ok) {
      return json(resp.status, {
        error: "0x error",
        status: resp.status,
        data,
      });
    }

    return json(200, data);
  } catch (e) {
    return json(500, { error: e?.message || "Function error" });
  }
};