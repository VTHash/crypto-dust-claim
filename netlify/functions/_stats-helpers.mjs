import { getStore } from "@netlify/blobs";

const STORE_NAME = "dustclaim-global-stats";
const KEY = "global";

// Always create the store with explicit siteID + token
function getStatsStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;

  if (!siteID || !token) {
    console.warn(
      "Netlify Blobs: NETLIFY_SITE_ID or NETLIFY_BLOBS_TOKEN is missing."
    );
  }

  return getStore(STORE_NAME, { siteID, token });
}

/**
 * Read stats from Netlify Blobs.
 * If blob is missing or corrupted, reset to safe defaults.
 */
export async function readStats() {
  const store = getStatsStore();

  try {
    const current = await store.get(KEY, { type: "json" });

    if (current && typeof current === "object") {
      return {
        totalViews: Number(current.totalViews || 0),
        totalScans: Number(current.totalScans || 0),
        perChainScans: current.perChainScans || {},
      };
    }
  } catch (err) {
    console.error("readStats error, resetting stats blob:", err);
  }

  // Fallback if anything went wrong
  const fresh = {
    totalViews: 0,
    totalScans: 0,
    perChainScans: {},
  };

  try {
    await store.set(KEY, fresh);
  } catch (err) {
    console.error("Failed to write fresh stats blob:", err);
  }

  return fresh;
}

/**
 * Write stats back to the blob, always valid JSON.
 */
export async function writeStats(stats) {
  const store = getStatsStore();

  const safe = {
    totalViews: Number(stats.totalViews || 0),
    totalScans: Number(stats.totalScans || 0),
    perChainScans: stats.perChainScans || {},
  };

  await store.set(KEY, safe);
}