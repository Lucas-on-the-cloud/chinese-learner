// Server-side proxy: generic AI chat completion (used by chat-with-passage feature
// in reading.html, and any future free-form AI calls).
//
// Browser POSTs:
//   { messages: [{role,content},...], model?, max_tokens?, temperature? }
// Returns:
//   { content: "...", usage: {...} }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not configured on server' });

  const {
    messages,
    model = 'gpt-4o-mini',
    max_tokens = 2000,
    temperature = 0.4,
  } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0)
    return res.status(400).json({ error: 'messages array required' });

  // Sanity caps to limit abuse
  const totalLen = messages.reduce((acc, m) => acc + (typeof m?.content === 'string' ? m.content.length : 0), 0);
  if (totalLen > 50_000) return res.status(400).json({ error: 'input too large (>50k chars)' });

  const ALLOWED_MODELS = new Set(['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini']);
  const safeModel  = ALLOWED_MODELS.has(model) ? model : 'gpt-4o-mini';
  const safeMaxTok = Math.min(Math.max(50, +max_tokens || 2000), 4000);
  const safeTemp   = Math.min(Math.max(0, +temperature ?? 0.4), 1.5);

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ model: safeModel, messages, max_tokens: safeMaxTok, temperature: safeTemp }),
    });
    const j = await r.json();
    if (j.error) return res.status(502).json({ error: 'OpenAI: ' + j.error.message });
    return res.status(200).json({
      content: j.choices?.[0]?.message?.content || '',
      usage: j.usage || null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
