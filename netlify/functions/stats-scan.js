import { readStats, writeStats } from "./_stats-helpers.js";

export const handler = async (event) => {
  try {
    let chains = [];

    // We expect a POST with JSON: { chains: [1, 10, 137, ...] }
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

    // Always increment totalScans, even if chains[] is empty
    stats.totalScans = (Number(stats.totalScans) || 0) + 1;

    // Increment per-chain counters
    for (const id of chains) {
      const key = String(id);
      if (!stats.perChainScans[key]) {
        stats.perChainScans[key] = 0;
      }
      stats.perChainScans[key] += 1;
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