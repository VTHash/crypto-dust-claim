// netlify/functions/stats-view-supabase.js
import { readStats, writeStats } from "./_stats-helpers-supabase.js";

const PAUSED = process.env.STATS_PAUSED === "true";

export const handler = async () => {
  try {
    const stats = await readStats();

    // If paused → do NOT increment, just return current value
    if (PAUSED) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: true,
          paused: true,
          totalViews: Number(stats.totalViews || 0),
        }),
      };
    }

    const updated = {
      ...stats,
      totalViews: Number(stats.totalViews || 0) + 1,
    };

    await writeStats(updated);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        paused: false,
        totalViews: updated.totalViews,
      }),
    };
  } catch (err) {
    console.error("stats-view-supabase ERROR:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "stats-view-supabase failed" }),
    };
  }
};