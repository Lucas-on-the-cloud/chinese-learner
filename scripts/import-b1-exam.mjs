// Import B1 exam from b1-exam.json → Supabase
//
// Tables touched:
//   exam_books → exam_units → exam_sections → exam_passages / exam_questions → exam_choices
//   exam_vocab, exam_phrases (per unit)
//
// Idempotent on book level (skips insert if title already exists), but reuses upsert
// on exam_units (book_id, unit_number, sub_number) so re-runs won't duplicate sub-units.
//
// Run:  node scripts/import-b1-exam.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const argLevel = process.argv.find(a => a.startsWith('--level='))?.slice(8) || 'B1';
const SRC = path.join(ROOT, `${argLevel.toLowerCase()}-exam.json`);
console.log(`Importing from: ${path.relative(ROOT, SRC)}`);

const db = createClient(
  'https://prctmferugkxabyizslx.supabase.co',
  'sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ'
);

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const { book: bookSpec, units } = data;

// ─── Step 1: book ───────────────────────────────────────────────────────────
console.log(`\n[1/2] Book: ${bookSpec.title}`);
let { data: existing } = await db.from('exam_books')
  .select('id').eq('title', bookSpec.title).maybeSingle();
let bookId;
if (existing) {
  bookId = existing.id;
  console.log(`     ↳ exists (id=${bookId}) — reusing`);
} else {
  const { data: book, error } = await db.from('exam_books')
    .insert({ title: bookSpec.title, level: bookSpec.level, total_units: bookSpec.total_units, status: 'draft' })
    .select().single();
  if (error) { console.error('✗ insert book', error); process.exit(1); }
  bookId = book.id;
  console.log(`     ↳ inserted (id=${bookId})`);
}

// ─── Step 2: import each unit ───────────────────────────────────────────────
async function saveUnit(parsed) {
  const { data: unit, error: uErr } = await db.from('exam_units').upsert(
    { book_id: bookId, unit_number: parsed.unit_number, sub_number: parsed.sub_number,
      title_zh: parsed.title_zh, sub_title_zh: parsed.sub_title_zh, status: 'draft' },
    { onConflict: 'book_id,unit_number,sub_number' }
  ).select().single();
  if (uErr) throw uErr;

  // Wipe old sections (cascade deletes passages/questions/choices)
  await db.from('exam_sections').delete().eq('unit_id', unit.id);

  for (const sec of (parsed.sections || [])) {
    const { data: section, error: sErr } = await db.from('exam_sections').insert({
      unit_id: unit.id, section_number: sec.section_number,
      section_type: sec.type, title: sec.title,
    }).select().single();
    if (sErr) throw sErr;

    const passMap = {};
    for (const pass of (sec.passages || [])) {
      if (!pass.text && !pass.label) continue;
      const { data: passage, error: pErr } = await db.from('exam_passages').insert({
        section_id: section.id, label: pass.label || null, content_text: pass.text || '',
      }).select().single();
      if (pErr) throw pErr;
      passMap[pass.label || '__def__'] = passage.id;
    }

    for (const q of (sec.questions || [])) {
      const passId = passMap[q.passage_label] || passMap['__def__'] || null;
      const { data: question, error: qErr } = await db.from('exam_questions').insert({
        section_id: section.id, passage_id: passId, question_number: q.q_num,
        question_text: q.text || '', correct_answer: q.answer || null,
      }).select().single();
      if (qErr) throw qErr;

      const choiceRows = Object.entries(q.choices || {})
        .map(([label, text]) => ({ question_id: question.id, label, text }));
      if (choiceRows.length) {
        const { error: cErr } = await db.from('exam_choices').insert(choiceRows);
        if (cErr) throw cErr;
      }
    }
  }

  // Vocab / phrases
  await db.from('exam_vocab').delete().eq('unit_id', unit.id);
  if (parsed.vocab?.length) {
    await db.from('exam_vocab').insert(
      parsed.vocab.map(v => ({ unit_id: unit.id, source_section: v.source, word_zh: v.word, related_words: v.related }))
    );
  }
  await db.from('exam_phrases').delete().eq('unit_id', unit.id);
  if (parsed.phrases?.length) {
    await db.from('exam_phrases').insert(
      parsed.phrases.map(p => ({ unit_id: unit.id, source_section: p.source, phrase_zh: p.phrase, example_zh: p.example_zh }))
    );
  }
}

console.log(`\n[2/2] Units (${units.length})…`);
const failed = [];
for (let i = 0; i < units.length; i++) {
  const u = units[i];
  const tag = `[${i + 1}/${units.length}] ${u.unit_number}-${u.sub_number} ${u.sub_title_zh}`;
  process.stdout.write(`  ${tag} … `);
  try {
    await saveUnit(u);
    console.log('✓');
  } catch (e) {
    console.log(`✗ ${e.message?.slice(0, 200) || e}`);
    failed.push(`${u.unit_number}-${u.sub_number}`);
  }
}

// ─── Auto-publish ───────────────────────────────────────────────────────────
if (!failed.length) {
  await Promise.all([
    db.from('exam_books').update({ status: 'published' }).eq('id', bookId),
    db.from('exam_units').update({ status: 'published' }).eq('book_id', bookId),
  ]);
  console.log(`\n✓ Done — book id=${bookId}, ${units.length} units, all published.`);
} else {
  console.log(`\n⚠ ${units.length - failed.length}/${units.length} ok, failed: ${failed.join(', ')}`);
}
