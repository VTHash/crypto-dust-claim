// netlify/functions/_stats-helpers-supabase.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

// Pause mode flag (same behaviour as before)
const PAUSED = process.env.STATS_PAUSED === "true";

// Fallback in-memory stats, in case Supabase is unavailable
let memoryStats = {
  totalViews: 0,
  totalScans: 0,
  perChainScans: {},
};

// Create Supabase client if env is present
const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

/**
 * Read stats from Supabase (global_stats, id = 1),
 * or fall back to in-memory stats.
 */
export async function readStats() {
  if (!supabase) {
    console.warn("Supabase not configured → using memory stats.");
    return { ...memoryStats };
  }

  try {
    const { data, error } = await supabase
      .from("global_stats")
      .select("totalviews, totalscans, perchainscans")
      .eq("id", 1)
      .single();

    if (error) {
      console.error("Supabase readStats error:", error);
      return { ...memoryStats };
    }

    const stats = {
      totalViews: Number(data.totalviews || 0),
      totalScans: Number(data.totalscans || 0),
      perChainScans: data.perchainscans || {},
    };

    memoryStats = stats;
    return stats;
  } catch (err) {
    console.error("readStats exception:", err);
    return { ...memoryStats };
  }
}

/**
 * Write stats back to Supabase (global_stats, id = 1)
 * and keep memoryStats in sync.
 */
export async function writeStats(stats) {
  const safe = {
    totalviews: Number(stats.totalViews || 0),
    totalscans: Number(stats.totalScans || 0),
    perchainscans: stats.perChainScans || {},
  };

  // Sync memory copy
  memoryStats = {
    totalViews: safe.totalviews,
    totalScans: safe.totalscans,
    perChainScans: safe.perchainscans,
  };

  if (PAUSED) {
    console.log("STATS_PAUSED = true → not writing to Supabase.");
    return;
  }

  if (!supabase) {
    console.warn("Supabase not configured → stats kept only in memory.");
    return;
  }

  try {
    const { error } = await supabase
      .from("global_stats")
      .upsert(
        {
          id: 1,
          ...safe,
        },
        { onConflict: "id" }
      );

    if (error) {
      console.error("Supabase writeStats error:", error);
    }
  } catch (err) {
    console.error("writeStats exception:", err);
  }
}