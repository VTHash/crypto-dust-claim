// netlify/functions/stats-scan-supabase.js
const { readStatsSupabase, writeStatsSupabase } = require('../shared/stats-supabase.js');

const PAUSED = process.env.STATS_PAUSED === 'true';

exports.handler = async (event) => {
  try {
    let chains = [];

    // Expect POST body: { chains: [1, 10, 137, ...] }
    if (event.httpMethod === 'POST' && event.body) {
      try {
        const parsed = JSON.parse(event.body);
        if (Array.isArray(parsed.chains)) {
          chains = parsed.chains
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id) && id > 0);
        }
      } catch (err) {
        console.error('stats-scan-supabase JSON parse error:', err);
      }
    }

    const stats = await readStatsSupabase();

    if (PAUSED) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: true,
          paused: true,
          totalScans: Number(stats.totalScans || 0),
          perChainScans: stats.perChainScans || {},
        }),
      };
    }

    const updated = {
      totalViews: Number(stats.totalViews || 0),
      totalScans: Number(stats.totalScans || 0) + 1,
      perChainScans: { ...(stats.perChainScans || {}) },
    };

    for (const id of chains) {
      const key = String(id);
      updated.perChainScans[key] =
        Number(updated.perChainScans[key] || 0) + 1;
    }

    await writeStatsSupabase(updated);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        paused: false,
        totalScans: updated.totalScans,
        perChainScans: updated.perChainScans,
      }),
    };
  } catch (err) {
    console.error('stats-scan-supabase ERROR:', err);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'stats-scan-supabase failed' }),
    };
  }
};