import { createClient } from '@supabase/supabase-js';
const db = createClient('https://prctmferugkxabyizslx.supabase.co', 'sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ');

const id = process.argv[2] || 111;
const { data } = await db.from('vocab_cache').select('*').eq('lesson_id', id).single();
if (!data) { console.log('No vocab_cache for lesson', id); process.exit(0); }
console.log(`Lesson ${id} · ${data.items.length} items · first 3:\n`);
data.items.slice(0, 3).forEach((it, i) => {
  console.log(`${i+1}. ${it.char} (${it.pinyin})`);
  console.log(`   meaning  : ${it.meaning}`);
  console.log(`   example  : ${it.example}`);
  console.log(`   exPinyin : ${it.exPinyin}`);
  console.log(`   exMeaning: ${it.exMeaning}`);
  console.log();
});
