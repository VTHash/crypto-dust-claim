import { getStore } from "@netlify/blobs";

const STORE_NAME = "dustclaim-global-stats";
const KEY = "global";

// Pause Mode Flag
const PAUSED = process.env.STATS_PAUSED === "true";

// Fallback in-memory store (only used if Blobs is unavailable)
let memoryStats = {
  totalViews: 0,
  totalScans: 0,
  perChainScans: {},
};

/**
 * Build a Blobs store using manual credentials.
 */
function getStatsStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;

  if (!siteID || !token) {
    console.warn(
      "Netlify Blobs manual config missing (NETLIFY_SITE_ID or NETLIFY_BLOBS_TOKEN). Using in-memory stats."
    );
    return null;
  }

  return getStore({
    name: STORE_NAME,
    siteID,
    token,
  });
}

/**
 * Read stats from Blobs (or fallback to memory).
 */
export async function readStats() {
  const store = getStatsStore();

  // If no Blobs available, return in-memory snapshot
  if (!store) return memoryStats;

  try {
    const current = await store.get(KEY, { type: "json" });

    if (current && typeof current === "object") {
      const safe = {
        totalViews: Number(current.totalViews || 0),
        totalScans: Number(current.totalScans || 0),
        perChainScans: current.perChainScans || {},
      };

      memoryStats = safe;
      return safe;
    }
  } catch (err) {
    console.error("readStats error:", err);
  }

  // If missing or corrupted, initialize defaults
  const fresh = {
    totalViews: 0,
    totalScans: 0,
    perChainScans: {},
  };

  try {
    await store.set(KEY, fresh);
  } catch (err) {
    console.error("Failed to write initial stats:", err);
  }

  memoryStats = fresh;
  return fresh;
}

/**
 * Write stats to Blobs (unless paused).
 */
export async function writeStats(stats) {
  const safe = {
    totalViews: Number(stats.totalViews || 0),
    totalScans: Number(stats.totalScans || 0),
    perChainScans: stats.perChainScans || {},
  };

  memoryStats = safe; // always keep memory in sync

  // 🔥 PAUSE MODE: Do NOT write to Blobs
  if (PAUSED) {
    console.log("STATS PAUSED – skipping write to Netlify Blobs.");
    return;
  }

  const store = getStatsStore();
  if (!store) {
    console.warn("No Blobs store available, keeping stats in memory only.");
    return;
  }

  try {
    await store.set(KEY, JSON.stringify(safe), {
      contentType: "application/json",
    });
  } catch (err) {
    console.error("writeStats error:", err);
  }
}