import { readStats, writeStats } from "./_stats-helpers.js";

// Pause mode flag
const PAUSED = process.env.STATS_PAUSED === "true";

export const handler = async (event) => {
  try {
    let chains = [];

    // Expect POST: { chains: [1, 10, 137...] }
    if (event.httpMethod === "POST" && event.body) {
      try {
        const parsed = JSON.parse(event.body);
        if (Array.isArray(parsed.chains)) {
          chains = parsed.chains;
        }
      } catch (err) {
        console.error("stats-scan JSON parse error:", err);
      }
    }

    const stats = await readStats();

    // 🔥 If PAUSED → RETURN EXISTING DATA WITHOUT INCREMENTING
    if (PAUSED) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: true,
          paused: true,
          totalScans: stats.totalScans,
          perChainScans: stats.perChainScans,
        }),
      };
    }

    // 🔥 Normal mode → increment counters
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