// netlify/functions/stats-helpers-supabase.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "Supabase env missing (SUPABASE_URL / SUPABASE_SERVICE_KEY). Stats will use defaults only."
  );
}

const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
      })
    : null;

// ✅ Match your actual table + columns
const TABLE_NAME = "global_stats";
const ROW_ID = 1; // int4 primary key

// Default stats shape used by functions
const DEFAULT_STATS = {
  totalViews: 0,
  totalScans: 0,
  perChainScans: {},
};

/**
 * Read stats from Supabase.
 * Table: public.global_stats
 * Row id: 1
 */
export async function readStats() {
  if (!supabase) {
    return { ...DEFAULT_STATS };
  }

  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select("id, totalviews, totalscans, perchainscans")
      .eq("id", ROW_ID)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Supabase readStats error:", error);
      return { ...DEFAULT_STATS };
    }

    // No row yet → create one with defaults
    if (!data) {
      const freshRow = {
        id: ROW_ID,
        totalviews: 0,
        totalscans: 0,
        perchainscans: {},
      };

      const { error: insertErr } = await supabase
        .from(TABLE_NAME)
        .upsert(freshRow, { onConflict: "id" });

      if (insertErr) {
        console.error("Supabase readStats insert error:", insertErr);
      }

      return { ...DEFAULT_STATS };
    }

    return {
      totalViews: Number(data.totalviews || 0),
      totalScans: Number(data.totalscans || 0),
      perChainScans: data.perchainscans || {},
    };
  } catch (err) {
    console.error("readStats exception:", err);
    return { ...DEFAULT_STATS };
  }
}

/**
 * Write stats back to Supabase.
 * Keeps external shape: { totalViews, totalScans, perChainScans }
 */
export async function writeStats(stats) {
  if (!supabase) {
    console.warn("Supabase not configured, writeStats is a no-op.");
    return;
  }

  const safe = {
    id: ROW_ID,
    totalviews: Number(stats.totalViews || 0),
    totalscans: Number(stats.totalScans || 0),
    perchainscans: stats.perChainScans || {},
  };

  try {
    const { error } = await supabase
      .from(TABLE_NAME)
      .upsert(safe, { onConflict: "id" });

    if (error) {
      console.error("Supabase writeStats error:", error);
    }
  } catch (err) {
    console.error("writeStats exception:", err);
  }
}