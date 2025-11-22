import { readStats } from "./_stats-helpers.js";

export const handler = async () => {
  try {
    const stats = await readStats();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        paused: process.env.STATS_PAUSED === "true",
        totalViews: stats.totalViews,
        totalScans: stats.totalScans,
        perChainScans: stats.perChainScans,
      }),
    };
  } catch (err) {
    console.error("stats-get ERROR:", err);
    return { statusCode: 500, body: "stats-get failed" };
  }
};