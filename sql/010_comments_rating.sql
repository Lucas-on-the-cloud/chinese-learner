-- Migration 010: Add optional star rating (1-5) to comments.
-- Rating is meaningful only on top-level comments (parent_id IS NULL).
-- Run in Supabase SQL Editor.

ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS rating SMALLINT
    CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);

CREATE INDEX IF NOT EXISTS idx_comments_rating
  ON comments(entity_type, entity_id) WHERE rating IS NOT NULL;
