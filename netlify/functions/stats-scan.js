import { readStats, writeStats } from "./_stats-helpers.js";

const PAUSED = process.env.STATS_PAUSED === "true";

export const handler = async (event) => {
  try {
    let chains = [];

    if (event.httpMethod === "POST" && event.body) {
      const body = JSON.parse(event.body);
      if (Array.isArray(body.chains)) chains = body.chains;
    }

    const stats = await readStats();

    // PAUSED → DO NOT increment anything
    if (PAUSED) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: true,
          paused: true,
          totalViews: stats.totalViews,
          totalScans: stats.totalScans,
          perChainScans: stats.perChainScans,
        }),
      };
    }

    // LIVE mode → increment scans
    stats.totalScans = (Number(stats.totalScans) || 0) + 1;

    for (const id of chains) {
      const key = String(id);
      stats.perChainScans[key] = (stats.perChainScans[key] || 0) + 1;
    }

    await writeStats(stats);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        paused: false,
        totalViews: stats.totalViews, // just echo
        totalScans: stats.totalScans,
        perChainScans: stats.perChainScans,
      }),
    };
  } catch (err) {
    console.error("stats-scan ERROR:", err);
    return { statusCode: 500, body: "stats-scan failed" };
  }
};
