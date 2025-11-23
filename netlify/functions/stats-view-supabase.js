// netlify/functions/stats-view-supabase.js
const { readStats, writeStats } = require('./stats-supabase.js');

const PAUSED = process.env.STATS_PAUSED === 'true';

exports.handler = async () => {
  try {
    const stats = await readStats();

    if (PAUSED) {
      // Just return current values, no write
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: true,
          paused: true,
          totalViews: Number(stats.totalViews || 0),
        }),
      };
    }

    const updated = {
      totalViews: Number(stats.totalViews || 0) + 1,
      totalScans: Number(stats.totalScans || 0),
      perChainScans: stats.perChainScans || {},
    };

    await writeStats(updated);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        paused: false,
        totalViews: updated.totalViews,
      }),
    };
  } catch (err) {
    console.error('stats-view-supabase ERROR:', err);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'stats-view-supabase failed' }),
    };
  }
};