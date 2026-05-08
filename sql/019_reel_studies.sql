-- Personal Instagram Reel study tool. Stores transcript + analysis for each
-- reel Lucas pastes into /admin/reels.html. Audio is NOT stored — we only
-- keep the original Instagram URL + thumbnail + AI-generated study material.
--
-- Security: page lives at obscure URL (/admin/reels.html). RLS allows full
-- access to anon — same level as other tables that the publishable key reads.
-- Treat this table as personal notes; nothing sensitive should go in here.

CREATE TABLE IF NOT EXISTS reel_studies (
  id                BIGSERIAL PRIMARY KEY,
  url               TEXT UNIQUE NOT NULL,
  shortcode         TEXT,
  title             TEXT,
  thumbnail_url     TEXT,
  video_url         TEXT,                              -- mp4 link from RapidAPI (expires)
  duration_sec      INT,
  transcript_zh     TEXT NOT NULL,
  transcript_pinyin TEXT,
  transcript_vi     TEXT,
  vocab             JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes             TEXT,                              -- free-form Lucas notes
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reel_studies_created
  ON reel_studies (created_at DESC);

ALTER TABLE reel_studies ENABLE ROW LEVEL SECURITY;

-- Allow full CRUD via the publishable anon key. Page is at an obscure URL.
DROP POLICY IF EXISTS "reel_studies all anon" ON reel_studies;
CREATE POLICY "reel_studies all anon" ON reel_studies
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
