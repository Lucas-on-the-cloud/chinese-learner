-- Migration 005: Add sort_order to exam_passages so passages can be reordered
--                without affecting question→passage_id linkage.
--
-- Run in Supabase SQL Editor.

ALTER TABLE exam_passages
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

-- Backfill sort_order based on id within each section (1, 2, 3, ...)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY section_id ORDER BY id) AS rn
  FROM exam_passages
)
UPDATE exam_passages p
SET    sort_order = r.rn
FROM   ranked r
WHERE  p.id = r.id;

CREATE INDEX IF NOT EXISTS idx_exam_passages_section_order
  ON exam_passages(section_id, sort_order);
