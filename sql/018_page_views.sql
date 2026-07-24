-- Lightweight pageview analytics. Each row = 1 page load.
-- session_id is a per-browser UUID stored in localStorage (so "unique visitor"
-- = unique device/browser, NOT necessarily unique person — close enough for
-- DAU/MAU estimates without invasive fingerprinting).
--
-- Browser inserts directly via the public anon key. Reads are blocked at the
-- RLS layer; only the service-role CLI script (scripts/analytics.mjs) can query.

CREATE TABLE IF NOT EXISTS page_views (
  id          BIGSERIAL PRIMARY KEY,
  session_id  TEXT NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  path        TEXT NOT NULL,
  referrer    TEXT,
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_views_ts          ON page_views (ts DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_session_ts  ON page_views (session_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_path        ON page_views (path);
CREATE INDEX IF NOT EXISTS idx_page_views_day         ON page_views (date_trunc('day', ts));

ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

-- Anyone (anon + authenticated) can insert; nothing else.
DROP POLICY IF EXISTS "page_views insert public" ON page_views;
CREATE POLICY "page_views insert public" ON page_views
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    -- Sanity caps to discourage abuse
    length(session_id) BETWEEN 8 AND 64
    AND length(path)    BETWEEN 1 AND 200
    AND (referrer IS NULL OR length(referrer) <= 500)
  );

-- No SELECT policy → RLS denies all reads from anon/authenticated.
-- service_role bypasses RLS automatically.


-- node scripts/analytics.mjs              # 30 ngày qua
-- node scripts/analytics.mjs --days=7     # 7 ngày
-- node scripts/analytics.mjs --days=1     # hôm nay

