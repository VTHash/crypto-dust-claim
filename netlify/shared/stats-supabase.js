// netlify/shared/stats-supabase.js
// CommonJS helper used by stats-get-supabase, stats-view-supabase, stats-scan-supabase

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

// Your actual table/columns from the screenshot:
// table: global_stats
// columns: id, totalviews, totalscans, perchainscans
const TABLE_NAME = 'global_stats';
const ROW_ID = 1;

const DEFAULT_STATS = {
  totalViews: 0,
  totalScans: 0,
  perChainScans: {},
};

async function readStatsSupabase() {
  if (!supabase) {
    return { ...DEFAULT_STATS };
  }

  try {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('id, totalviews, totalscans, perchainscans')
      .eq('id', ROW_ID)
      .limit(1);

    if (error) {
      console.error('Supabase readStatsSupabase error:', error);
      return { ...DEFAULT_STATS };
    }

    if (!data || data.length === 0) {
      // Create initial row
      const freshRow = {
        id: ROW_ID,
        totalviews: 0,
        totalscans: 0,
        perchainscans: {},
      };

      const { error: insertErr } = await supabase
        .from(TABLE_NAME)
        .insert([freshRow]);

      if (insertErr) {
        console.error('Supabase readStatsSupabase insert error:', insertErr);
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
    console.error('readStatsSupabase exception:', err);
    return { ...DEFAULT_STATS };
  }
}

async function writeStatsSupabase(stats) {
  if (!supabase) {
    console.warn('Supabase not configured, writeStatsSupabase is a no-op.');
    return;
  }

  const safe = {
    id: ROW_ID,
    totalviews: Number(stats.totalViews || 0),
    totalscans: Number(stats.totalScans || 0),
    perchainscans: stats.perChainScans || {},
  };

  try {
    const { error } = await supabase
      .from(TABLE_NAME)
      .upsert([safe], { onConflict: 'id' });

    if (error) {
      console.error('Supabase writeStatsSupabase error:', error);
    }
  } catch (err) {
    console.error('writeStatsSupabase exception:', err);
  }
}

module.exports = {
  readStatsSupabase,
  writeStatsSupabase,
};