-- Migration 008: Anonymous threaded comments for blog posts, lessons, and exam units.
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS comments (
  id            BIGSERIAL PRIMARY KEY,
  entity_type   TEXT      NOT NULL CHECK (entity_type IN ('post','lesson_reading','lesson_listening','exam_unit')),
  entity_id     TEXT      NOT NULL,
  parent_id     BIGINT    REFERENCES comments(id) ON DELETE CASCADE,
  display_name  TEXT      NOT NULL DEFAULT 'Ẩn danh',
  body          TEXT      NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  is_admin      BOOLEAN   NOT NULL DEFAULT false,
  status        TEXT      NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','hidden')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_entity   ON comments(entity_type, entity_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_parent   ON comments(parent_id);

-- RLS: matches existing project pattern (anon key has full read/write; admin URL is by-obscurity).
-- SELECT all rows (client filters by status for public). INSERT/UPDATE/DELETE allowed (admin moderates).
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comments_select_all"   ON comments;
DROP POLICY IF EXISTS "comments_insert_anyone" ON comments;
DROP POLICY IF EXISTS "comments_update_anyone" ON comments;
DROP POLICY IF EXISTS "comments_delete_anyone" ON comments;

CREATE POLICY "comments_select_all"    ON comments FOR SELECT USING (true);
CREATE POLICY "comments_insert_anyone" ON comments FOR INSERT WITH CHECK (true);
CREATE POLICY "comments_update_anyone" ON comments FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "comments_delete_anyone" ON comments FOR DELETE USING (true);
