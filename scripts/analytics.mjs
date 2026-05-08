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

console.log();
