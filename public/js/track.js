// Lightweight pageview tracker. Inserts a row into page_views via
// Supabase REST. Fire-and-forget — never blocks page load.
//
// Privacy: stores a random UUID in localStorage (key=tocfl_sid). No IP, no UA,
// no fingerprinting. Cleared on browser data wipe / incognito.
(function () {
  if (typeof window === 'undefined') return;
  // Bots / prerender — skip
  if (/bot|crawler|spider|preview/i.test(navigator.userAgent || '')) return;

  const SB_URL = 'https://prctmferugkxabyizslx.supabase.co';
  const SB_KEY = 'sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ';

  // Persistent per-browser session id
  const SID_KEY = 'tocfl_sid';
  let sid = localStorage.getItem(SID_KEY);
  if (!sid) {
    sid = (crypto.randomUUID && crypto.randomUUID())
       || (Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
    localStorage.setItem(SID_KEY, sid);
  }

  // Throttle: don't double-track the same path within 10s (e.g. when
  // pushState/replaceState fires alongside a real navigation).
  const path = (location.pathname + location.search).slice(0, 200);
  const throttleKey = 'tocfl_last_track';
  const now = Date.now();
  try {
    const prev = JSON.parse(sessionStorage.getItem(throttleKey) || '{}');
    if (prev.path === path && now - (prev.ts || 0) < 10_000) return;
    sessionStorage.setItem(throttleKey, JSON.stringify({ path, ts: now }));
  } catch (e) {}

  const body = JSON.stringify({
    session_id: sid,
    path,
    referrer: (document.referrer || '').slice(0, 500) || null,
  });

  const url = SB_URL + '/rest/v1/page_views';
  const headers = {
    'apikey': SB_KEY,
    'Authorization': 'Bearer ' + SB_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
  };

  // sendBeacon is more reliable across page transitions; fall back to fetch.
  if (navigator.sendBeacon) {
    try {
      const blob = new Blob([body], { type: 'application/json' });
      // sendBeacon doesn't accept custom headers, so we use fetch with keepalive instead.
    } catch (e) {}
  }
  fetch(url, { method: 'POST', headers, body, keepalive: true })
    .catch(() => {}); // silent — analytics must never break the page
})();
