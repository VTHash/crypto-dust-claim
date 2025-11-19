import { getStore } from "@netlify/blobs";

const STORE_NAME = "dustclaim-global-stats";
const KEY = "global";

/**
 * Read stats from Netlify Blobs.
 * - If blob is missing or corrupted, reset to a safe default.
 */
export async function readStats() {
  const store = getStore(STORE_NAME);

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

  // Fallback: if anything went wrong, reset to fresh defaults
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
 * Write stats back to the blob, making sure the shape is always valid JSON.
 */
export async function writeStats(stats) {
  const store = getStore(STORE_NAME);

  const safe = {
    totalViews: Number(stats.totalViews || 0),
    totalScans: Number(stats.totalScans || 0),
    perChainScans: stats.perChainScans || {},
  };

  await store.set(KEY, safe);
}