import { readStats } from './_stats-helpers.mjs';

export const handler = async () => {
  try {
    const stats = await readStats();

    // Ensure ALWAYS valid JSON
    const safeStats = stats || {
      totalViews: 0,
      totalScans: 0,
      perChainScans: {}
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(safeStats),
    };
  } catch (err) {
    console.error("stats-get ERROR:", err);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "stats-get failed" }),
    };
  }
};
