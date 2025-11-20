import { readStats, writeStats } from "./_stats-helpers.mjs";

export const handler = async (event) => {
  try {
    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      body = {};
    }

    const chains = Array.isArray(body.chains) ? body.chains : [];

    const stats = await readStats();
    stats.totalScans += 1;

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