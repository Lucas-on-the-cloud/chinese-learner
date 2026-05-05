// Vercel cron: fetch latest Taiwan news every 3 days.
// Hobby plan cron runs daily; function self-throttles to once per 3 days.
// Limit to 2 articles per call to stay within Hobby 10s timeout.

import Parser from 'rss-parser';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { createClient } from '@supabase/supabase-js';

const SOURCES = [
  { id: 'cna',  name: '中央社',     rss: 'https://feeds.feedburner.com/rsscna/intworld' },
  { id: 'cna2', name: '中央社政治', rss: 'https://feeds.feedburner.com/rsscna/politics' },
  { id: 'pts',  name: '公視新聞',   rss: 'https://news.pts.org.tw/xml/newsfeed.xml' },
  { id: 'ltn',  name: '自由時報',   rss: 'https://news.ltn.com.tw/rss/all.xml' },
];

const SYSTEM_PROMPT = `Bạn là biên tập viên báo song ngữ Trung-Việt cho học viên TOCFL phồn thể (繁體中文 Đài Loan).
Cho 1 bài báo tiếng Trung với cấu trúc đoạn phân cách bằng \\n\\n. Trả JSON:
{"title_vi","content_vi","pinyin","category","vocab":[{"char","pinyin","meaning","example","exMeaning","level"}]}

BẮT BUỘC: content_vi và pinyin PHẢI giữ nguyên số đoạn (\\n\\n) như content_zh.
Pinyin có dấu thanh, mỗi câu kết bằng "." để tách. Bỏ qua header phân loại tuổi (限制級…).
vocab 25-30 mục ≥2 chữ (danh từ chính + động từ then chốt + thuật ngữ chuyên ngành); example là câu nguyên văn. KHÔNG markdown.`;

function cleanContent(text) {
  let out = (text || '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n\n')
    .trim();
  // Fallback: if Readability returned a flat block, inject paragraph breaks every 3 sentences
  if (!out.includes('\n\n')) {
    const sentences = out.split(/(?<=[。！？])/).map(s => s.trim()).filter(Boolean);
    const paras = [];
    for (let i = 0; i < sentences.length; i += 3) paras.push(sentences.slice(i, i + 3).join(''));
    out = paras.join('\n\n');
  }
  return out;
}

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const SUPABASE_URL = 'https://prctmferugkxabyizslx.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiKey   = process.env.OPENAI_API_KEY;
  if (!supabaseKey) return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' });
  if (!openaiKey)   return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });

  const sb = createClient(SUPABASE_URL, supabaseKey);

  // Self-throttle: skip if a fetch ran within last 3 days
  const { data: recent } = await sb.from('news_articles')
    .select('fetched_at')
    .order('fetched_at', { ascending: false })
    .limit(1);
  const lastFetch = recent?.[0]?.fetched_at ? new Date(recent[0].fetched_at).getTime() : 0;
  const ageMs = Date.now() - lastFetch;
  const THREE_DAYS_MS = 3 * 24 * 3600 * 1000;
  if (ageMs < THREE_DAYS_MS) {
    return res.status(200).json({
      ok: true,
      skipped: true,
      reason: `last fetch ${Math.round(ageMs / 3600000)}h ago, throttle 3 days`,
    });
  }

  const parser = new Parser({
    timeout: 8000,
    customFields: { item: ['media:thumbnail', 'media:content', 'enclosure'] },
  });

  const candidates = [];
  for (const src of SOURCES) {
    try {
      const feed = await parser.parseURL(src.rss);
      const items = (feed.items || []).slice(0, 2).map(it => ({
        source: src.id, source_name: src.name,
        title: it.title || '',
        link: it.link || it.guid || '',
        excerpt: (it.contentSnippet || it.content || '').slice(0, 500),
        pubDate: it.pubDate || it.isoDate || null,
        cover: (it['media:thumbnail']?.$ || it['media:thumbnail']?.[0]?.$ || it['media:content']?.$ || it.enclosure || {}).url || '',
      })).filter(x => x.link && x.title);
      candidates.push(...items);
    } catch (e) {
      // skip failing source
    }
  }

  candidates.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  const { data: existing } = await sb.from('news_articles').select('source_url');
  const have = new Set((existing || []).map(r => r.source_url));
  const fresh = candidates.filter(c => !have.has(c.link));

  const picks = fresh.slice(0, 2);
  if (!picks.length) return res.status(200).json({ ok: true, inserted: 0, reason: 'no fresh articles' });

  const results = [];
  for (const p of picks) {
    try {
      const articleRes = await fetch(p.link, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TOCFLBot/1.0; +https://tocflfafa.com)' },
      });
      if (!articleRes.ok) throw new Error('fetch ' + articleRes.status);
      const html = await articleRes.text();
      const dom = new JSDOM(html, { url: p.link });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      if (!article || !article.textContent || article.textContent.length < 200)
        throw new Error('content too short');

      const trimmedZh = cleanContent(article.textContent).slice(0, 2000);

      const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + openaiKey },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 8000,
          temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user',   content: `Tiêu đề: ${article.title || p.title}\n\nNội dung:\n${trimmedZh}\n\nTrả JSON.` },
          ],
        }),
      });
      const aiJson = await aiRes.json();
      if (aiJson.error) throw new Error('OpenAI: ' + aiJson.error.message);
      const ai = JSON.parse(aiJson.choices[0].message.content);

      const { error } = await sb.from('news_articles').insert({
        source: p.source,
        source_url: p.link,
        source_name: p.source_name,
        title_zh: article.title || p.title,
        title_vi: ai.title_vi || '',
        excerpt_zh: p.excerpt,
        content_zh: trimmedZh,
        content_vi: ai.content_vi || '',
        pinyin: ai.pinyin || '',
        vocab: ai.vocab || [],
        category: ai.category || 'world',
        cover_url: p.cover || null,
        published_at: p.pubDate ? new Date(p.pubDate).toISOString() : null,
      });
      if (error) throw new Error('db: ' + error.message);
      results.push({ ok: true, title: p.title.slice(0, 50) });
    } catch (e) {
      results.push({ ok: false, title: p.title.slice(0, 50), error: e.message });
    }
  }

  return res.status(200).json({
    ok: true,
    inserted: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results,
  });
}
