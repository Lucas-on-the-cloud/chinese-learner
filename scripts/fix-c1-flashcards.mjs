// One-shot fix:
//  1. Delete TEST_CHAR row from earlier diagnosis
//  2. Delete 5 duplicate rows from bulk-insert test (same lesson_id+char as originals)
//  3. UPDATE remaining 364 rows: book_name='TOCFL C1 — 流利精通級詞彙' → 'TOCFL_C1'

import { createClient } from '@supabase/supabase-js';
const db = createClient(
  'https://prctmferugkxabyizslx.supabase.co',
  'sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ'
);

const WRONG = 'TOCFL C1 — 流利精通級詞彙';
const RIGHT = 'TOCFL_C1';

// 1. Delete test row
{
  const { error, count } = await db.from('flashcard_templates')
    .delete({ count: 'exact' }).eq('char', 'TEST_CHAR');
  console.log('1. TEST_CHAR deleted:', count, error || '');
}

// 2. Find duplicates by (lesson_id, char) — keep oldest id, delete rest
const { data: all } = await db.from('flashcard_templates')
  .select('id,lesson_id,char,book_name')
  .or(`book_name.eq.${WRONG},book_name.eq.${RIGHT}`)
  .order('id');

const seen = new Map();
const toDelete = [];
(all || []).forEach(r => {
  const key = `${r.lesson_id}|${r.char}`;
  if (seen.has(key)) toDelete.push(r.id);
  else seen.set(key, r.id);
});
console.log('2. Duplicate IDs to delete:', toDelete);
if (toDelete.length) {
  const { error, count } = await db.from('flashcard_templates')
    .delete({ count: 'exact' }).in('id', toDelete);
  console.log('   deleted:', count, error || '');
}

// 3. UPDATE wrong book_name → right
const { error: uerr, count: ucount } = await db.from('flashcard_templates')
  .update({ book_name: RIGHT }, { count: 'exact' }).eq('book_name', WRONG);
console.log('3. Renamed book_name (WRONG→RIGHT):', ucount, uerr || '');

// Final tally
const { count: final } = await db.from('flashcard_templates')
  .select('id', { count: 'exact', head: true }).eq('book_name', RIGHT);
console.log('\n✓ Final count for', RIGHT + ':', final);
