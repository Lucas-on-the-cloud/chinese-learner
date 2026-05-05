// DRYRUN: AI vocab extraction mirroring the browser button "Phân tích & tạo từ vựng"
// (public/js/vocab-manager.js generate()). No DB write — only prints output for review.
//
// Usage:
//   node scripts/regen-reading-vocab-dryrun.mjs --key=sk-... [--book=B2|B2_READ] [--samples=8] [--model=gpt-4o-mini|gpt-4o]
import { createClient } from '@supabase/supabase-js';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true];
}));
const KEY = args.key;
const BOOK = args.book || 'B2';
const N = +(args.samples || 6);
const MODEL = args.model || 'gpt-4o-mini';
if (!KEY) { console.error('Missing --key=sk-...'); process.exit(1); }

const sb = createClient('https://prctmferugkxabyizslx.supabase.co','sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ');

// EXACT prompt from public/js/vocab-manager.js (lines 105-123)
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
  return `Bài đọc tiếng Trung:\n${zh}\n\nPinyin:\n${py}\n\nDịch tiếng Việt:\n${vi}\n\nHãy tạo 15-25 từ/cụm từ THIẾT YẾU giúp hiểu ngữ cảnh bài. JSON thuần.`;
}

async function aiCall(zh, py, vi) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3500,
      temperature: 0.3,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: buildUserMsg(zh, py, vi) },
      ],
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j.choices?.[0]?.message?.content || '';
}

console.log(`\n═══ DRYRUN · book=${BOOK} · model=${MODEL} · samples=${N} ═══`);

// Pick lessons that have all 3 fields populated
const { data: pool, error } = await sb.from('lessons')
  .select('id, title, chinese, pinyin, vietnamese')
  .eq('book', BOOK);
if (error) { console.error(error); process.exit(1); }
const ready = (pool || []).filter(l =>
  (l.chinese||'').trim().length > 30 &&
  (l.pinyin||'').trim().length > 30 &&
  (l.vietnamese||'').trim().length > 20
);
console.log(`Pool: ${pool.length} total · ${ready.length} have all 3 fields populated\n`);

// Random sample
for (let i = ready.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [ready[i],ready[j]]=[ready[j],ready[i]]; }
const sample = ready.slice(0, N);

let totalIn = 0, totalOut = 0;
for (let i = 0; i < sample.length; i++) {
  const l = sample[i];
  console.log(`\n[${i+1}/${sample.length}] id=${l.id} · "${l.title}"`);
  console.log(`  Passage preview: ${(l.chinese||'').slice(0,80).replace(/\n/g,' ')}…`);
  // Compare with existing vocab_cache
  const { data: cache } = await sb.from('vocab_cache').select('items').eq('lesson_id', l.id).maybeSingle();
  const existing = (cache?.items || []).map(x => x.zh || x.char).slice(0, 8).join(' / ');
  console.log(`  Current vocab (first 8): ${existing || '(none)'}`);

  try {
    const t0 = Date.now();
    const raw = await aiCall(l.chinese, l.pinyin, l.vietnamese);
    const dt = Date.now() - t0;
    const cleaned = raw.trim().replace(/^```json\s*/, '').replace(/\s*```\s*$/, '');
    const parsed = JSON.parse(cleaned);
    console.log(`  ✓ AI returned ${parsed.length} items (${(dt/1000).toFixed(1)}s)`);
    parsed.slice(0, 12).forEach((w, idx) => {
      console.log(`    ${String(idx+1).padStart(2)}. ${w.char.padEnd(8)} [${(w.pinyin||'').padEnd(20)}] ${w.meaning} ${w.level ? '· '+w.level : ''}`);
      if (w.example) console.log(`        ex: ${w.example} → ${w.exMeaning || ''}`);
    });
    if (parsed.length > 12) console.log(`    … (+${parsed.length-12} more)`);
  } catch (e) {
    console.log(`  ✗ ${e.message}`);
  }
}

// Rough cost estimate
const fullCost = MODEL.includes('mini')
  ? `~$${(ready.length * 0.005).toFixed(2)}`
  : `~$${(ready.length * 0.05).toFixed(2)}`;
console.log(`\n═══ Done · estimated full-run cost (${ready.length} lessons): ${fullCost} ═══`);
