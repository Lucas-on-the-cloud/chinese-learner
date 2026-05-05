import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://prctmferugkxabyizslx.supabase.co','sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ');

// Find lessons whose vocab was just regenerated (most recent vocab_cache rows in B2 book)
const { data: lessonsB2 } = await sb.from('lessons').select('id, title').eq('book','B2');
const lessonIds = lessonsB2.map(l => l.id);
const { data: vc } = await sb.from('vocab_cache').select('lesson_id, items, created_at').in('lesson_id', lessonIds).order('created_at', { ascending:false }).limit(3);

for (const row of vc) {
  const lesson = lessonsB2.find(l => l.id === row.lesson_id);
  console.log(`\n=== id=${row.lesson_id} · "${lesson?.title}" ===`);
  console.log(`Items: ${row.items.length}`);
  row.items.slice(0,5).forEach((w,i) => console.log(`  ${i+1}. ${w.char} [${w.pinyin}] ${w.meaning}`));

  const { data: ft } = await sb.from('flashcard_templates').select('char, pinyin, meaning, example_zh, example_vi, sort_order').eq('lesson_id', row.lesson_id).order('sort_order');
  console.log(`Flashcards: ${ft?.length}`);
  ft?.slice(0,2).forEach(f => console.log(`  · ${f.char} (${f.pinyin}): ${f.meaning} | ex: "${f.example_zh}" → "${f.example_vi}"`));
}
