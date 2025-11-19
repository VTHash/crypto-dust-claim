import { readStats } from "./_stats-helpers.mjs";

export const handler = async () => {
  try {
    const stats = await readStats();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(stats),
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