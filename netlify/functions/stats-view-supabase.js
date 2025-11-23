const { readStatsSupabase, writeStatsSupabase } = require('./stats-supabase.js');

const PAUSED = process.env.STATS_PAUSED === 'true';

exports.handler = async () => {
  try {
    const stats = await readStatsSupabase();

    // If paused: just return current totalViews, don't increment
    if (PAUSED) {
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

    // Normal mode: increment totalViews by 1
    const updated = {
      ...stats,
      totalViews: Number(stats.totalViews || 0) + 1,
    };

    await writeStatsSupabase(updated);

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