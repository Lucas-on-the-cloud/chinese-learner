import { createClient } from '@supabase/supabase-js';
const db = createClient(
  'https://prctmferugkxabyizslx.supabase.co',
  'sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ'
);

const id = process.argv[2] || 119;
const { data } = await db.from('lessons').select('chinese,pinyin,vietnamese').eq('id', id).single();

const split = s => (s || '').split('\n').filter(l => l.trim());
console.log(`Lesson id=${id}`);
console.log(`zh paragraphs (after split-by-\\n & filter): ${split(data.chinese).length}`);
console.log(`py paragraphs: ${split(data.pinyin).length}`);
console.log(`vi paragraphs: ${split(data.vietnamese).length}`);
console.log('\n--- ZH first 200 chars ---');
console.log(data.chinese.slice(0, 200));
console.log('\n--- PY first 300 chars ---');
console.log(data.pinyin.slice(0, 300));
console.log('\n--- VI first 200 chars ---');
console.log(data.vietnamese.slice(0, 200));
