// Check which "publish" / "status" columns exist on each table
import { createClient } from '@supabase/supabase-js';
const sb = createClient('https://prctmferugkxabyizslx.supabase.co','sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ');

const tables = [
  'lessons','books','posts','flashcard_templates','vocab_cache','audio_segments',
  'exam_books','exam_units','exam_sections','exam_passages','exam_questions',
  'exam_choices','exam_vocab','exam_phrases','exam_results','exam_listening_transcripts',
  'profiles','user_progress','user_flashcards','comments',
];
for (const t of tables) {
  // Try inserting an impossible filter to learn columns from error
  const { error } = await sb.from(t).select('user_id').limit(0);
  console.log(`${t.padEnd(32)} user_id col: ${error ? 'NO ('+error.message.slice(0,50)+')' : 'YES'}`);
}
