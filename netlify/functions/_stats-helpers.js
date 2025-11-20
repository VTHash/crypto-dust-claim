import { getStore } from "@netlify/blobs";

const STORE_NAME = "dustclaim-global-stats";
const KEY = "global";

// Create a store safely — works both with automatic Netlify Blobs
// OR manually injected credentials (via environment variables)
function getSafeStore() {
  try {
    const siteID = process.env.NETLIFY_SITE_ID;
    const token =
      process.env.NETLIFY_BLOBS_TOKEN ||
      process.env.NETLIFY_API_TOKEN ||
      process.env.NETLIFY_AUTH_TOKEN;

    if (siteID && token) {
      return getStore(STORE_NAME, { siteID, token });
    }

    // Try the default (auto-injected) Blobs context
    return getStore(STORE_NAME);
  } catch (err) {
    console.error("⚠️ Netlify Blobs store unavailable:", err);
    return null;
  }
}

async function safeGet(store, key) {
  try {
    const value = await store.get(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

async function safeSet(store, key, data) {
  try {
    await store.set(key, JSON.stringify(data));
  } catch (err) {
    console.error("⚠️ Failed to write stats:", err);
  }
}

// === Exported functions ===
export async function readStats() {
  const store = getSafeStore();
  if (!store) {
    console.warn("⚠️ Falling back to in-memory stats.");
    return { totalViews: 0, totalScans: 0, perChainScans: {} };
  }

  const current = await safeGet(store, KEY);
  if (current) return current;

  const fresh = { totalViews: 0, totalScans: 0, perChainScans: {} };
  await safeSet(store, KEY, fresh);
  return fresh;
}

export async function writeStats(stats) {
  const store = getSafeStore();
  if (!store) return;

  const safe = {
    totalViews: Number(stats.totalViews || 0),
    totalScans: Number(stats.totalScans || 0),
    perChainScans: stats.perChainScans || {},
  };
  await safeSet(store, KEY, safe);
}