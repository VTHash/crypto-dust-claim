import { readStats, writeStats } from "./_stats-helpers.mjs";

export default async (req) => {
  let body;
  try {
    body = await req.json();
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

  return new Response(
    JSON.stringify({
      ok: true,
      totalScans: stats.totalScans,
      perChainScans: stats.perChainScans,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
};