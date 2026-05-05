// Server-side proxy: AI vocab extraction for reading lessons.
// Holds OPENAI_API_KEY in Vercel env, never exposes to browser.
//
// Browser POSTs:
//   { lesson: { chinese: "...", pinyin: "...", vietnamese: "..." } }
// Returns:
//   { items: [{ char, pinyin, meaning, example, exPinyin, exMeaning, level }, ...] }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not configured on server' });

  const { lesson } = req.body || {};
  if (!lesson?.chinese?.trim()) return res.status(400).json({ error: 'lesson.chinese is required' });

  // Sanity caps to limit abuse
  const zh = String(lesson.chinese || '').slice(0, 20000);
  const py = String(lesson.pinyin || '').slice(0, 20000);
  const vi = String(lesson.vietnamese || '').slice(0, 20000);

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

  const userMsg = `Bài đọc tiếng Trung:\n${zh}\n\nPinyin:\n${py}\n\nDịch tiếng Việt:\n${vi}\n\nHãy tạo 15-25 từ/cụm từ THIẾT YẾU giúp hiểu ngữ cảnh bài. JSON thuần.`;

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 3500,
        temperature: 0.3,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userMsg },
        ],
      }),
    });
    const j = await r.json();
    if (j.error) return res.status(502).json({ error: 'OpenAI: ' + j.error.message });
    const raw = j.choices?.[0]?.message?.content || '';
    const cleaned = raw.trim().replace(/^```json\s*/, '').replace(/\s*```\s*$/, '');
    let items;
    try { items = JSON.parse(cleaned); }
    catch (e) { return res.status(502).json({ error: 'AI returned invalid JSON' }); }
    if (!Array.isArray(items) || items.length < 5)
      return res.status(502).json({ error: 'AI returned too few items' });
    return res.status(200).json({ items });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
