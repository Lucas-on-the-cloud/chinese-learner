// Fetch latest 5 news articles from Taiwan news sources, AI-process, save to DB.
// Manual run: node scripts/fetch-news.mjs --key=sk-...
// Cron: should run every 3 days (Vercel cron or external scheduler).

import Parser from 'rss-parser';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { getServiceClient } from './_supabase.mjs';
import fs from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true];
}));
const KEY = args.key || process.env.OPENAI_API_KEY || (() => {
  try {
    const env = fs.readFileSync('.env.local', 'utf8');
    return env.match(/^\s*OPENAI_API_KEY\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g,'');
  } catch { return null; }
})();
const DRYRUN = !!args.dryrun;
const TARGET = +(args.count || 5);
if (!KEY) { console.error('Missing --key=sk-... or OPENAI_API_KEY in .env.local'); process.exit(1); }

const sb = getServiceClient();
const parser = new Parser({ timeout: 15000, customFields: { item: ['media:thumbnail', 'media:content', 'enclosure'] } });

// 5 Taiwan news RSS feeds (verified URLs)
const SOURCES = [
  { id: 'cna', name: '中央社',     rss: 'https://feeds.feedburner.com/rsscna/intworld' },
  { id: 'cna2', name: '中央社政治', rss: 'https://feeds.feedburner.com/rsscna/politics' },
  { id: 'pts', name: '公視新聞',   rss: 'https://news.pts.org.tw/xml/newsfeed.xml' },
  { id: 'ltn', name: '自由時報',   rss: 'https://news.ltn.com.tw/rss/all.xml' },
  { id: 'udn', name: '聯合新聞網', rss: 'https://udn.com/rssfeed/lists/1/0?ch=news' },
];

console.log(`\n═══ Fetch latest ${TARGET} Taiwan news articles${DRYRUN ? ' [DRYRUN]' : ''} ═══\n`);

// 1. Pull RSS from all sources, get up to 3 latest from each
const candidates = [];
for (const src of SOURCES) {
  try {
    process.stdout.write(`  ${src.name.padEnd(8)} `);
    const feed = await parser.parseURL(src.rss);
    const items = (feed.items || []).slice(0, 3).map(it => ({
      source: src.id, source_name: src.name,
      title: it.title || '',
      link: it.link || it.guid || '',
      excerpt: it.contentSnippet || it.content || '',
      pubDate: it.pubDate || it.isoDate || null,
      cover: (it['media:thumbnail']?.$ || it['media:thumbnail']?.[0]?.$ || it['media:content']?.$ || it.enclosure || {}).url || '',
    })).filter(x => x.link && x.title);
    candidates.push(...items);
    console.log(`✓ ${items.length} items (latest: "${items[0]?.title?.slice(0,40) || '-'}…")`);
  } catch (e) {
    console.log(`✗ ${e.message.slice(0,60)}`);
  }
}

// 2. Sort by pubDate desc, dedupe, pick top TARGET that aren't already in DB
candidates.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
console.log(`\n  ${candidates.length} candidates total (across all sources)`);

const { data: existing } = await sb.from('news_articles').select('source_url');
const have = new Set((existing || []).map(r => r.source_url));
const fresh = candidates.filter(c => !have.has(c.link));
console.log(`  ${fresh.length} not yet in DB`);

const picks = fresh.slice(0, TARGET);
if (!picks.length) { console.log('\nNothing new to fetch. Done.'); process.exit(0); }
console.log(`\n  Picking top ${picks.length} for processing:\n`);
picks.forEach((p, i) => console.log(`    ${i+1}. [${p.source_name}] ${p.title.slice(0, 70)}`));

// 3. For each pick: fetch HTML → Readability → extract main content
async function fetchContent(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TOCFLBot/1.0; +https://tocflfafa.com)' },
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article) throw new Error('readability failed');
  // Preserve paragraph structure: collapse runs of inline whitespace, but keep blank lines
  let cleaned = (article.textContent || '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n\n')
    .trim();
  if (!cleaned.includes('\n\n')) {
    const sentences = cleaned.split(/(?<=[。！？])/).map(s => s.trim()).filter(Boolean);
    const paras = [];
    for (let i = 0; i < sentences.length; i += 3) paras.push(sentences.slice(i, i+3).join(''));
    cleaned = paras.join('\n\n');
  }
  return {
    title: article.title || '',
    content: cleaned,
    excerpt: article.excerpt || '',
    cover: article.byline || null,
  };
}

// 4. AI process: 1 call per article does translate + pinyin + vocab + category
const SYSTEM_PROMPT = `Bạn là biên tập viên báo song ngữ Trung-Việt cho học viên TOCFL phồn thể (繁體中文 Đài Loan).
Cho 1 bài báo tiếng Trung phồn thể với cấu trúc đoạn (paragraph) đã được phân cách bằng dòng trống (\\n\\n).
Trả về JSON object đúng schema:

{
  "title_vi": "<tiêu đề dịch tiếng Việt>",
  "content_vi": "<full content dịch tiếng Việt, GIỮ NGUYÊN STRUCTURE \\n\\n giữa các đoạn>",
  "pinyin": "<pinyin có dấu thanh; GIỮ NGUYÊN STRUCTURE \\n\\n giữa các đoạn>",
  "category": "<chọn 1: politics|business|tech|sports|culture|lifestyle|world|society>",
  "vocab": [
    {"char":"<từ/cụm 2+ chữ>","pinyin":"...","meaning":"<nghĩa Việt>","example":"<câu nguyên văn từ bài>","exMeaning":"<dịch câu>","level":"<cơ bản|trung cấp|nâng cao>"}
  ]
}

Quy tắc:
- BẮT BUỘC giữ paragraph structure: số đoạn của content_vi và pinyin PHẢI BẰNG số đoạn của content_zh; mỗi đoạn cách nhau bằng \\n\\n.
- Bản dịch tự nhiên, không word-for-word.
- Pinyin: có dấu thanh ā á ǎ à, viết liền theo từ.
- BỎ QUA những đoạn header/disclaimer ở đầu bài (vd "限制級 您即將進入...").
- vocab: ĐÚNG 15-20 từ/cụm THIẾT YẾU (≥2 chữ).
- KHÔNG markdown.`;

async function aiProcess(zh, title) {
  const userMsg = `Tiêu đề: ${title}\n\nNội dung bài:\n${zh}\n\nTrả JSON theo schema.`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 8000,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userMsg },
        ],
      }),
    });
    const j = await res.json();
    if (j.error) {
      if (j.error.code === 'rate_limit_exceeded') {
        await new Promise(r => setTimeout(r, 3000 * (attempt+1))); continue;
      }
      throw new Error('OpenAI: ' + j.error.message);
    }
    const raw = j.choices?.[0]?.message?.content || '';
    return JSON.parse(raw);
  }
  throw new Error('rate limit retries exhausted');
}

// 5. Process each article
console.log('\n  Processing articles…\n');
let inserted = 0;
for (let i = 0; i < picks.length; i++) {
  const p = picks[i];
  process.stdout.write(`    [${i+1}/${picks.length}] ${p.source_name} · ${p.title.slice(0,50)}…`);
  try {
    const article = await fetchContent(p.link);
    if (!article.content || article.content.length < 200) throw new Error('content too short: ' + article.content.length);
    // Trim to 2000 chars to keep AI output JSON within max_tokens
    const trimmedZh = article.content.slice(0, 2000);

    const ai = await aiProcess(trimmedZh, article.title || p.title);

    const row = {
      source: p.source,
      source_url: p.link,
      source_name: p.source_name,
      title_zh: article.title || p.title,
      title_vi: ai.title_vi || '',
      excerpt_zh: p.excerpt?.slice(0, 500) || '',
      content_zh: trimmedZh,
      content_vi: ai.content_vi || '',
      pinyin: ai.pinyin || '',
      vocab: ai.vocab || [],
      category: ai.category || 'world',
      cover_url: p.cover || null,
      published_at: p.pubDate ? new Date(p.pubDate).toISOString() : null,
    };

    if (DRYRUN) {
      console.log(` ✓ [DRY] ${trimmedZh.length}ch zh, ${row.vocab.length} vocab, cat=${row.category}`);
    } else {
      const { error } = await sb.from('news_articles').insert(row);
      if (error) throw new Error('db: ' + error.message);
      console.log(` ✓ saved (${trimmedZh.length}ch, ${row.vocab.length} vocab, cat=${row.category})`);
      inserted++;
    }
  } catch (e) {
    console.log(` ✗ ${e.message}`);
  }
}

console.log(`\n═══ Done · ${inserted} articles inserted${DRYRUN ? ' [skipped — DRYRUN]' : ''} ═══`);
