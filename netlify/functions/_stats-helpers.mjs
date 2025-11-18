import { getStore } from "@netlify/blobs";

const STORE_NAME = "dustclaim-global-stats";
const KEY = "global";

export async function readStats() {
  const store = getStore(STORE_NAME);
  const current = await store.get(KEY, { type: "json" });
  return (
    current || {
      totalViews: 0,
      totalScans: 0,
      perChainScans: {},
    }
  );
}

export async function writeStats(stats) {
  const store = getStore(STORE_NAME);
  await store.set(KEY, stats);
}