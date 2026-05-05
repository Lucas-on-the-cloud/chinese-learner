// Reuse exam_vocab + exam_phrases (curated from B1/B2 textbook markdown) to
// populate vocab_cache + flashcard_templates for the reading course lessons.
//
// Pipeline (per exam unit):
//   1. Read exam_vocab + exam_phrases for that unit
//   2. AI fills missing metadata (pinyin, meaning_vi, example_zh, exPinyin, exMeaning)
//   3. For each reading lesson belonging to that unit:
//        - UPSERT vocab_cache (lesson_id, items JSONB)
//        - INSERT flashcard_templates (one row per word per lesson)
//
// CONSTRAINTS:
//   - READ-ONLY on exam_*  — only SELECT from exam_vocab/exam_phrases
//   - INSERT/UPSERT only on vocab_cache + flashcard_templates
//   - Idempotent: skips lessons that already have vocab_cache row
//
// Run:
//   node scripts/import-reading-vocab.mjs --key=sk-... [--book=B2|B2_READ] [--dry] [--concurrency=8]

import { getClient } from './_supabase.mjs';

const argKey  = process.argv.find(a => a.startsWith('--key='))?.slice(6);
const API_KEY = argKey || process.env.OPENAI_API_KEY;
if (!API_KEY) { console.error('✗ Missing OpenAI key'); process.exit(1); }

const argBook = process.argv.find(a => a.startsWith('--book='))?.slice(7);
const argConc = process.argv.find(a => a.startsWith('--concurrency='))?.slice(14);
const CONC    = parseInt(argConc) || 8;
const DRY_RUN = process.argv.includes('--dry');

// Mapping: reading-course book_name → exam_books.id (for finding exam_units)
const BOOKS = [
  { name: 'B2',      examBookId: 19, label: 'B1 reading' },
  { name: 'B2_READ', examBookId: 20, label: 'B2 reading' },
].filter(b => !argBook || b.name === argBook);

const db = getClient({ writes: true });

console.log(`Provider: openai · Model: gpt-4o-mini · Concurrency: ${CONC}${DRY_RUN ? ' [DRY]' : ''}`);

// ─── Prompt ────────────────────────────────────────────────────────────────
const SYSTEM = `Bạn là dịch giả TOCFL chuyên nghiệp, dịch tiếng Trung phồn thể (繁體中文 Đài Loan) sang tiếng Việt.

Cho danh sách từ vựng và cụm từ TOCFL theo chủ đề (mỗi mục có thể đã có hoặc chưa có câu ví dụ),
trả về JSON object dạng: {"items":[{"i":0,"pinyin":"...","meaning":"...","example_zh":"...","exPinyin":"...","exMeaning":"..."}, ...]}

Quy tắc:
- "pinyin": pinyin của từ/cụm, có dấu thanh (ā á ǎ à), viết liền theo từ.
- "meaning": nghĩa tiếng Việt ngắn gọn (3-12 từ).
- "example_zh": câu ví dụ ngắn tiếng Trung phồn thể. NẾU đã được cung cấp trong "exZh" thì giữ nguyên.
- "exPinyin": pinyin của câu ví dụ.
- "exMeaning": dịch câu ví dụ sang tiếng Việt.
- "i" là index 0-based — phải khớp đúng số lượng và thứ tự đầu vào.
- CHỈ xuất JSON hợp lệ, không markdown wrapper.`;

function buildUserMsg(items, topicHint) {
  const lines = items.map((it, i) =>
    `${i}. ${it.kind} "${it.zh}"${it.exZh ? ' (đã có ví dụ: "' + it.exZh + '")' : ''}`
  ).join('\n');
  return `Chủ đề TOCFL: ${topicHint || '(không rõ)'}\n\nDịch ${items.length} mục:\n\n${lines}\n\nTrả về JSON {"items":[...]} đúng ${items.length} phần tử.`;
}

async function callAI(items, topicHint, attempt = 1) {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
      body: JSON.stringify({
        model:       'gpt-4o-mini',
        max_tokens:  6000,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user',   content: buildUserMsg(items, topicHint) },
        ],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    let text = data.choices[0].message.content.trim()
      .replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(text);
    const result = Array.isArray(parsed) ? parsed : (parsed.items || parsed.results || []);
    if (!Array.isArray(result) || result.length !== items.length) {
      throw new Error(`got ${result.length}, expected ${items.length}`);
    }
    return result;
  } catch (e) {
    if (attempt >= 3) throw e;
    await new Promise(r => setTimeout(r, 1000 * attempt));
    return callAI(items, topicHint, attempt + 1);
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try { out[i] = await fn(items[i], i); }
      catch (e) { out[i] = { error: e.message }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ─── Process one book ──────────────────────────────────────────────────────
async function processBook(bookName, examBookId) {
  console.log(`\n═══ ${bookName} (exam_book ${examBookId}) ═══`);

  // Get all reading lessons for this book (paginate to bypass 1000 limit)
  const lessons = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from('lessons').select('id,title').eq('book', bookName)
      .order('id').range(from, from + 999);
    if (!data?.length) break;
    lessons.push(...data);
    if (data.length < 1000) break;
  }
  console.log(`Found ${lessons.length} lessons`);

  // Group lessons by Unit X-Y
  const byUnit = new Map(); // "X-Y" → [lesson...]
  for (const l of lessons) {
    const m = l.title.match(/Unit\s+(\d+)[-.](\d+)/i);
    if (!m) continue;
    const key = `${parseInt(m[1])}-${parseInt(m[2])}`;
    if (!byUnit.has(key)) byUnit.set(key, []);
    byUnit.get(key).push(l);
  }
  console.log(`${byUnit.size} unique units`);

  // Pre-fetch lessons that already have vocab_cache → skip them
  const lessonIds = lessons.map(l => l.id);
  const existing = new Set();
  for (let i = 0; i < lessonIds.length; i += 1000) {
    const chunk = lessonIds.slice(i, i + 1000);
    const { data } = await db.from('vocab_cache').select('lesson_id').in('lesson_id', chunk);
    (data || []).forEach(r => existing.add(r.lesson_id));
  }
  console.log(`${existing.size} lessons already have vocab_cache — will skip those`);

  // Get exam_units for this exam book
  const { data: examUnits } = await db.from('exam_units')
    .select('id,unit_number,sub_number,title_zh,sub_title_zh').eq('book_id', examBookId);
  const unitMap = new Map(examUnits.map(u => [`${u.unit_number}-${u.sub_number}`, u]));

  // Build work list: one task per UNIT (not per lesson)
  const tasks = [];
  for (const [unitKey, lessonGroup] of byUnit) {
    const examUnit = unitMap.get(unitKey);
    if (!examUnit) { console.log(`  ⊘ ${unitKey} — no exam_unit`); continue; }
    const lessonsToFill = lessonGroup.filter(l => !existing.has(l.id));
    if (!lessonsToFill.length) continue; // all lessons in unit already have vocab
    tasks.push({ unitKey, examUnit, lessons: lessonsToFill });
  }
  console.log(`${tasks.length} units need processing`);
  if (!tasks.length) return { ok: 0, items: 0, fc: 0 };

  let okUnits = 0, totalItems = 0, totalFc = 0;

  await mapLimit(tasks, CONC, async (task) => {
    const { unitKey, examUnit, lessons } = task;
    // Fetch vocab + phrases for this unit
    const [{ data: vocabRows }, { data: phraseRows }] = await Promise.all([
      db.from('exam_vocab').select('word_zh,related_words,source_section').eq('unit_id', examUnit.id),
      db.from('exam_phrases').select('phrase_zh,example_zh,source_section').eq('unit_id', examUnit.id),
    ]);

    // Filter out OCR/parser artifacts: table headers, label rows, very short/long entries
    const isJunk = (s) => {
      if (!s) return true;
      if (s.length < 1 || s.length > 25) return true;
      // Table headers / category labels (not real vocab)
      if (/主題相關詞語|常用詞組|本冊|章節|詞語|詞組/.test(s)) return true;
      // Pure punctuation/numbers
      if (/^[\d\s\p{P}]+$/u.test(s)) return true;
      return false;
    };
    const inputs = [
      ...(vocabRows  || []).filter(v => !isJunk(v.word_zh?.trim()))
        .map(v => ({ kind: 'từ',     zh: v.word_zh.trim(),    exZh: '' })),
      ...(phraseRows || []).filter(p => !isJunk(p.phrase_zh?.trim()))
        .map(p => ({ kind: 'cụm từ', zh: p.phrase_zh.trim(), exZh: p.example_zh?.trim() || '' })),
    ];
    // Dedup by zh
    const seen = new Set();
    const uniqueInputs = inputs.filter(it => {
      if (seen.has(it.zh)) return false;
      seen.add(it.zh);
      return true;
    });
    if (!uniqueInputs.length) {
      console.log(`  ⊘ ${unitKey} — no vocab/phrases in exam_*`);
      return;
    }

    let aiOut;
    try {
      aiOut = await callAI(uniqueInputs, examUnit.sub_title_zh || examUnit.title_zh);
    } catch (e) {
      console.log(`  ✗ ${unitKey} AI failed: ${e.message}`);
      return;
    }

    // Build vocab_cache items
    const items = uniqueInputs.map((it, i) => {
      const r = aiOut.find(x => x.i === i) || aiOut[i] || {};
      return {
        char:      it.zh,
        pinyin:    r.pinyin     || '',
        meaning:   r.meaning    || '',
        example:   r.example_zh || it.exZh || '',
        exPinyin:  r.exPinyin   || '',
        exMeaning: r.exMeaning  || '',
        level:     'B1/B2',
      };
    });

    if (DRY_RUN) {
      console.log(`  [dry] ${unitKey} ${examUnit.sub_title_zh}: ${items.length} items, ${lessons.length} lessons`);
      if (unitKey === [...byUnit.keys()][0]) {
        items.slice(0, 3).forEach(it => console.log(`    ${it.char} (${it.pinyin}) → ${it.meaning}`));
      }
      return;
    }

    // INSERT vocab_cache + flashcard_templates per lesson in this unit
    let savedLessons = 0, savedFc = 0;
    for (const lesson of lessons) {
      const { error: vErr } = await db.from('vocab_cache')
        .upsert({ lesson_id: lesson.id, items }, { onConflict: 'lesson_id' });
      if (vErr) { console.log(`  ✗ ${unitKey} cache lesson ${lesson.id}: ${vErr.message}`); continue; }
      savedLessons++;

      // Flashcards: one row per item per lesson (skip if already exists)
      const { data: fcExist } = await db.from('flashcard_templates')
        .select('id', { count: 'exact', head: true }).eq('lesson_id', lesson.id).eq('book_name', bookName);
      if (fcExist && fcExist.length) continue; // assume already populated
      const fcRows = items.map((it, i) => ({
        book_name:    bookName,
        lesson_id:    lesson.id,
        lesson_title: lesson.title,
        char:         it.char,
        pinyin:       it.pinyin,
        meaning:      it.meaning,
        example_zh:   it.example,
        example_vi:   it.exMeaning,
        sort_order:   i,
        published:    true,
      }));
      // Chunk insert
      for (let i = 0; i < fcRows.length; i += 100) {
        const slice = fcRows.slice(i, i + 100);
        const { error } = await db.from('flashcard_templates').insert(slice);
        if (error) { console.log(`  ✗ ${unitKey} fc lesson ${lesson.id}: ${error.message}`); break; }
      }
      savedFc += fcRows.length;
    }

    okUnits++; totalItems += items.length * savedLessons; totalFc += savedFc;
    console.log(`  ✓ ${unitKey} ${examUnit.sub_title_zh}: ${items.length} items × ${savedLessons} lessons = ${savedFc} flashcards`);
  });

  return { ok: okUnits, items: totalItems, fc: totalFc };
}

// ─── Main ──────────────────────────────────────────────────────────────────
let grandUnits = 0, grandItems = 0, grandFc = 0;
for (const { name, examBookId, label } of BOOKS) {
  const r = await processBook(name, examBookId);
  if (r) { grandUnits += r.ok; grandItems += r.items; grandFc += r.fc; }
}
console.log(`\n✓ ${grandUnits} units processed · ${grandItems} vocab_cache items · ${grandFc} flashcard_templates rows`);
