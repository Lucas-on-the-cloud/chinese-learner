import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://prctmferugkxabyizslx.supabase.co','sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ');
const { data: books } = await sb.from('lessons').select('book').limit(500);
const counts = {}; (books||[]).forEach(b => counts[b.book]=(counts[b.book]||0)+1);
console.log('books:', counts);
// Stats: how many lessons have chinese/pinyin/vietnamese populated?
for (const book of ['B2','B2_READ']) {
  const { data: all } = await sb.from('lessons').select('id, chinese, pinyin, vietnamese').eq('book', book);
  const total = all.length;
  const hasZh = all.filter(l => (l.chinese||'').trim().length > 10).length;
  const hasPy = all.filter(l => (l.pinyin||'').trim().length > 10).length;
  const hasVi = all.filter(l => (l.vietnamese||'').trim().length > 10).length;
  console.log(`${book}: ${total} lessons · zh=${hasZh} · py=${hasPy} · vi=${hasVi}`);
}
const { data, error } = await sb.from('lessons').select('*').eq('book','B2').not('chinese','is',null).gt('id',0).limit(1);
if (error) { console.log('err',error); process.exit(1); }
if (data?.[0]) {
  console.log('\nColumns:', Object.keys(data[0]));
  const l = data[0];
  console.log(`\nSample id=${l.id} · book=${l.book} · "${l.title}"`);
  for (const [k,v] of Object.entries(l)) {
    if (typeof v === 'string') console.log(`  ${k}: ${v.slice(0,120)}${v.length>120?'…':''}`);
    else console.log(`  ${k}:`, v);
  }
}
