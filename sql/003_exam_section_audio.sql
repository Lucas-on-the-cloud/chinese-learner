-- Add audio_url to exam_sections for listening sections (一、對話聽力)
-- Run once in Supabase SQL editor.

ALTER TABLE exam_sections ADD COLUMN IF NOT EXISTS audio_url TEXT;
