-- Migration 006: image_url for exam_passages so 材料閱讀 sections (ads, posters,
-- maps, etc.) can carry the original image alongside the OCR'd text.

ALTER TABLE exam_passages
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Storage bucket for these images: create with name 'images' if not exists
-- (run in Supabase Dashboard → Storage → New bucket: 'images', public).
