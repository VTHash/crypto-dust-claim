import { createClient } from '@supabase/supabase-js';

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

// Default stats shape
const DEFAULT_STATS = {
  totalViews: 0,
  totalScans: 0,
  perChainScans: {},
};

/**
 * Read stats from Supabase.
 * Table: stats_global
 * Row id: "global"
 */
export async function readStats() {
  // If Supabase is not configured, just return default (no crash)
  if (!supabase) {
    return { ...DEFAULT_STATS };
  }

  try {
    const { data, error } = await supabase
      .from('stats_global')
      .select('total_views, total_scans, per_chain_scans')
      .eq('id', 'global')
      .limit(1);

    if (error) {
      console.error('Supabase readStats error:', error);
      return { ...DEFAULT_STATS };
    }

    if (!data || data.length === 0) {
      // No row yet → create one with defaults
      const freshRow = {
        id: 'global',
        total_views: 0,
        total_scans: 0,
        per_chain_scans: {},
      };

      const { error: insertErr } = await supabase
        .from('stats_global')
        .insert([freshRow]);

      if (insertErr) {
        console.error('Supabase readStats insert error:', insertErr);
      }

      return { ...DEFAULT_STATS };
    }

    const row = data[0];

    return {
      totalViews: Number(row.total_views || 0),
      totalScans: Number(row.total_scans || 0),
      perChainScans: row.per_chain_scans || {},
    };
  } catch (err) {
    console.error('readStats exception:', err);
    return { ...DEFAULT_STATS };
  }
}

/**
 * Write stats back to Supabase.
 * Keeps the same external shape so stats-view / stats-scan / stats-get don’t change.
 */
export async function writeStats(stats) {
  if (!supabase) {
    console.warn('Supabase not configured, writeStats is a no-op.');
    return;
  }

  const safe = {
    id: 'global',
    total_views: Number(stats.totalViews || 0),
    total_scans: Number(stats.totalScans || 0),
    per_chain_scans: stats.perChainScans || {},
  };

  try {
    const { error } = await supabase
      .from('stats_global')
      .upsert([safe], { onConflict: 'id' });

    if (error) {
      console.error('Supabase writeStats error:', error);
    }
  } catch (err) {
    console.error('writeStats exception:', err);
  }
}