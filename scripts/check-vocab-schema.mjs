import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://prctmferugkxabyizslx.supabase.co','sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ');

const { data: vc } = await sb.from('vocab_cache').select('*').limit(1);
console.log('vocab_cache cols:', vc?.[0] ? Object.keys(vc[0]) : 'empty');
if (vc?.[0]) {
  const it = (vc[0].items || [])[0];
  console.log('  items[0] cols:', it ? Object.keys(it) : 'empty');
  console.log('  items[0]:', JSON.stringify(it).slice(0, 200));
}

const { data: ft } = await sb.from('flashcard_templates').select('*').limit(1);
console.log('\nflashcard_templates cols:', ft?.[0] ? Object.keys(ft[0]) : 'empty');
if (ft?.[0]) console.log('  sample:', JSON.stringify(ft[0]).slice(0, 300));
