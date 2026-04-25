class AIService {
  constructor(config) {
    this.config = config;
    this.proxyUrl = location.protocol === 'file:' ? null : location.origin + '/api/proxy';
  }

  async call(systemPrompt, userMsg, maxTokens, chatMsgs) {
    const p = this.config.getProvider();
    const k = this.config.getKey();
    if (!k) return null;

    let reqBody;
    if (p === 'anthropic') {
      reqBody = { model: 'claude-sonnet-4-6', max_tokens: maxTokens || 1800, system: systemPrompt };
      reqBody.messages = chatMsgs || [{ role: 'user', content: userMsg }];
    } else {
      const msgs = [{ role: 'system', content: systemPrompt }];
      if (chatMsgs) msgs.push(...chatMsgs);
      else msgs.push({ role: 'user', content: userMsg });
      reqBody = { model: 'gpt-4o-mini', max_tokens: maxTokens || 1800, messages: msgs };
    }

    let data;
    if (this.proxyUrl) {
      const r = await fetch(this.proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: p, apiKey: k, body: reqBody })
      });
      data = await r.json();
      if (data.error) throw new Error(typeof data.error === 'object' ? JSON.stringify(data.error) : data.error);
    } else {
      let url, headers;
      if (p === 'anthropic') {
        url = 'https://api.anthropic.com/v1/messages';
        headers = {
          'Content-Type': 'application/json',
          'x-api-key': k,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        };
      } else {
        url = 'https://api.openai.com/v1/chat/completions';
        headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + k };
      }
      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(reqBody) });
      data = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(data));
    }

    return p === 'anthropic' ? data.content[0].text : data.choices[0].message.content;
  }

  // Streaming version — calls onChunk(text) for each delta, returns full text
  async callStream(systemPrompt, userMsg, maxTokens, chatMsgs, onChunk) {
    const p = this.config.getProvider();
    const k = this.config.getKey();
    if (!k) return '';

    let reqBody;
    if (p === 'anthropic') {
      reqBody = { model: 'claude-sonnet-4-6', max_tokens: maxTokens || 1800, system: systemPrompt, stream: true };
      reqBody.messages = chatMsgs || [{ role: 'user', content: userMsg }];
    } else {
      const msgs = [{ role: 'system', content: systemPrompt }];
      if (chatMsgs) msgs.push(...chatMsgs);
      else msgs.push({ role: 'user', content: userMsg });
      reqBody = { model: 'gpt-4o-mini', max_tokens: maxTokens || 1800, messages: msgs, stream: true };
    }

    const targetUrl = this.proxyUrl || (p === 'anthropic'
      ? 'https://api.anthropic.com/v1/messages'
      : 'https://api.openai.com/v1/chat/completions');

    const fetchHeaders = this.proxyUrl
      ? { 'Content-Type': 'application/json' }
      : p === 'anthropic'
        ? { 'Content-Type': 'application/json', 'x-api-key': k, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
        : { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + k };

    const fetchBody = this.proxyUrl
      ? JSON.stringify({ provider: p, apiKey: k, body: reqBody })
      : JSON.stringify(reqBody);

    const r = await fetch(targetUrl, { method: 'POST', headers: fetchHeaders, body: fetchBody });
    if (!r.ok) throw new Error(await r.text());

    const reader  = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = '';
    let full      = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line for next round

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (raw === '[DONE]') continue;
        try {
          const evt = JSON.parse(raw);
          let chunk = '';
          if (p === 'anthropic' && evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta')
            chunk = evt.delta.text;
          else if (p === 'openai')
            chunk = evt.choices?.[0]?.delta?.content || '';
          if (chunk) { full += chunk; onChunk(chunk); }
        } catch {}
      }
    }
    return full;
  }
}
