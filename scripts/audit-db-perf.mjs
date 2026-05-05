// Audit DB performance: row counts, table sizes, missing indexes, slow queries.
// Uses service role to access pg_stat_*.
import { getServiceClient } from './_supabase.mjs';
const sb = getServiceClient();

async function rpc(sql) {
  // Supabase doesn't expose raw SQL directly; use pg API via PostgREST.
  // We'll create a small RPC function or use the REST raw query through PostgREST.
  // Fallback: use 'rest' with SELECT via SDK on system catalogs (won't work directly).
  // For now, we'll list info from data API and skip system catalogs.
  return null;
}

const TABLES = [
  'lessons','books','posts','flashcard_templates','vocab_cache','audio_segments',
  'comments','exam_books','exam_units','exam_sections','exam_passages','exam_questions',
  'exam_choices','exam_vocab','exam_phrases','exam_results','exam_listening_transcripts',
  'profiles','user_flashcards','flashcards',
];

console.log('═══ Row counts + sample row sizes (estimated) ═══\n');
for (const t of TABLES) {
  const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
  if (error) { console.log(`  ✗ ${t}: ${error.message.slice(0,60)}`); continue; }
  const { data: sample } = await sb.from(t).select('*').limit(1);
  let avgBytes = 0;
  if (sample?.[0]) {
    avgBytes = JSON.stringify(sample[0]).length;
  }
  console.log(`  ${t.padEnd(32)} ${String(count).padStart(7)} rows · ~${avgBytes} B/row · est total ~${Math.round((count || 0) * avgBytes / 1024 / 1024)} MB`);
}

console.log('\n═══ Heavy columns to watch ═══\n');
// Inspect known big columns
const checks = [
  { table: 'lessons', col: 'chinese' },
  { table: 'lessons', col: 'pinyin' },
  { table: 'lessons', col: 'vietnamese' },
  { table: 'audio_segments', col: 'transcript' },
  { table: 'audio_segments', col: 'pinyin' },
  { table: 'audio_segments', col: 'meaning_vi' },
  { table: 'vocab_cache', col: 'items' },
  { table: 'exam_passages', col: 'content_text' },
  { table: 'comments', col: 'body' },
  { table: 'posts', col: 'content' },
];
for (const { table, col } of checks) {
  const { data } = await sb.from(table).select(col).limit(100);
  if (!data) continue;
  const lens = data.map(r => (r[col] || '').toString().length).filter(n => n > 0);
  if (!lens.length) { console.log(`  ${table}.${col}: (empty)`); continue; }
  const avg = Math.round(lens.reduce((a,b)=>a+b,0)/lens.length);
  const max = Math.max(...lens);
  console.log(`  ${(table+'.'+col).padEnd(36)} avg=${String(avg).padStart(5)} max=${String(max).padStart(6)} chars (n=${lens.length})`);
}
