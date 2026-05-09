-- Generic event tracking for conversion funnel analysis.
-- Each row = 1 user action (lesson_open, exam_submit, listening_done, flashcard_fork, ...).
-- session_id matches page_views.session_id so we can join the two for funnels.
--
-- Browser inserts directly via the publishable anon key (same pattern as page_views).
-- Reads blocked at RLS — service-role only via scripts/analytics.mjs.

CREATE TABLE IF NOT EXISTS events (
  id          BIGSERIAL PRIMARY KEY,
  session_id  TEXT NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,                       -- snake_case event name
  props       JSONB NOT NULL DEFAULT '{}'::jsonb,  -- arbitrary metadata
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_ts        ON events (ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_name_ts   ON events (name, ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_session   ON events (session_id, ts DESC);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events insert public" ON events;
CREATE POLICY "events insert public" ON events
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(session_id) BETWEEN 8 AND 64
    AND length(name)   BETWEEN 1 AND 50
  );

-- No SELECT policy → RLS denies all reads from anon/authenticated.
-- service_role bypasses RLS for analytics.mjs queries.
