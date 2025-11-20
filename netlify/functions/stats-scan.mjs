import { readStats, writeStats } from "./_stats-helpers.mjs";

export const handler = async (event) => {
  try {
    let body = {};
    if (event.body) {
      try {
        body = JSON.parse(event.body);
      } catch {
        body = {};
      }
    }

    const chains = Array.isArray(body.chains) ? body.chains : [];

    const stats = await readStats();

    const updated = {
      ...stats,
      totalScans: Number(stats.totalScans || 0) + 1,
      perChainScans: { ...(stats.perChainScans || {}) },
    };

    for (const id of chains) {
      const key = String(id);
      updated.perChainScans[key] = (updated.perChainScans[key] || 0) + 1;
    }

    await writeStats(updated);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        totalScans: updated.totalScans,
        perChainScans: updated.perChainScans,
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