import { createClient } from '@supabase/supabase-js';
const db = createClient(
  'https://prctmferugkxabyizslx.supabase.co',
  'sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ'
);

// Get a real lesson_id first
const { data: lesson } = await db.from('lessons').select('id,title')
  .eq('book', 'TOCFL_C1').limit(1).single();
console.log('Using lesson:', lesson);

// Try insert with .select() to see what comes back
const { data, error } = await db.from('flashcard_templates').insert({
  book_name:    'TOCFL_C1',
  lesson_id:    lesson.id,
  lesson_title: lesson.title,
  char:         'TEST_CHAR',
  pinyin:       'cèshì',
  meaning:      'test',
  example_zh:   '測試例句',
  example_vi:   '',
  sort_order:   999,
  published:    true,
}).select();

console.log('\nInsert result:');
console.log('  error:', error);
console.log('  data:', data);

const { count } = await db.from('flashcard_templates')
  .select('id', { count: 'exact', head: true }).eq('char', 'TEST_CHAR');
console.log('\nRows actually present after insert:', count);
