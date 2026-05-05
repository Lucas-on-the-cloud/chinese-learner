// Full regen: AI vocab extraction mirroring the browser button "Phân tích & tạo từ vựng"
// (public/js/vocab-manager.js generate()). Writes vocab_cache + replaces flashcard_templates per lesson.
//
// Filter: any lesson with non-empty `chinese` field (browser-equivalent).
// Idempotent per lesson: each lesson is upsert/replace; partial run is safe.
//
// Usage:
//   node scripts/regen-reading-vocab-full.mjs --key=sk-... [--book=B2|B2_READ|all] [--concurrency=6] [--limit=N] [--model=gpt-4o-mini] [--ids=1,2,3]
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true];
}));
const KEY = args.key;
const BOOK = args.book || 'all';
const CONC = +(args.concurrency || 6);
const LIMIT = args.limit ? +args.limit : Infinity;
const MODEL = args.model || 'gpt-4o-mini';
if (!KEY) { console.error('Missing --key=sk-...'); process.exit(1); }

// Read service_role key from .env.local (RLS bypass for writes)
let SUPABASE_KEY = 'sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ'; // fallback to anon
try {
  const env = fs.readFileSync('.env.local', 'utf8');
  const m = env.match(/^SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.+)$/m);
  if (m) {
    SUPABASE_KEY = m[1].trim().replace(/^["']|["']$/g, '');
    console.log('Using SUPABASE_SERVICE_ROLE_KEY from .env.local');
  } else {
    console.warn('⚠ No SUPABASE_SERVICE_ROLE_KEY in .env.local — falling back to anon (writes may fail under RLS)');
  }
} catch {
  console.warn('⚠ .env.local not found — falling back to anon');
}
const sb = createClient('https://prctmferugkxabyizslx.supabase.co', SUPABASE_KEY);

const SYSTEM_PROMPT = `Bạn là giáo viên tiếng Trung phồn thể Đài Loan (繁體中文，台灣) chuyên giúp người Việt đọc hiểu. Nhiệm vụ: phân tích bài đọc và tạo danh sách 15-25 từ/cụm từ THIẾT YẾU để học viên nắm được ngữ cảnh, nhân vật, tình huống và thông điệp của bài TRƯỚC KHI đọc.

NGUYÊN TẮC BẮT BUỘC:
- Chỉ chọn từ/cụm từ có TỪ 2 CHỮ TRỞ LÊN. Tuyệt đối không chọn từ đơn 1 chữ.
- Tập trung vào 3 loại từ cấu thành câu chuyện:
  * CHỦ NGỮ (名詞/danh từ chỉ người, sự vật, khái niệm trung tâm của bài)
  * ĐỘNG TỪ / CỤM ĐỘNG TỪ (động từ hành động hoặc trạng thái quyết định diễn biến câu chuyện)
  * TÂN NGỮ (đối tượng bị tác động, kết quả, mục tiêu trong bài)
- Ưu tiên thành ngữ, cụm cố định, collocations xuất hiện trong bài
- KHÔNG chọn: từ hư (的、了、在、是、也、都), từ quá cơ bản mà người học trung cấp đã biết

Yêu cầu bắt buộc:
- Số lượng: 15-25 mục
- example PHẢI là câu/cụm NGUYÊN VĂN từ bài đọc chứa từ đó
- exMeaning giải thích nghĩa trong ngữ cảnh câu, không chỉ dịch từng chữ

Trả về JSON thuần (KHÔNG markdown, KHÔNG giải thích):
[{"char":"生活習慣","pinyin":"shēnghuó xíguàn","meaning":"thói quen sinh hoạt","example":"大學生的生活習慣普通不是很好","exPinyin":"dàxuéshēng de shēnghuó xíguàn pǔtōng bù shì hěn hǎo","exMeaning":"Thói quen sinh hoạt của sinh viên thường không tốt","level":"trung cấp"}]
level: "cơ bản" / "trung cấp" / "nâng cao"`;

function buildUserMsg(zh, py, vi) {
  return `Bài đọc tiếng Trung:\n${zh || ''}\n\nPinyin:\n${py || ''}\n\nDịch tiếng Việt:\n${vi || ''}\n\nHãy tạo 15-25 từ/cụm từ THIẾT YẾU giúp hiểu ngữ cảnh bài. JSON thuần.`;
}

async function aiCall(zh, py, vi) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
      body: JSON.stringify({
        model: MODEL, max_tokens: 3500, temperature: 0.3,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: buildUserMsg(zh, py, vi) },
        ],
      }),
    });
    const j = await res.json();
    if (j.error) {
      if (j.error.code === 'rate_limit_exceeded' || res.status === 429) {
        const m = /try again in (\d+(?:\.\d+)?)\s*(ms|s)/i.exec(j.error.message || '');
        const wait = m ? (m[2] === 'ms' ? +m[1] : +m[1]*1000) + 500 : 3000*(attempt+1);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw new Error(j.error.message);
    }
    return j.choices?.[0]?.message?.content || '';
  }
  throw new Error('rate limit retries exhausted');
}

async function processOne(lesson) {
  const raw = await aiCall(lesson.chinese, lesson.pinyin, lesson.vietnamese);
  const cleaned = raw.trim().replace(/^```json\s*/, '').replace(/\s*```\s*$/, '');
  const items = JSON.parse(cleaned);
  if (!Array.isArray(items) || items.length < 5) throw new Error('parsed but only ' + (items?.length||0) + ' items');

  // 1. Upsert vocab_cache (cols: id, lesson_id, items, created_at)
  const { error: e1 } = await sb.from('vocab_cache').upsert(
    { lesson_id: lesson.id, items },
    { onConflict: 'lesson_id' }
  );
  if (e1) throw new Error('vocab_cache: ' + e1.message);

  // 2. Replace flashcard_templates for this lesson
  // Schema: book_name, lesson_id, lesson_title, char, pinyin, meaning, example_zh, example_vi, sort_order, published
  const { error: e2 } = await sb.from('flashcard_templates').delete().eq('lesson_id', lesson.id);
  if (e2) throw new Error('delete flashcards: ' + e2.message);
  const rows = items.map((w, idx) => ({
    book_name: lesson.book,
    lesson_id: lesson.id,
    lesson_title: lesson.title,
    char: w.char,
    pinyin: w.pinyin || '',
    meaning: w.meaning || '',
    example_zh: w.example || '',
    example_vi: w.exMeaning || '',
    sort_order: idx,
    published: true,
  }));
  for (let i = 0; i < rows.length; i += 50) {
    const { error: e3 } = await sb.from('flashcard_templates').insert(rows.slice(i, i+50));
    if (e3) throw new Error('insert flashcards: ' + e3.message);
  }
  return items.length;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0, done = 0;
  await Promise.all(Array.from({length: limit}, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = { ok: true, n: await fn(items[idx], idx) }; }
      catch (e) { out[idx] = { ok: false, err: e.message }; }
      done++;
      if (done % 5 === 0 || done === items.length) process.stdout.write(`\r  ${done}/${items.length}`);
    }
  }));
  process.stdout.write('\n');
  return out;
}

console.log(`\n═══ FULL REGEN · book=${BOOK} · model=${MODEL} · concurrency=${CONC} ═══`);

const ID_LIST = args.ids ? String(args.ids).split(',').map(s => +s.trim()).filter(Boolean) : null;
const books = BOOK === 'all' ? ['B2', 'B2_READ'] : [BOOK];
let grandTotal = 0, grandFailed = 0;

for (const bk of books) {
  console.log(`\n── ${bk} ──`);
  let q = sb.from('lessons')
    .select('id, title, book, chinese, pinyin, vietnamese')
    .eq('book', bk);
  if (ID_LIST) q = q.in('id', ID_LIST);
  const { data: pool } = await q;
  // Same filter as browser would skip — chinese must have content
  const ready = (pool || []).filter(l => (l.chinese || '').trim().length > 0).slice(0, LIMIT);
  console.log(`  ${pool.length} total · ${ready.length} have chinese content · processing…`);

  const results = await mapLimit(ready, CONC, processOne);
  const okCnt = results.filter(r => r?.ok).length;
  const failCnt = results.filter(r => !r?.ok).length;
  console.log(`  ✓ ${okCnt} ok · ✗ ${failCnt} failed`);
  results.forEach((r, i) => {
    if (!r.ok) console.log(`    ✗ id=${ready[i].id} "${ready[i].title.slice(0,50)}": ${r.err}`);
  });
  grandTotal += okCnt;
  grandFailed += failCnt;
}

console.log(`\n═══ Done · ${grandTotal} regenerated · ${grandFailed} failed ═══`);
