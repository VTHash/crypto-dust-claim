import { getStore } from "@netlify/blobs";

const STORE_NAME = "dustclaim-global-stats";
const KEY = "global";

/**
 * Get a handle to the Blobs store.
 * Using the object form is what Netlify shows in their docs.
 */
function getStatsStore() {
  return getStore({
    name: STORE_NAME,
    consistency: "strong", // safer for counters
  });
}

/**
 * Read stats from Netlify Blobs.
 * If the blob is missing or corrupted, reset to a safe default.
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

  // Fallback: fresh defaults
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
 * Write stats back to the blob, keeping a clean JSON shape.
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