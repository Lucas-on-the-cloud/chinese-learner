// CLI: in báo cáo lượng người dùng từ bảng page_views.
// Usage: node scripts/analytics.mjs [--days=30]
//
// In ra: DAU/MAU, total visitors, top pages, top referrers, lịch sử ngày.

import { getServiceClient } from './_supabase.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true];
}));
const DAYS = +(args.days || 30);

const sb = getServiceClient();

const since = new Date(Date.now() - DAYS * 86400e3).toISOString();
const sinceToday  = new Date(Date.now() - 24 * 3600e3).toISOString();
const sinceMonth  = new Date(Date.now() - 30 * 86400e3).toISOString();

async function getRows(after) {
  // Pull all rows since cutoff, paginated
  let all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb.from('page_views')
      .select('session_id,path,referrer,ts,user_id')
      .gte('ts', after)
      .order('ts', { ascending: false })
      .range(from, from + 999);
    if (error) throw new Error('DB: ' + error.message);
    if (!data?.length) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

const rows = await getRows(since);
console.log(`\n═══ TOCFL FAFA · Analytics ${DAYS} ngày qua ═══\n`);
console.log(`Tổng pageview: ${rows.length}`);

// DAU / MAU
const today = new Set(rows.filter(r => r.ts >= sinceToday).map(r => r.session_id));
const month = new Set(rows.filter(r => r.ts >= sinceMonth).map(r => r.session_id));
const total = new Set(rows.map(r => r.session_id));
console.log(`Visitor (unique session_id):`);
console.log(`  · 24h gần nhất:  ${today.size}`);
console.log(`  · 30 ngày qua:   ${month.size}`);
console.log(`  · Toàn bộ ${DAYS} ngày: ${total.size}`);

// Logged-in vs anonymous
const logged = new Set(rows.filter(r => r.user_id).map(r => r.session_id));
console.log(`  · Đã login:      ${logged.size}`);
console.log(`  · Chưa login:    ${total.size - logged.size}`);

// Top pages
const pages = new Map();
rows.forEach(r => pages.set(r.path, (pages.get(r.path) || 0) + 1));
const topPages = [...pages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log(`\nTop pages (${pages.size} unique):`);
topPages.forEach(([p, n]) => console.log(`  ${String(n).padStart(4)}  ${p}`));

// Top referrers
const refs = new Map();
rows.forEach(r => {
  if (!r.referrer) return;
  let host = r.referrer;
  try { host = new URL(r.referrer).hostname; } catch (e) {}
  if (host.includes('tocflfafa.com')) return; // self
  refs.set(host, (refs.get(host) || 0) + 1);
});
const topRefs = [...refs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log(`\nTop external referrers:`);
if (!topRefs.length) console.log('  (chưa có)');
topRefs.forEach(([h, n]) => console.log(`  ${String(n).padStart(4)}  ${h}`));

// Daily breakdown (last 14 days)
const byDay = new Map();
rows.forEach(r => {
  const day = r.ts.slice(0, 10);
  if (!byDay.has(day)) byDay.set(day, { sessions: new Set(), views: 0 });
  byDay.get(day).sessions.add(r.session_id);
  byDay.get(day).views++;
});
console.log(`\nDaily (last 14):  visitors / pageviews`);
const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14).reverse();
const max = Math.max(...days.map(([, d]) => d.sessions.size), 1);
days.forEach(([day, d]) => {
  const bar = '█'.repeat(Math.round(d.sessions.size / max * 30));
  console.log(`  ${day}  ${String(d.sessions.size).padStart(3)} / ${String(d.views).padStart(4)}  ${bar}`);
});

// ── Conversion funnel (events) ─────────────────────────────────────
async function getEvents(after) {
  let all = [], from = 0;
  for (;;) {
    const { data, error } = await sb.from('events')
      .select('session_id,name,props,ts')
      .gte('ts', after)
      .order('ts', { ascending: false })
      .range(from, from + 999);
    if (error) { console.warn('events table missing or RLS issue:', error.message); return []; }
    if (!data?.length) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}
const events = await getEvents(since);

console.log(`\n═══ Conversion funnel ═══`);
console.log(`Tổng events: ${events.length}`);

// Per-event breakdown
const byName = new Map();
events.forEach(e => {
  if (!byName.has(e.name)) byName.set(e.name, { count: 0, sessions: new Set() });
  byName.get(e.name).count++;
  byName.get(e.name).sessions.add(e.session_id);
});
console.log(`\nEvents (count / unique visitors):`);
const sortedEvents = [...byName.entries()].sort((a, b) => b[1].count - a[1].count);
sortedEvents.forEach(([n, d]) => console.log(`  ${String(d.count).padStart(4)} / ${String(d.sessions.size).padStart(3)}  ${n}`));

// Funnel: pageview → lesson_open → listening_done → exam_submit
const visitors        = total.size;
const lessonOpeners   = byName.get('lesson_open')?.sessions.size || 0;
const listeners       = byName.get('listening_done')?.sessions.size || 0;
const examSubmitters  = byName.get('exam_submit')?.sessions.size || 0;
const flashcardUsers  = byName.get('flashcard_added')?.sessions.size || 0;

const pct = (n) => visitors ? (n / visitors * 100).toFixed(1) + '%' : '–';
console.log(`\nFunnel (% trên ${visitors} visitor):`);
console.log(`  Visitor          ${visitors}   100%`);
console.log(`  Mở bài đọc       ${String(lessonOpeners).padStart(3)}   ${pct(lessonOpeners)}`);
console.log(`  Luyện nghe (≥1 segment)  ${String(listeners).padStart(3)}   ${pct(listeners)}`);
console.log(`  Submit đề thi    ${String(examSubmitters).padStart(3)}   ${pct(examSubmitters)}`);
console.log(`  Thêm flashcard   ${String(flashcardUsers).padStart(3)}   ${pct(flashcardUsers)}`);

// Exam scores distribution
const examEvents = events.filter(e => e.name === 'exam_submit');
if (examEvents.length) {
  const avgPct = Math.round(examEvents.reduce((s, e) => s + (e.props?.pct || 0), 0) / examEvents.length);
  console.log(`\nĐề thi đã submit: ${examEvents.length} lần · điểm TB: ${avgPct}%`);
}

console.log();
