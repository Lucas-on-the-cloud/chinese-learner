// Lightweight analytics: pageview on load + window.track(name, props) for
// custom events. Inserts directly into Supabase via REST. Fire-and-forget —
// never blocks the page.
//
// Privacy: random UUID in localStorage (key=tocfl_sid). No IP, no UA, no
// fingerprinting. Cleared on browser data wipe / incognito.

(function () {
  if (typeof window === 'undefined') return;

  const SB_URL = 'https://prctmferugkxabyizslx.supabase.co';
  const SB_KEY = 'sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ';
  const HEADERS = {
    'apikey': SB_KEY,
    'Authorization': 'Bearer ' + SB_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
  };

  // Bots / prerender — skip pageview, also skip any later track() calls
  const isBot = /bot|crawler|spider|preview/i.test(navigator.userAgent || '');

  // Persistent per-browser session id
  const SID_KEY = 'tocfl_sid';
  let sid = localStorage.getItem(SID_KEY);
  if (!sid) {
    sid = (crypto.randomUUID && crypto.randomUUID())
       || (Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
    localStorage.setItem(SID_KEY, sid);
  }

  // ── Custom event API: any page can call window.track('name', { props })
  // Drop-in. Fire-and-forget. Truncates name/props to safe sizes.
  window.track = function (name, props) {
    if (isBot) return;
    if (typeof name !== 'string' || !name) return;
    const safeName = name.slice(0, 50);
    let safeProps = {};
    if (props && typeof props === 'object') {
      try {
        // Cap props payload at ~2KB to avoid abuse
        safeProps = JSON.parse(JSON.stringify(props).slice(0, 2000));
      } catch (e) {}
    }
    fetch(SB_URL + '/rest/v1/events', {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ session_id: sid, name: safeName, props: safeProps }),
      keepalive: true,
    }).catch(() => {});
  };

  // ── Auto pageview on script load
  if (isBot) return;

  const path = (location.pathname + location.search).slice(0, 200);
  // Throttle: don't double-track same path within 10s (pushState etc.)
  const throttleKey = 'tocfl_last_track';
  const now = Date.now();
  try {
    const prev = JSON.parse(sessionStorage.getItem(throttleKey) || '{}');
    if (prev.path === path && now - (prev.ts || 0) < 10_000) return;
    sessionStorage.setItem(throttleKey, JSON.stringify({ path, ts: now }));
  } catch (e) {}

  fetch(SB_URL + '/rest/v1/page_views', {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      session_id: sid,
      path,
      referrer: (document.referrer || '').slice(0, 500) || null,
    }),
    keepalive: true,
  }).catch(() => {});
})();
