// netlify/functions/stats-get-supabase.js
import { readStatsSupabase } from "./_stats-helpers-supabase.js";

const PAUSED = process.env.STATS_PAUSED === "true";

export const handler = async () => {
  try {
    const stats = await readStatsSupabase();

    const safe = {
      paused: PAUSED,
      totalViews: Number(stats.totalViews || 0),
      totalScans: Number(stats.totalScans || 0),
      perChainScans: stats.perChainScans || {},
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        ...safe,
      }),
    };
  } catch (err) {
    console.error("stats-get-supabase ERROR:", err);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "stats-get-supabase failed" }),
    };
  }
};