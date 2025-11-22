import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const TABLE = process.env.SUPABASE_STATS_TABLE || "global_stats";
const ROW_ID = 1; // single row for all stats

// Fallback for dev/offline
let memoryStats = {
  totalViews: 0,
  totalScans: 0,
  perChainScans: {},
};

/**
 * Load stats from Supabase.
 * If table or row doesn't exist → automatically create it.
 */
export async function readStats() {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("id", ROW_ID)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Supabase read error:", error);
    }

    // If row does not exist, initialize it
    if (!data) {
      const fresh = {
        id: ROW_ID,
        totalViews: 0,
        totalScans: 0,
        perChainScans: {},
      };

      await supabase.from(TABLE).upsert(fresh);

      memoryStats = fresh;
      return fresh;
    }

    memoryStats = {
      id: ROW_ID,
      totalViews: Number(data.totalViews || 0),
      totalScans: Number(data.totalScans || 0),
      perChainScans: data.perChainScans || {},
    };

    return memoryStats;

  } catch (err) {
    console.error("readStats fatal:", err);
    return memoryStats; // fallback
  }
}

/**
 * Store stats into Supabase.
 */
export async function writeStats(stats) {
  memoryStats = {
    id: ROW_ID,
    totalViews: Number(stats.totalViews || 0),
    totalScans: Number(stats.totalScans || 0),
    perChainScans: stats.perChainScans || {},
  };

  try {
    await supabase.from(TABLE).upsert(memoryStats);
  } catch (err) {
    console.error("writeStats fatal:", err);
  }
}