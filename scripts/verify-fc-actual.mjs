import { createClient } from '@supabase/supabase-js';
const db = createClient(
  'https://prctmferugkxabyizslx.supabase.co',
  'sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ'
);

// Group all flashcards by book_name
const { data: all } = await db.from('flashcard_templates').select('book_name');
const counts = {};
(all || []).forEach(r => { counts[r.book_name] = (counts[r.book_name] || 0) + 1; });
console.log('Flashcards by book_name:');
Object.entries(counts).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log('  ', v.toString().padStart(4), k));
