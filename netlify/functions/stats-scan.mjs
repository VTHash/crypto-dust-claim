import { readStats, writeStats } from "./_stats-helpers.mjs";

export const handler = async (event) => {
  try {
    // Body comes in as a string in Lambda-style functions
    let body = {};
    if (event.body) {
      try {
        body = JSON.parse(event.body);
      } catch (err) {
        console.error("stats-scan body parse error:", err);
      }
    }

    const chains = Array.isArray(body.chains) ? body.chains : [];

    const stats = await readStats();
    stats.totalScans = (Number(stats.totalScans) || 0) + 1;

    if (!stats.perChainScans || typeof stats.perChainScans !== "object") {
      stats.perChainScans = {};
    }

    for (const id of chains) {
      const key = String(id);
      stats.perChainScans[key] =
        (Number(stats.perChainScans[key]) || 0) + 1;
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