import { readStats, writeStats } from "./_stats-helpers.mjs";

export const handler = async () => {
  try {
    const stats = await readStats();

    const updated = {
      ...stats,
      totalViews: Number(stats.totalViews || 0) + 1,
    };

    await writeStats(updated);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, totalViews: updated.totalViews }),
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