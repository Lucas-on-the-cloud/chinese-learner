// Generate pinyin + Vietnamese translation for all TOCFL_C1 lesson bodies,
// then update the `lessons` table.
//
// Supports both Anthropic Claude AND OpenAI (auto-detected from key prefix).
//
// Run:  node scripts/translate-c1.mjs --key=sk-ant-...      # Claude
//   or: node scripts/translate-c1.mjs --key=sk-...          # OpenAI
//   or: ANTHROPIC_API_KEY=... node scripts/translate-c1.mjs
//   or: OPENAI_API_KEY=...    node scripts/translate-c1.mjs
//
// Cost estimate: ~17 articles × ~1.5K i/o tokens
//   Claude Sonnet 4.5 : ~$0.10–0.20 total
//   GPT-4o-mini       : ~$0.02–0.05 total

import { createClient } from '@supabase/supabase-js';

// ─── Config ─────────────────────────────────────────────────────────────────
const argKey   = process.argv.find(a => a.startsWith('--key='))?.slice(6);
const API_KEY  = argKey || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error('✗ Missing API key. Set ANTHROPIC_API_KEY or OPENAI_API_KEY env var, or pass --key=...');
  process.exit(1);
}

// Auto-detect provider from key prefix (or override with --provider=openai|anthropic)
const argProv = process.argv.find(a => a.startsWith('--provider='))?.slice(11);
const PROVIDER = argProv || (API_KEY.startsWith('sk-ant-') ? 'anthropic' : 'openai');

const argModel = process.argv.find(a => a.startsWith('--model='))?.slice(8);
const MODEL = argModel || (PROVIDER === 'anthropic' ? 'claude-sonnet-4-5-20250929' : 'gpt-4o-mini');

const DRY_RUN  = process.argv.includes('--dry');
const FORCE    = process.argv.includes('--force'); // re-translate even if pinyin/vi already filled
const ONLY_ID  = process.argv.find(a => a.startsWith('--only='))?.slice(7);
const ONLY_IDS = process.argv.find(a => a.startsWith('--ids='))?.slice(6); // comma-separated

console.log(`Provider: ${PROVIDER} · Model: ${MODEL}`);

const db = createClient(
  'https://prctmferugkxabyizslx.supabase.co',
  'sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ'
);

// ─── Load lessons that still need translation ───────────────────────────────
let q = db.from('lessons').select('id,title,chinese,pinyin,vietnamese')
  .eq('book', 'TOCFL_C1').order('id');
if (ONLY_ID) q = q.eq('id', ONLY_ID);
else if (ONLY_IDS) q = q.in('id', ONLY_IDS.split(',').map(s => s.trim()));
const { data: lessons, error } = await q;
if (error) { console.error('✗', error); process.exit(1); }

const todo = FORCE ? lessons : lessons.filter(l => !l.pinyin?.trim() || !l.vietnamese?.trim());
console.log(`${lessons.length} TOCFL_C1 lessons · ${todo.length} need translation${DRY_RUN ? ' [DRY RUN]' : ''}`);

if (!todo.length) { console.log('✓ Nothing to do.'); process.exit(0); }

// ─── Prompt ────────────────────────────────────────────────────────────────
const SYSTEM = `Bạn là dịch giả TOCFL chuyên nghiệp, dịch tiếng Trung phồn thể (繁體中文 Đài Loan) sang tiếng Việt cho học viên trình độ C1.

Nhiệm vụ cho MỘT đoạn văn:
1. Tạo phiên âm Hán Việt (pinyin có dấu thanh: ā á ǎ à) — viết liền theo từ, dấu câu giữ nguyên (。，「」？！).
2. Dịch sang tiếng Việt tự nhiên, mượt mà, giữ ý gốc, phù hợp học viên C1.

CHỈ xuất JSON hợp lệ:
{"pinyin": "...", "vietnamese": "..."}`;

function userMsg(zh) {
  return `Đoạn văn:\n\n${zh}`;
}

// ─── API call ──────────────────────────────────────────────────────────────
async function callAI(zh) {
  let url, headers, body, extractText;

  if (PROVIDER === 'anthropic') {
    url     = 'https://api.anthropic.com/v1/messages';
    headers = {
      'Content-Type':      'application/json',
      'x-api-key':         API_KEY,
      'anthropic-version': '2023-06-01',
    };
    body = {
      model:       MODEL,
      max_tokens:  8000,
      temperature: 0,
      system:      SYSTEM,
      messages:    [{ role: 'user', content: userMsg(zh) }],
    };
    extractText = data => data.content[0].text;
  } else {
    url     = 'https://api.openai.com/v1/chat/completions';
    headers = {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + API_KEY,
    };
    body = {
      model:       MODEL,
      max_tokens:  8000,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user',   content: userMsg(zh) },
      ],
    };
    extractText = data => data.choices[0].message.content;
  }

  const res = await fetch(url, {
    method:  'POST',
    headers,
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt}`);
  }
  const data = await res.json();
  let text = extractText(data).trim();
  text = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(text);
  if (!parsed.pinyin || !parsed.vietnamese) throw new Error('Missing keys in response: ' + text.slice(0, 200));
  return parsed;
}

// Retry wrapper: 3 attempts with exponential backoff for transient errors.
async function callAIRetry(p, attempt = 1) {
  try {
    const r = await callAI(p);
    if (!r.pinyin?.trim() || !r.vietnamese?.trim()) {
      throw new Error('empty response');
    }
    return r;
  } catch (e) {
    if (attempt >= 3) throw e;
    await new Promise(r => setTimeout(r, 1000 * attempt));
    return callAIRetry(p, attempt + 1);
  }
}

// Translate one lesson: split into paragraphs, call AI per paragraph in parallel.
// This guarantees N-paragraph in == N-paragraph out (no merging).
async function translateLesson(zh) {
  const paras = zh.split(/\n\s*\n/).filter(p => p.trim());
  const results = await Promise.all(paras.map(async (p, idx) => {
    try { return await callAIRetry(p); }
    catch (e) { throw new Error(`para ${idx + 1}: ${e.message}`); }
  }));
  return {
    pinyin:     results.map(r => r.pinyin).join('\n\n'),
    vietnamese: results.map(r => r.vietnamese).join('\n\n'),
    paraCount:  paras.length,
  };
}

// ─── Process loop ──────────────────────────────────────────────────────────
let success = 0, failed = 0;
for (let i = 0; i < todo.length; i++) {
  const lesson = todo[i];
  const tag = `[${i + 1}/${todo.length}] id=${lesson.id} ${lesson.title}`;
  process.stdout.write(`${tag} … `);

  try {
    const t0 = Date.now();
    const { pinyin, vietnamese, paraCount } = await translateLesson(lesson.chinese);
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    process.stdout.write(`${dt}s · ${paraCount} paras `);

    if (DRY_RUN) {
      console.log('[dry]');
      console.log('   pinyin[0:120]:', pinyin.slice(0, 120));
      console.log('   vietnamese[0:120]:', vietnamese.slice(0, 120));
    } else {
      const { error: uerr } = await db.from('lessons')
        .update({ pinyin, vietnamese })
        .eq('id', lesson.id);
      if (uerr) throw uerr;
      console.log('✓');
    }
    success++;
  } catch (e) {
    console.log(`✗ ${e.message}`);
    failed++;
  }
}

console.log(`\n${success} ok · ${failed} failed`);
