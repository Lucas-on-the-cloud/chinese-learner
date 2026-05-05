// Backfill random 3-5 star ratings on ~70% of top-level seed comments so the
// aggregate rating UI has data to display when testing.
import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://prctmferugkxabyizslx.supabase.co','sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ');

const { data: rows, error } = await sb
  .from('comments')
  .select('id')
  .is('parent_id', null)
  .is('rating', null);
if (error) { console.error(error); process.exit(1); }
console.log(`Found ${rows.length} top-level comments without rating`);

let updated = 0;
for (const r of rows) {
  if (Math.random() > 0.7) continue; // skip ~30%
  // Skew toward 4-5 stars (positive sample reviews)
  const roll = Math.random();
  const rating = roll < 0.55 ? 5 : roll < 0.85 ? 4 : roll < 0.95 ? 3 : (roll < 0.98 ? 2 : 1);
  const { error: e } = await sb.from('comments').update({ rating }).eq('id', r.id);
  if (!e) updated++;
}
console.log(`✓ Updated ${updated} comments with random ratings`);
