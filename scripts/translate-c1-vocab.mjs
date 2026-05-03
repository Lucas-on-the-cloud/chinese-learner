// For each TOCFL_C1 flashcard:
//   1. Translate `meaning` (currently 中文釋義) → Vietnamese
//   2. Generate `exPinyin` for example_zh
//   3. Translate example_zh → Vietnamese (exMeaning)
//
// Then:
//   - UPDATE flashcard_templates: set meaning=vi_meaning, example_vi=vi_example
//   - UPSERT vocab_cache: lesson_id → items[] for the reading page vocab section
//
// Run: node scripts/translate-c1-vocab.mjs --key=sk-...

import { createClient } from '@supabase/supabase-js';

const argKey  = process.argv.find(a => a.startsWith('--key='))?.slice(6);
const API_KEY = argKey || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
if (!API_KEY) { console.error('✗ Missing API key'); process.exit(1); }

const PROVIDER = API_KEY.startsWith('sk-ant-') ? 'anthropic' : 'openai';
const MODEL    = PROVIDER === 'anthropic' ? 'claude-sonnet-4-5-20250929' : 'gpt-4o-mini';
const DRY_RUN  = process.argv.includes('--dry');
const ONLY_LESSON = process.argv.find(a => a.startsWith('--lesson='))?.slice(9);

console.log(`Provider: ${PROVIDER} · Model: ${MODEL}${DRY_RUN ? ' [DRY]' : ''}`);

const db = createClient(
  'https://prctmferugkxabyizslx.supabase.co',
  'sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ'
);

// ─── Load flashcards grouped by lesson_id ───────────────────────────────────
let q = db.from('flashcard_templates')
  .select('id,lesson_id,lesson_title,char,pinyin,meaning,example_zh,example_vi,sort_order')
  .eq('book_name', 'TOCFL_C1').order('lesson_id').order('sort_order');
if (ONLY_LESSON) q = q.eq('lesson_id', ONLY_LESSON);
const { data: cards, error } = await q;
if (error) { console.error('✗', error); process.exit(1); }

const byLesson = new Map();
cards.forEach(c => {
  if (!byLesson.has(c.lesson_id)) byLesson.set(c.lesson_id, []);
  byLesson.get(c.lesson_id).push(c);
});
console.log(`${cards.length} flashcards across ${byLesson.size} lessons`);

// ─── Prompt ────────────────────────────────────────────────────────────────
const SYSTEM = `Bạn là dịch giả TOCFL chuyên nghiệp, dịch tiếng Trung phồn thể (繁體中文 Đài Loan) sang tiếng Việt.

Cho danh sách từ vựng kèm định nghĩa Hán và câu ví dụ tiếng Trung, trả về JSON dạng:
[
  { "i": 0, "meaning": "nghĩa tiếng Việt", "exPinyin": "pinyin câu ví dụ", "exMeaning": "dịch câu ví dụ" },
  ...
]

Quy tắc:
- "meaning": dịch ngắn gọn (3-12 từ), giữ ý chính của định nghĩa Hán.
- "exPinyin": pinyin có dấu thanh (ā á ǎ à), viết liền theo từ, dấu câu giữ nguyên.
- "exMeaning": dịch câu ví dụ tự nhiên, mượt mà.
- Trả về MẢNG JSON đúng số lượng, theo đúng thứ tự đầu vào.
- "i" là index 0-based trong mảng — phải khớp.
- CHỈ xuất JSON hợp lệ, không markdown wrapper.`;

function buildUserMsg(cards) {
  const lines = cards.map((c, i) =>
    `${i}. char="${c.char}" pinyin="${c.pinyin}" defZh="${c.meaning}" exZh="${c.example_zh}"`
  ).join('\n');
  return `Dịch ${cards.length} từ vựng sau:\n\n${lines}\n\nTrả về JSON object: {"items":[...]} với mảng items đúng ${cards.length} phần tử.`;
}

// ─── API call ──────────────────────────────────────────────────────────────
async function callAI(cards) {
  let url, headers, body, extractText;
  if (PROVIDER === 'anthropic') {
    url = 'https://api.anthropic.com/v1/messages';
    headers = { 'Content-Type':'application/json', 'x-api-key': API_KEY, 'anthropic-version':'2023-06-01' };
    body = { model: MODEL, max_tokens: 8000, temperature: 0, system: SYSTEM,
             messages: [{ role:'user', content: buildUserMsg(cards) }] };
    extractText = d => d.content[0].text;
  } else {
    url = 'https://api.openai.com/v1/chat/completions';
    headers = { 'Content-Type':'application/json', 'Authorization': 'Bearer '+API_KEY };
    body = { model: MODEL, max_tokens: 8000, temperature: 0,
             response_format: { type: 'json_object' },
             messages: [{ role:'system', content: SYSTEM }, { role:'user', content: buildUserMsg(cards) }] };
    extractText = d => d.choices[0].message.content;
  }

  const res = await fetch(url, { method:'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  let text = extractText(data).trim()
    .replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(text);
  const items = Array.isArray(parsed) ? parsed : (parsed.items || parsed.results || []);
  if (!Array.isArray(items)) throw new Error('Response is not array: ' + text.slice(0, 200));
  return items;
}

// ─── Process each lesson ───────────────────────────────────────────────────
let okCount = 0, failCount = 0;
let i = 0;
for (const [lessonId, lessonCards] of byLesson) {
  i++;
  const tag = `[${i}/${byLesson.size}] lesson=${lessonId} ${lessonCards[0].lesson_title} (${lessonCards.length} từ)`;
  process.stdout.write(`${tag} … `);

  try {
    const t0 = Date.now();
    const items = await callAI(lessonCards);
    const dt = ((Date.now() - t0) / 1000).toFixed(1);

    if (items.length !== lessonCards.length) {
      throw new Error(`got ${items.length} items, expected ${lessonCards.length}`);
    }

    // Build cache items + flashcard updates
    const cacheItems = lessonCards.map((c, idx) => {
      const r = items.find(x => x.i === idx) || items[idx];
      return {
        char:      c.char,
        pinyin:    c.pinyin,
        meaning:   r.meaning   || '',
        example:   c.example_zh,
        exPinyin:  r.exPinyin  || '',
        exMeaning: r.exMeaning || '',
        level:     'C1',
      };
    });

    process.stdout.write(`${dt}s `);

    if (DRY_RUN) {
      console.log('[dry]');
      console.log('   first item:', JSON.stringify(cacheItems[0], null, 2));
    } else {
      // 1. Upsert vocab_cache
      const { error: cerr } = await db.from('vocab_cache')
        .upsert({ lesson_id: lessonId, items: cacheItems }, { onConflict: 'lesson_id' });
      if (cerr) throw cerr;

      // 2. Update flashcard_templates per row (set meaning + example_vi)
      for (let k = 0; k < lessonCards.length; k++) {
        const card = lessonCards[k];
        const cacheItem = cacheItems[k];
        const { error: uerr } = await db.from('flashcard_templates')
          .update({ meaning: cacheItem.meaning, example_vi: cacheItem.exMeaning })
          .eq('id', card.id);
        if (uerr) throw uerr;
      }
      console.log('✓');
    }
    okCount++;
  } catch (e) {
    console.log(`✗ ${e.message.slice(0, 200)}`);
    failCount++;
  }
}

console.log(`\n${okCount} ok · ${failCount} failed`);
