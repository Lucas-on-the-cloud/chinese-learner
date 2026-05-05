// List all tables + their RLS state + existing policies
import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://prctmferugkxabyizslx.supabase.co','sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ');

// Probe by trying to read 0 rows from known tables
const known = [
  'lessons','books','posts','flashcard_templates','vocab_cache','audio_segments',
  'comments','exam_books','exam_units','exam_sections','exam_passages','exam_questions',
  'exam_choices','exam_vocab','exam_phrases','exam_results','exam_listening_transcripts',
  'profiles','user_progress','user_flashcards',
];
console.log('Tables and row counts (anon-readable):');
for (const t of known) {
  const { count, error } = await sb.from(t).select('*', { count:'exact', head:true });
  if (error) console.log(`  ✗ ${t}: ${error.message.slice(0, 80)}`);
  else console.log(`  ${t.padEnd(32)} count=${count}`);
}
