import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const db = createClient(
  'https://prctmferugkxabyizslx.supabase.co',
  'sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ'
);

// Get lesson IDs map
const { data: lessons } = await db.from('lessons').select('id,title').eq('book', 'TOCFL_C1');
const titleToId = Object.fromEntries(lessons.map(l => [l.title, l.id]));

const flashcards = JSON.parse(fs.readFileSync('c1-flashcards.json', 'utf8'));
const articleTitles = [...new Set(flashcards.map(f => f.lesson_title))];

// Take first 5 rows from real data
const rows = flashcards.slice(0, 5).map(fc => ({
  book_name:    fc.book_name,
  lesson_id:    titleToId[fc.lesson_title],
  lesson_title: fc.lesson_title,
  char:         fc.char,
  pinyin:       fc.pinyin,
  meaning:      fc.meaning,
  example_zh:   fc.example_zh,
  example_vi:   fc.example_vi,
  sort_order:   fc.sort_order,
  published:    fc.published,
}));

console.log('First row:', rows[0]);
console.log('lesson_id resolved:', rows[0].lesson_id);

const { data, error, status, statusText, count } = await db.from('flashcard_templates')
  .insert(rows).select();

console.log('\nBulk insert result:');
console.log('  status:', status, statusText);
console.log('  error:', error);
console.log('  data length:', data?.length);
console.log('  data first:', data?.[0]);

const { count: now } = await db.from('flashcard_templates')
  .select('id', { count: 'exact', head: true }).eq('book_name', 'TOCFL_C1');
console.log('\nTotal rows for TOCFL_C1 after bulk:', now);
