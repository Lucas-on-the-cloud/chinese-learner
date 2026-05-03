import { createClient } from '@supabase/supabase-js';
const db = createClient(
  'https://prctmferugkxabyizslx.supabase.co',
  'sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ'
);

const { data: course } = await db.from('courses').select('*').eq('id', 2).single();
const { data: links }  = await db.from('course_books').select('*').eq('course_id', 2);
const { data: book }   = await db.from('books').select('*').eq('name', 'TOCFL_C1').maybeSingle();
const { data: lessons }= await db.from('lessons').select('id,title,book').eq('book', 'TOCFL_C1');
const { count: fcCnt } = await db.from('flashcard_templates')
  .select('id', { count: 'exact', head: true }).eq('book_name', 'TOCFL_C1');

console.log('COURSE:', course);
console.log('\nCOURSE_BOOKS links:', links);
console.log('\nBOOK:', book);
console.log('\nLESSONS count:', lessons?.length, '— first 3:', lessons?.slice(0, 3));
console.log('\nFLASHCARDS count:', fcCnt);
