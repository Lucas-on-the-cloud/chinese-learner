-- Sentence-by-sentence pairing for Reel transcript display.
-- AI now returns an array of {zh, vi} pairs alongside the flat transcript_zh/vi
-- so the UI can render numbered side-by-side translations.

ALTER TABLE reel_studies
  ADD COLUMN IF NOT EXISTS sentences JSONB NOT NULL DEFAULT '[]'::jsonb;
