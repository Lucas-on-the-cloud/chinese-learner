// Apply sort_order column to exam_passages + backfill via Supabase REST.
// Anon key may not have DDL rights; if this fails, run sql/005_passage_sort_order.sql manually.

import { createClient } from '@supabase/supabase-js';
const db = createClient(
  'https://prctmferugkxabyizslx.supabase.co',
  'sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ'
);

// Probe: does sort_order column already exist?
const { data, error } = await db.from('exam_passages').select('sort_order').limit(1);
if (error) {
  if (error.message?.includes('sort_order')) {
    console.error('✗ Column sort_order does NOT exist yet.');
    console.error('  Run sql/005_passage_sort_order.sql in Supabase SQL Editor first.');
    process.exit(1);
  }
  console.error('✗ Probe error:', error);
  process.exit(1);
}
console.log('✓ Column sort_order exists.');

// Backfill any rows where sort_order is 0 (i.e. unset)
const { data: zeros } = await db.from('exam_passages')
  .select('id,section_id').eq('sort_order', 0).order('id');
console.log(`Found ${zeros?.length || 0} passages with sort_order=0 — backfilling…`);

if (zeros?.length) {
  // Group by section, assign 1,2,3,... per section
  const bySection = {};
  zeros.forEach(p => {
    if (!bySection[p.section_id]) bySection[p.section_id] = [];
    bySection[p.section_id].push(p.id);
  });
  let done = 0;
  for (const [secId, ids] of Object.entries(bySection)) {
    // Find max existing sort_order in this section
    const { data: existing } = await db.from('exam_passages')
      .select('sort_order').eq('section_id', secId).gt('sort_order', 0)
      .order('sort_order', { ascending: false }).limit(1);
    let next = (existing?.[0]?.sort_order || 0) + 1;
    for (const id of ids) {
      await db.from('exam_passages').update({ sort_order: next }).eq('id', id);
      next++;
      done++;
    }
  }
  console.log(`✓ Backfilled ${done} rows.`);
}
