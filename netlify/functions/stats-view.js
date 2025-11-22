import { readStats, writeStats } from "./_stats-helpers.js";

const PAUSED = process.env.STATS_PAUSED === "true";

export const handler = async () => {
  try {
    const stats = await readStats();

    // PAUSED → do NOT increment views
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

    // LIVE → increment view counter
    stats.totalViews = (Number(stats.totalViews) || 0) + 1;
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
    return { statusCode: 500, body: "stats-view failed" };
  }
};