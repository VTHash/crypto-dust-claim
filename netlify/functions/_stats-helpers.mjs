import { getStore } from "@netlify/blobs";

const STORE_NAME = "dustclaim-global-stats";
const KEY = "global";

// One store instance reused by all calls
const store = getStore(STORE_NAME);

export async function readStats() {
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
    console.error("readStats error:", err);
  }

  // Fallback if blob is missing or corrupted
  return {
    totalViews: 0,
    totalScans: 0,
    perChainScans: {},
  };
}

export async function writeStats(stats) {
  const safe = {
    totalViews: Number(stats.totalViews || 0),
    totalScans: Number(stats.totalScans || 0),
    perChainScans:
      stats.perChainScans && typeof stats.perChainScans === "object"
        ? stats.perChainScans
        : {},
  };

  // IMPORTANT: let Netlify handle JSON encoding
  await store.set(KEY, safe, { type: "json" });
}