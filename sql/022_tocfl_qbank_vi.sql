-- Add Vietnamese translation columns to qbank tables.
-- Run once in Supabase SQL editor, then reload schema cache.

ALTER TABLE tocfl_groups    ADD COLUMN IF NOT EXISTS shared_text_vi    TEXT;
ALTER TABLE tocfl_questions ADD COLUMN IF NOT EXISTS question_text_vi  TEXT;
ALTER TABLE tocfl_options   ADD COLUMN IF NOT EXISTS text_vi           TEXT;
