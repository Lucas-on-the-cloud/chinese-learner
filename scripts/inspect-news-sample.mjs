import { getServiceClient } from './_supabase.mjs';
const sb = getServiceClient();
const { data } = await sb.from('news_articles').select('*').order('published_at', { ascending: false }).limit(1);
const a = data?.[0];
if (!a) { console.log('empty'); process.exit(0); }
console.log('═══', a.title_zh, '═══');
console.log('VI title:', a.title_vi);
console.log('Source:', a.source_name, '|', a.category, '|', a.published_at);
console.log('\n--- Content ZH ---'); console.log(a.content_zh.slice(0, 300), '...');
console.log('\n--- Content VI ---'); console.log(a.content_vi?.slice(0, 300), '...');
console.log('\n--- Pinyin ---'); console.log(a.pinyin?.slice(0, 200), '...');
console.log('\n--- Vocab', a.vocab?.length, 'từ ---');
a.vocab?.slice(0, 8).forEach((w,i) => console.log(`  ${i+1}. ${w.char} [${w.pinyin}] ${w.meaning} · ${w.level}`));
