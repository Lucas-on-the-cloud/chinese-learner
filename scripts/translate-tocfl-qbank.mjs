// Translate qbank data (tocfl_groups, tocfl_questions, tocfl_options) from
// Traditional Chinese (繁體中文 Taiwan) to Vietnamese, storing results in
// shared_text_vi / question_text_vi / text_vi columns.
//
// Prerequisites:
//   1. Run sql/022_tocfl_qbank_vi.sql in Supabase SQL editor first.
//   2. Set ANTHROPIC_API_KEY env var (or pass --key=sk-ant-...).
//
// Usage:
//   node scripts/translate-tocfl-qbank.mjs
//   node scripts/translate-tocfl-qbank.mjs --table=groups
//   node scripts/translate-tocfl-qbank.mjs --table=questions
//   node scripts/translate-tocfl-qbank.mjs --table=options
//   node scripts/translate-tocfl-qbank.mjs --dry --limit=5
//   node scripts/translate-tocfl-qbank.mjs --force     # re-translate already-done rows
//
// Cost estimate (claude-haiku-4-5):
//   ~571 passages + 1353 questions + 7438 options ≈ $0.30–$0.60 total

import { getClient } from './_supabase.mjs';

const API_KEY = process.argv.find(a => a.startsWith('--key='))?.slice(6)
  || process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('✗ Set ANTHROPIC_API_KEY or pass --key=sk-ant-...');
  process.exit(1);
}

const MODEL   = process.argv.find(a => a.startsWith('--model='))?.slice(8) || 'claude-haiku-4-5-20251001';
const DRY     = process.argv.includes('--dry');
const FORCE   = process.argv.includes('--force');
const LIMIT   = parseInt(process.argv.find(a => a.startsWith('--limit='))?.slice(8) || '0');
const TABLE   = process.argv.find(a => a.startsWith('--table='))?.slice(8); // groups|questions|options
const CONCUR  = parseInt(process.argv.find(a => a.startsWith('--concur='))?.slice(9) || '5');
const BATCH   = parseInt(process.argv.find(a => a.startsWith('--batch='))?.slice(8) || '20');

const db = getClient({ writes: !DRY });

// ── Claude API ───────────────────────────────────────────────────────────────
async function claudeTranslateBatch(items) {
  // items: [{id, text}, ...]
  // Returns: {[id]: translatedText}
  const inputObj = Object.fromEntries(items.map(i => [i.id, i.text]));
  const userMsg = JSON.stringify(inputObj, null, 0);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: 4096,
      temperature: 0,
      system: `Bạn là dịch giả chuyên nghiệp dịch tiếng Trung phồn thể (繁體中文 Đài Loan) sang tiếng Việt tự nhiên, mượt mà cho học viên học TOCFL.
Dịch chính xác, giữ nguyên dấu câu và cấu trúc. Không giải thích thêm.
Nhận vào một JSON object {"id": "bản tiếng Trung", ...}.
Trả về ĐÚNG định dạng JSON: {"id": "bản dịch tiếng Việt", ...}
Không thêm markdown, không thêm bất kỳ văn bản nào ngoài JSON.`,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  let raw = data.content[0].text.trim();
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(raw);
}

// Retry wrapper
async function translateBatchRetry(items, attempt = 1) {
  try {
    return await claudeTranslateBatch(items);
  } catch (e) {
    if (attempt >= 3) throw e;
    await new Promise(r => setTimeout(r, 1500 * attempt));
    return translateBatchRetry(items, attempt + 1);
  }
}

// ── Process a table ──────────────────────────────────────────────────────────
async function processTable({ table, srcCol, dstCol, label }) {
  console.log(`\n── ${label} ──`);

  let q = db.from(table)
    .select(`id, ${srcCol}`)
    .not(srcCol, 'is', null)
    .neq(srcCol, '');
  if (!FORCE) q = q.is(dstCol, null);
  if (LIMIT)  q = q.limit(LIMIT);

  const { data: rows, error } = await q;
  if (error) { console.error('✗ fetch error:', error.message); return; }

  const todo = (rows || []).filter(r => r[srcCol]?.trim());
  console.log(`  ${todo.length} rows to translate${DRY ? ' [DRY RUN]' : ''}`);
  if (!todo.length) return;

  // Split into batches
  const batches = [];
  for (let i = 0; i < todo.length; i += BATCH) {
    batches.push(todo.slice(i, i + BATCH));
  }

  let done = 0, failed = 0;
  // Process batches with limited concurrency
  for (let i = 0; i < batches.length; i += CONCUR) {
    const chunk = batches.slice(i, i + CONCUR);
    await Promise.all(chunk.map(async (batch) => {
      const items = batch.map(r => ({ id: String(r.id), text: r[srcCol] }));
      try {
        const translated = await translateBatchRetry(items);
        if (DRY) {
          const sample = items[0];
          console.log(`  [dry] id=${sample.id}: ${sample.text.slice(0, 40)} → ${(translated[sample.id] || '').slice(0, 40)}`);
          done += batch.length;
          return;
        }
        // Update DB in one batch
        for (const row of batch) {
          const vi = translated[String(row.id)];
          if (!vi?.trim()) { console.warn(`  ⚠ no translation for id=${row.id}`); failed++; continue; }
          const { error: uerr } = await db.from(table).update({ [dstCol]: vi }).eq('id', row.id);
          if (uerr) { console.error(`  ✗ update id=${row.id}:`, uerr.message); failed++; }
          else done++;
        }
      } catch (e) {
        console.error(`  ✗ batch error:`, e.message);
        failed += batch.length;
      }
    }));
    process.stdout.write(`  ${Math.min(i + CONCUR, batches.length) * BATCH}/${todo.length} …\r`);
  }
  console.log(`  ✓ ${done} translated · ${failed} failed          `);
}

// ── Main ─────────────────────────────────────────────────────────────────────
console.log(`Model: ${MODEL} · Batch: ${BATCH} · Concur: ${CONCUR}${DRY ? ' · DRY RUN' : ''}${FORCE ? ' · FORCE' : ''}`);

const tables = [
  { table: 'tocfl_groups',    srcCol: 'shared_text',   dstCol: 'shared_text_vi',   label: 'Groups (passages)' },
  { table: 'tocfl_questions', srcCol: 'question_text', dstCol: 'question_text_vi', label: 'Questions' },
  { table: 'tocfl_options',   srcCol: 'text',          dstCol: 'text_vi',          label: 'Options' },
].filter(t => !TABLE || t.table === `tocfl_${TABLE}` || t.table.endsWith(`_${TABLE}`));

for (const t of tables) {
  await processTable(t);
}

console.log('\nDone.');
