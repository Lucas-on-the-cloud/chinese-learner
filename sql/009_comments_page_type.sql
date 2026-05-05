-- Migration 009: Allow 'page' entity_type for catalog pages (courses.html, exams.html, ...)
-- Run in Supabase SQL Editor.

ALTER TABLE comments DROP CONSTRAINT IF EXISTS comments_entity_type_check;
ALTER TABLE comments
  ADD CONSTRAINT comments_entity_type_check
  CHECK (entity_type IN ('post','lesson_reading','lesson_listening','exam_unit','page'));
