import { readStats, writeStats } from "./_stats-helpers.mjs";

export default async () => {
  const stats = await readStats();
  stats.totalViews += 1;
  await writeStats(stats);

  return new Response(
    JSON.stringify({ ok: true, totalViews: stats.totalViews }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
};