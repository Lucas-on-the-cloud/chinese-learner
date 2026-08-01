// Vercel cron: ping Supabase daily to prevent free-tier project from pausing.
// Schedule: every day at 08:00 UTC (vercel.json)

import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL     || 'https://prctmferugkxabyizslx.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  // Vercel cron passes Authorization header — validate it
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { count, error } = await sb
      .from('lessons')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;

    console.log(`[ping] Supabase alive — lessons: ${count}`);
    return res.status(200).json({ ok: true, lessons: count, ts: new Date().toISOString() });
  } catch (err) {
    console.error('[ping] Supabase error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
