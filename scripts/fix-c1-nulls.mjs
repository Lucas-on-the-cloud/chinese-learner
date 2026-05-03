// Reading view crashes on null pinyin/vietnamese (calls .split() on null).
// Fix: replace NULL with empty string for TOCFL_C1 lessons.

import { createClient } from '@supabase/supabase-js';
const db = createClient(
  'https://prctmferugkxabyizslx.supabase.co',
  'sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ'
);

const { data, error, count } = await db.from('lessons')
  .update({ pinyin: '', vietnamese: '' }, { count: 'exact' })
  .eq('book', 'TOCFL_C1')
  .is('pinyin', null)  // only rows where pinyin is currently NULL
  .select('id');

if (error) { console.error('✗', error); process.exit(1); }
console.log('✓ Updated', data?.length || count, 'lessons (NULL → \'\')');

// Also fix vietnamese where it's still null after the previous filter
const { data: viFix, error: e2 } = await db.from('lessons')
  .update({ vietnamese: '' })
  .eq('book', 'TOCFL_C1')
  .is('vietnamese', null)
  .select('id');
if (e2) { console.error('✗', e2); process.exit(1); }
console.log('✓ Updated', viFix?.length || 0, 'rows for vietnamese NULL → \'\'');

const { data: sample } = await db.from('lessons')
  .select('id,title,pinyin,vietnamese').eq('book', 'TOCFL_C1').limit(2);
console.log('\nSample after fix:', sample);
