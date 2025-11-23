// netlify/functions/stats-supabase.js
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    'Supabase env missing (SUPABASE_URL / SUPABASE_SERVICE_KEY). Stats will use defaults only.'
  );
}

const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
      })
    : null;

const DEFAULT_STATS = {
  totalViews: 0,
  totalScans: 0,
  perChainScans: {},
};

async function readStats() {
  if (!supabase) {
    return { ...DEFAULT_STATS };
  }

  try {
    const { data, error } = await supabase
      .from('global_stats')
      .select('id, totalviews, totalscans, perchainscans')
      .eq('id', 1)
      .limit(1);

    if (error) {
      console.error('Supabase readStats error:', error);
      return { ...DEFAULT_STATS };
    }

    if (!data || data.length === 0) {
      // If no row exists yet, create it
      const freshRow = {
        id: 1,
        totalviews: 0,
        totalscans: 0,
        perchainscans: {},
      };

      const { error: insertErr } = await supabase
        .from('global_stats')
        .insert([freshRow]);

      if (insertErr) {
        console.error('Supabase readStats insert error:', insertErr);
      }

      return { ...DEFAULT_STATS };
    }

    const row = data[0];

    return {
      totalViews: Number(row.totalviews || 0),
      totalScans: Number(row.totalscans || 0),
      perChainScans: row.perchainscans || {},
    };
  } catch (err) {
    console.error('readStats exception:', err);
    return { ...DEFAULT_STATS };
  }
}

async function writeStats(stats) {
  if (!supabase) {
    console.warn('Supabase not configured, writeStats is a no-op.');
    return;
  }

  const safe = {
    id: 1,
    totalviews: Number(stats.totalViews || 0),
    totalscans: Number(stats.totalScans || 0),
    perchainscans: stats.perChainScans || {},
  };

  try {
    const { error } = await supabase
      .from('global_stats')
      .upsert([safe], { onConflict: 'id' });

    if (error) {
      console.error('Supabase writeStats error:', error);
    }
  } catch (err) {
    console.error('writeStats exception:', err);
  }
}

module.exports = {
  readStats,
  writeStats,
};