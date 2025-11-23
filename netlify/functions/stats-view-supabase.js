// netlify/functions/stats-view-supabase.js
import { readStats, writeStats } from './stats-helpers-supabase.js';

const PAUSED = process.env.STATS_PAUSED === 'true';

export const handler = async () => {
  try {
    const stats = await readStats();

    // Normalised safe object
    const safe = {
      totalViews: Number(stats.totalViews || 0),
      totalScans: Number(stats.totalScans || 0),
      perChainScans: stats.perChainScans || {},
    };

    // 🔸 If paused: DO NOT increment, just return stored values
    if (PAUSED) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: true,
          paused: true,
          ...safe,
        }),
      };
    }

    // 🔹 Normal mode: increment totalViews on each page load
    safe.totalViews += 1;
    await writeStats(safe);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        paused: false,
        ...safe,
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