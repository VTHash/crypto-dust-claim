import { getStore } from "@netlify/blobs";

const STORE_NAME = "dustclaim-global-stats";
const KEY = "global";

// Use explicit site + token if present
function getStatsStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;

  if (siteID && token) {
    return getStore(STORE_NAME, { siteID, token });
  }

  return getStore(STORE_NAME);
}

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
    // IMPORTANT: stringify when writing
    await store.set(KEY, JSON.stringify(fresh));
  } catch (err) {
    console.error("Failed to write fresh stats blob:", err);
  }

  return fresh;
}

export async function writeStats(stats) {
  const store = getStatsStore();

  const safe = {
    totalViews: Number(stats.totalViews || 0),
    totalScans: Number(stats.totalScans || 0),
    perChainScans:
      stats.perChainScans && typeof stats.perChainScans === "object"
        ? stats.perChainScans
        : {},
  };

  // IMPORTANT: stringify when writing
  await store.set(KEY, JSON.stringify(safe));
}
