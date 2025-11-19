import { readStats, writeStats } from "./_stats-helpers.mjs";

export const handler = async (event) => {
  try {
    let chains = [];

    // Parse JSON body safely
    if (event.body) {
      try {
        const parsed = JSON.parse(event.body);
        if (Array.isArray(parsed.chains)) {
          chains = parsed.chains;
        }
      } catch (e) {
        console.error("stats-scan body parse error:", e);
      }
    }

    const stats = await readStats();

    stats.totalScans = Number(stats.totalScans || 0) + 1;

    if (!stats.perChainScans || typeof stats.perChainScans !== "object") {
      stats.perChainScans = {};
    }

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
        totalScans: stats.totalScans,
        perChainScans: stats.perChainScans,
      }),
    };
  } catch (err) {
    console.error("stats-scan ERROR:", err);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "stats-scan failed" }),
    };
  }
};