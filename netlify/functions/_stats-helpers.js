import { getStore } from "@netlify/blobs";

const STORE_NAME = "dustclaim-global-stats";
const KEY = "global";

// Fallback in-memory store (used ONLY if Blobs is truly unavailable)
let memoryStats = {
  totalViews: 0,
  totalScans: 0,
  perChainScans: {},
};

/**
 * Build a Blobs store using manual credentials.
 * This completely bypasses the "environment not configured" issue.
 */
function getStatsStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;

  if (!siteID || !token) {
    console.warn(
      "Netlify Blobs manual config missing (NETLIFY_SITE_ID or NETLIFY_BLOBS_TOKEN). Falling back to in-memory stats."
    );
    return null;
  }

  // IMPORTANT: use object form so we pass siteID + token explicitly
  return getStore({
    name: STORE_NAME,
    siteID,
    token,
  });
}

/**
 * Read stats from Blobs, or fallback to in-memory if Blobs isn't available.
 */
export async function readStats() {
  const store = getStatsStore();

  // If we couldn't build a store, just return in-memory stats
  if (!store) {
    return memoryStats;
  }

  try {
    const current = await store.get(KEY, { type: "json" });

    if (current && typeof current === "object") {
      const safe = {
        totalViews: Number(current.totalViews || 0),
        totalScans: Number(current.totalScans || 0),
        perChainScans: current.perChainScans || {},
      };

      memoryStats = safe; // keep memory copy in sync
      return safe;
    }
  } catch (err) {
    console.error("readStats error, resetting stats blob:", err);
  }

  // If blob is missing or corrupt, reset to fresh defaults
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

  memoryStats = fresh;
  return fresh;
}

/**
 * Write stats to Blobs (and keep in-memory copy updated).
 */
export async function writeStats(stats) {
  const store = getStatsStore();

  const safe = {
    totalViews: Number(stats.totalViews || 0),
    totalScans: Number(stats.totalScans || 0),
    perChainScans: stats.perChainScans || {},
  };

  memoryStats = safe;

  if (!store) {
    console.warn("No Blobs store available, stats only kept in memory.");
    return;
  }

  try {
    await store.set(KEY, safe);
  } catch (err) {
    console.error("writeStats error:", err);
  }
}
