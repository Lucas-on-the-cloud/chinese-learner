// AI service: calls server-side proxy /api/ai/chat. The OpenAI key lives
// in Vercel env (OPENAI_API_KEY) — browser never sees it. Users no longer
// need to enter their own key for AI features.
//
// Backwards-compat: keeps the same call() signature so vocab-manager.js,
// chat.js, etc. don't need code changes.
class AIService {
  constructor(config) {
    this.config = config; // kept for legacy callers; key is unused now
    this.endpoint = location.origin + '/api/ai/chat';
  }

  async call(systemPrompt, userMsg, maxTokens, chatMsgs, temperature = 0) {
    const msgs = [{ role: 'system', content: systemPrompt }];
    if (chatMsgs) msgs.push(...chatMsgs);
    else if (userMsg) msgs.push({ role: 'user', content: userMsg });

    const r = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: msgs,
        max_tokens: maxTokens || 2000,
        temperature,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) {
      const msg = typeof data.error === 'string' ? data.error : (data.error?.message || `HTTP ${r.status}`);
      throw new Error(msg);
    }
    return data.content || '';
  }
}
