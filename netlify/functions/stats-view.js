import { readStats, writeStats } from "./_stats-helpers.mjs";

export const handler = async () => {
  try {
    const stats = await readStats();
    stats.totalViews += 1;
    await writeStats(stats);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, totalViews: stats.totalViews }),
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