-- Migration 007: cover_url for exam_books — image shown on /exams.html catalog
-- and admin panel.

ALTER TABLE exam_books
  ADD COLUMN IF NOT EXISTS cover_url TEXT;
