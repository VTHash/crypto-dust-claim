import { getStore } from "@netlify/blobs";

const STORE_NAME = "dustclaim-global-stats";
const KEY = "global";
// Simple label map so top chains look nice in the widget
const CHAIN_LABELS = {
  1: 'Ethereum',
  10: 'Optimism',
  56: 'BNB Smart Chain',
  137: 'Polygon PoS',
  42161: 'Arbitrum One',
  8453: 'Base',
  130: 'Unichain',
  5000: 'Mantle',
  9745: 'Plasma',
  324: 'zkSync',
  14: 'Flare',
  40: 'Telos',
  57: 'Syscoin',
  50: 'XDC Network',
  61: 'Ethereum Classic',
  57073: 'Inkonchain',
  122: 'Fuse',
  60808: 'BOB',
  81457: 'Blast',
  1868: 'Soneium',
  480: 'World Chain',
  1135: 'Lisk',
  1923: 'Swellchain',
  2741: 'Abstract',
  747474: 'Katana',
  146: 'Sonic'
}
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