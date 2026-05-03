import { createClient } from '@supabase/supabase-js';
const db = createClient(
  'https://prctmferugkxabyizslx.supabase.co',
  'sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ'
);

const { data } = await db.from('lessons').select('*').eq('book', 'TOCFL_C1').order('id').limit(2);
data.forEach(l => {
  console.log('─'.repeat(70));
  console.log('id:         ', l.id);
  console.log('title:      ', l.title);
  console.log('book:       ', l.book);
  console.log('description:', l.description?.slice(0, 80));
  console.log('chinese len:', l.chinese?.length);
  console.log('chinese[0:200]:', l.chinese?.slice(0, 200));
  console.log('pinyin:     ', l.pinyin);
  console.log('vietnamese: ', l.vietnamese);
});
