import { readStats } from "./_stats-supabase.js";

const PAUSED = process.env.STATS_PAUSED === "true";

export const handler = async () => {
  try {
    const stats = await readStats();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paused: PAUSED,
        totalViews: stats.totalViews,
        totalScans: stats.totalScans,
        perChainScans: stats.perChainScans,
      }),
    };
  } catch (err) {
    console.error("stats-get ERROR:", err);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "stats-get failed" }),
    };
  }
};