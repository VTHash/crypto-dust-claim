import { getStore } from "@netlify/blobs";

const STORE_NAME = "dustclaim-global-stats";
const KEY = "global";

// Read credentials from environment (Netlify UI → Environment variables)
const siteID = process.env.NETLIFY_SITE_ID;

// Try several common names for the token so you’re covered:
const token =
  process.env.NETLIFY_BLOBS_TOKEN ||
  process.env.NETLIFY_API_TOKEN ||
  process.env.NETLIFY_AUTH_TOKEN;

if (!siteID || !token) {
  console.warn(
    "Netlify Blobs: NETLIFY_SITE_ID or token (NETLIFY_BLOBS_TOKEN / NETLIFY_API_TOKEN / NETLIFY_AUTH_TOKEN) is missing."
  );
}

// ✅ This is the **correct** signature per Netlify examples:
// getStore(storeName, { siteID, token })
const store = getStore(STORE_NAME, { siteID, token });

/**
 * Safely read stats from Blobs.
 * We store JSON as a plain string and parse it ourselves to avoid any magic.
 */
export async function readStats() {
  try {
    const raw = await store.get(KEY); // no "type: 'json'" – we parse manually

    if (!raw) {
      // First-time use, nothing stored yet
      return {
        totalViews: 0,
        totalScans: 0,
        perChainScans: {},
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("readStats: blob is not valid JSON, resetting.", err);
      return {
        totalViews: 0,
        totalScans: 0,
        perChainScans: {},
      };
    }

    return {
      totalViews: Number(parsed.totalViews || 0),
      totalScans: Number(parsed.totalScans || 0),
      perChainScans:
        parsed.perChainScans && typeof parsed.perChainScans === "object"
          ? parsed.perChainScans
          : {},
    };
  } catch (err) {
    console.error("readStats error:", err);
    return {
      totalViews: 0,
      totalScans: 0,
      perChainScans: {},
    };
  }
}

/**
 * Safely write stats back to Blobs as a JSON string.
 */
export async function writeStats(stats) {
  const safe = {
    totalViews: Number(stats.totalViews || 0),
    totalScans: Number(stats.totalScans || 0),
    perChainScans:
      stats.perChainScans && typeof stats.perChainScans === "object"
        ? stats.perChainScans
        : {},
  };

  try {
    await store.set(KEY, JSON.stringify(safe));
  } catch (err) {
    console.error("writeStats error:", err);
  }
}