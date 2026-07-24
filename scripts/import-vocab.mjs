// Import vocab_full_export.json → Supabase vocab_* tables
//
// Prerequisites:
//   1. Run sql/vocab_tables.sql in Supabase SQL editor first.
//
// Usage:
//   node scripts/import-vocab.mjs

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getServiceClient } from './_supabase.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const db = getServiceClient();

const raw = fs.readFileSync(path.join(ROOT, 'vocab_full_export.json'), 'utf8');
const lessons = JSON.parse(raw);      // array of lesson objects

// ── Helpers ───────────────────────────────────────────────────────────

async function upsertBatch(table, rows, conflict) {
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await db.from(table).upsert(slice, { onConflict: conflict });
    if (error) throw new Error(`${table} upsert error: ${error.message}`);
  }
}

// ── Step 1: vocab_books ───────────────────────────────────────────────
console.log('Step 1/4 – vocab_books…');

// Aggregate books from lesson list
const bookMap = new Map(); // book_id → {book_id, book_name, lesson_ids: Set, word_count}
for (const l of lessons) {
  if (!bookMap.has(l.book_id)) {
    bookMap.set(l.book_id, { book_id: l.book_id, book_name: l.book, lesson_ids: new Set(), word_count: 0 });
  }
  const b = bookMap.get(l.book_id);
  b.lesson_ids.add(l.lesson_id);
  b.word_count += (l.vocabularies || []).length;
}

const bookRows = [...bookMap.values()].map(b => ({
  id:           b.book_id,
  book_name:    b.book_name,
  lesson_count: b.lesson_ids.size,
  word_count:   b.word_count,
}));
await upsertBatch('vocab_books', bookRows, 'id');
console.log(`  ✓ ${bookRows.length} books`);

// ── Step 2: vocab_lessons ─────────────────────────────────────────────
console.log('Step 2/4 – vocab_lessons…');

const lessonRows = lessons.map(l => ({
  id:          l.lesson_id,
  book_id:     l.book_id,
  lesson_name: l.lesson,
  word_count:  (l.vocabularies || []).length,
}));
await upsertBatch('vocab_lessons', lessonRows, 'id');
console.log(`  ✓ ${lessonRows.length} lessons`);

// ── Step 3: vocabularies ──────────────────────────────────────────────
console.log('Step 3/4 – vocabularies…');

let totalVocab = 0;
for (const l of lessons) {
  const vocabRows = (l.vocabularies || []).map(v => ({
    id:             v.vocab_id,
    lesson_id:      l.lesson_id,
    book_id:        l.book_id,
    card_id:        v.card_id  || null,
    dict_id:        v.dict_id  || null,
    hanzi:          v.hanzi,
    pinyin:         v.pinyin        || null,
    definition:     v.definition    || null,
    part_of_speech: v.part_of_speech|| null,
    audio_url:      v.audio_url     || null,
    tocfl_band:     v.tocfl_band    || null,
    han_viet:       v.han_viet      || null,
  }));
  await upsertBatch('vocabularies', vocabRows, 'id');
  totalVocab += vocabRows.length;
  process.stdout.write(`\r  ${totalVocab} vocab entries…`);
}
console.log(`\n  ✓ ${totalVocab} vocabulary entries`);

// ── Step 4: vocab_examples ────────────────────────────────────────────
console.log('Step 4/4 – vocab_examples…');

// Build vocab_id lookup from DB (we need DB id = vocab_id from JSON)
let totalEx = 0;
for (const l of lessons) {
  const exRows = [];
  for (const v of l.vocabularies || []) {
    for (const ex of v.examples || []) {
      if (!ex.examples_hanzi && !ex.examples_translation) continue;
      exRows.push({
        vocab_id:    v.vocab_id,
        hanzi:       ex.examples_hanzi       || null,
        pinyin:      ex.examples_pinyin      || null,
        translation: ex.examples_translation || null,
      });
    }
  }
  if (!exRows.length) continue;

  const CHUNK = 200;
  for (let i = 0; i < exRows.length; i += CHUNK) {
    const { error } = await db.from('vocab_examples').insert(exRows.slice(i, i + CHUNK));
    if (error && !error.message.includes('duplicate')) {
      console.warn(`  examples insert warn: ${error.message}`);
    }
  }
  totalEx += exRows.length;
  process.stdout.write(`\r  ${totalEx} examples…`);
}
console.log(`\n  ✓ ${totalEx} example sentences`);

console.log('\nDone! Run the vocab page at /vocab.html');
