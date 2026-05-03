// Import C1 reading course → Supabase
//
// Hierarchy created:
//   courses (TOCFL C1)
//     └─ course_books → books (TOCFL_C1)
//                          └─ lessons (17)
//                              └─ flashcard_templates (364)
//
// Reads from:  c1-lessons.json + c1-flashcards.json (run process-c1.mjs first)
//
// Run:  node scripts/import-c1.mjs
//
// Idempotent: detects existing course by title and skips/updates accordingly.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Same keys as public site (RLS-permissive write access)
const DB_URL = process.env.SUPABASE_URL || 'https://prctmferugkxabyizslx.supabase.co';
const DB_KEY = process.env.SUPABASE_KEY || 'sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ';

const COURSE_TITLE       = 'TOCFL C1 — 流利精通級詞彙';
const COURSE_DESC        = '17 bài đọc trình độ C1 (流利精通級) theo 5 lĩnh vực: quan hệ quốc tế, công việc, thương mại, y tế, khoa học phổ cập.';
const COURSE_LEVEL       = 'C1';
const BOOK_NAME          = 'TOCFL_C1';
const BOOK_DISPLAY       = 'TOCFL C1 · 流利精通級';
const BOOK_DESC          = 'Tuyển tập 17 bài đọc TOCFL Band C — chủ đề thời sự, từ vựng cấp 6-7.';
const SKILL_TYPE         = 'reading';

const lessons    = JSON.parse(fs.readFileSync(path.join(ROOT, 'c1-lessons.json'),    'utf8'));
const flashcards = JSON.parse(fs.readFileSync(path.join(ROOT, 'c1-flashcards.json'), 'utf8'));

const db = createClient(DB_URL, DB_KEY);

const log = (...a) => console.log(...a);
const die = (msg, err) => { console.error('✗', msg, err || ''); process.exit(1); };

// ─── Step 1: courses (upsert by title) ──────────────────────────────────────
log('\n[1/5] Course…');
let { data: existingCourse } = await db.from('courses').select('id').eq('title', COURSE_TITLE).maybeSingle();
let courseId;
if (existingCourse) {
  courseId = existingCourse.id;
  log(`     ↳ exists (id=${courseId}) — skipping insert`);
} else {
  const { data, error } = await db.from('courses').insert({
    title:       COURSE_TITLE,
    description: COURSE_DESC,
    level:       COURSE_LEVEL,
    is_free:     true,
    price:       'Miễn phí',
    published:   true,
    sort_order:  100,
  }).select('id').single();
  if (error) die('insert course failed', error);
  courseId = data.id;
  log(`     ↳ inserted (id=${courseId})`);
}

// ─── Step 2: books (upsert by name) ─────────────────────────────────────────
log('[2/5] Book…');
let { data: existingBook } = await db.from('books').select('name').eq('name', BOOK_NAME).maybeSingle();
if (existingBook) {
  log(`     ↳ exists (name=${BOOK_NAME}) — skipping insert`);
} else {
  const { error } = await db.from('books').insert({
    name:         BOOK_NAME,
    display_name: BOOK_DISPLAY,
    description:  BOOK_DESC,
    skill_type:   SKILL_TYPE,
  });
  if (error) die('insert book failed', error);
  log(`     ↳ inserted (name=${BOOK_NAME})`);
}

// ─── Step 3: course_books link ──────────────────────────────────────────────
log('[3/5] Course-book link…');
let { data: existingCB } = await db.from('course_books')
  .select('id').eq('course_id', courseId).eq('book_name', BOOK_NAME).maybeSingle();
if (existingCB) {
  log(`     ↳ exists — skipping`);
} else {
  const { error } = await db.from('course_books').insert({
    course_id:  courseId,
    book_name:  BOOK_NAME,
    skill_type: SKILL_TYPE,
    sort_order: 0,
  });
  if (error) die('insert course_books failed', error);
  log(`     ↳ linked`);
}

// ─── Step 4: lessons (insert; idempotent via title match) ───────────────────
log('[4/5] Lessons…');
const { data: existingLessons } = await db.from('lessons')
  .select('id,title').eq('book', BOOK_NAME);
const titleToId = Object.fromEntries((existingLessons || []).map(l => [l.title, l.id]));

const lessonRows = lessons.map(l => ({
  book:        BOOK_NAME,
  title:       l.title,
  chinese:     l.chinese,
  pinyin:      '',  // empty, not null — reading-view.js calls .split() on it
  vietnamese:  '',
  description: l.description || l.chinese.slice(0, 80),
}));

const toInsert = lessonRows.filter(l => !titleToId[l.title]);
if (toInsert.length) {
  const { data, error } = await db.from('lessons').insert(toInsert).select('id,title');
  if (error) die('insert lessons failed', error);
  data.forEach(l => titleToId[l.title] = l.id);
  log(`     ↳ inserted ${data.length} new lessons (${Object.keys(titleToId).length} total)`);
} else {
  log(`     ↳ all 17 lessons already exist — skipping`);
}

// Build idx → lesson_id map for flashcards
const idxToLessonId = lessons.map(l => titleToId[l.title]);
if (idxToLessonId.some(x => !x)) die('some lesson IDs not resolved', idxToLessonId);

// ─── Step 5: flashcard_templates (chunked insert) ───────────────────────────
log('[5/5] Flashcards…');
// Idempotency: skip if any flashcard already exists for this book
const { count: existingFcCount } = await db.from('flashcard_templates')
  .select('id', { count: 'exact', head: true }).eq('book_name', BOOK_NAME);

if (existingFcCount && existingFcCount > 0) {
  log(`     ↳ ${existingFcCount} flashcards already exist for ${BOOK_NAME} — skipping (delete to re-import)`);
} else {
  // Strip _lesson_idx, resolve lesson_id
  const fcRows = flashcards.map(fc => ({
    book_name:    fc.book_name,
    lesson_id:    idxToLessonId[fc._lesson_idx],
    lesson_title: fc.lesson_title,
    char:         fc.char,
    pinyin:       fc.pinyin,
    meaning:      fc.meaning,
    example_zh:   fc.example_zh,
    example_vi:   fc.example_vi,
    sort_order:   fc.sort_order,
    published:    fc.published,
  }));

  // Chunk to avoid payload limits
  const CHUNK = 100;
  let inserted = 0;
  for (let i = 0; i < fcRows.length; i += CHUNK) {
    const slice = fcRows.slice(i, i + CHUNK);
    const { error } = await db.from('flashcard_templates').insert(slice);
    if (error) die(`insert flashcards chunk ${i / CHUNK} failed`, error);
    inserted += slice.length;
    process.stdout.write(`\r     ↳ inserted ${inserted}/${fcRows.length}`);
  }
  log('');
}

log('\n✓ Done.\n');
log('  Course   :', courseId, '·', COURSE_TITLE);
log('  Book     :', BOOK_NAME);
log('  Lessons  :', Object.keys(titleToId).length);
log('  Open     : https://prctmferugkxabyizslx.supabase.co  →  Table editor → courses\n');
