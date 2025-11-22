import { readStats, writeStats } from "./_stats-supabase.js";

const PAUSED = process.env.STATS_PAUSED === "true";

export const handler = async () => {
  try {
    const stats = await readStats();

    if (PAUSED) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: true,
          paused: true,
          totalViews: stats.totalViews,
        }),
      };
    }

    stats.totalViews += 1;
    await writeStats(stats);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        paused: false,
        totalViews: stats.totalViews,
      }),
    };
  } catch (err) {
    console.error("stats-view ERROR:", err);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "stats-view failed" }),
    };
  }
};