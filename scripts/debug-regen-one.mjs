import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://prctmferugkxabyizslx.supabase.co','sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ');

// Pick one lesson with chinese content
const { data: pool } = await sb.from('lessons').select('id, title, book, chinese, pinyin, vietnamese').eq('book','B2');
const target = pool.find(l => (l.chinese||'').trim().length > 100);
console.log(`Target lesson: id=${target.id} · "${target.title}"`);

// Check current vocab_cache state
const { data: before } = await sb.from('vocab_cache').select('id, lesson_id, items').eq('lesson_id', target.id);
console.log(`\nBEFORE: ${before?.length ?? 0} rows in vocab_cache for this lesson`);
if (before?.length) {
  console.log(`  row id=${before[0].id} · ${before[0].items?.length} items · first: ${before[0].items?.[0]?.char}`);
}

// Try upsert with simple test items
const testItems = [
  { char: '測試', pinyin: 'cèshì', meaning: 'test', example: '這是測試。', exPinyin: 'zhè shì cèshì.', exMeaning: 'Đây là test.', level: 'cơ bản' }
];
console.log(`\nUpsert with ${testItems.length} test item…`);
const { error: e } = await sb.from('vocab_cache').upsert(
  { lesson_id: target.id, items: testItems },
  { onConflict: 'lesson_id' }
);
console.log('Upsert error:', e?.message || 'none');

// Re-query
const { data: after } = await sb.from('vocab_cache').select('id, lesson_id, items').eq('lesson_id', target.id);
console.log(`\nAFTER: ${after?.length} rows`);
if (after?.length) {
  console.log(`  row id=${after[0].id} · ${after[0].items?.length} items · first: ${after[0].items?.[0]?.char}`);
}
