-- Migration 013: Add missing indexes for hot-path queries.
-- Chạy trong Supabase SQL Editor. CONCURRENTLY = không lock bảng (an toàn cho production).
-- IF NOT EXISTS = idempotent.

-- ─── audio_segments ──────────────────────────────────────────────────
-- Hot query: listening.html mở lesson → SELECT * WHERE book_name=X AND lesson_id=Y AND published=true ORDER BY sort_order
CREATE INDEX IF NOT EXISTS idx_audio_segments_book_lesson_pub
  ON audio_segments(book_name, lesson_id, published) WHERE published = true;

-- Lookup all books / lesson list per book
CREATE INDEX IF NOT EXISTS idx_audio_segments_book_published
  ON audio_segments(book_name) WHERE published = true;

-- ─── flashcard_templates ─────────────────────────────────────────────
-- Hot query: reading.html load flashcards cho 1 lesson + book filter
CREATE INDEX IF NOT EXISTS idx_flashcard_templates_lesson
  ON flashcard_templates(lesson_id) WHERE published = true;

CREATE INDEX IF NOT EXISTS idx_flashcard_templates_book
  ON flashcard_templates(book_name) WHERE published = true;

-- ─── exam structure ───────────────────────────────────────────────────
-- Hot query: open exam unit → load all sections / questions / choices
CREATE INDEX IF NOT EXISTS idx_exam_sections_unit
  ON exam_sections(unit_id);

CREATE INDEX IF NOT EXISTS idx_exam_questions_section
  ON exam_questions(section_id);

CREATE INDEX IF NOT EXISTS idx_exam_questions_passage
  ON exam_questions(passage_id) WHERE passage_id IS NOT NULL;

-- ─── lessons ──────────────────────────────────────────────────────────
-- courses.html / subcourse.html filter by book
CREATE INDEX IF NOT EXISTS idx_lessons_book
  ON lessons(book);

-- ─── exam_vocab / exam_phrases ────────────────────────────────────────
-- Used by import scripts (low priority but trivial cost)
CREATE INDEX IF NOT EXISTS idx_exam_vocab_unit
  ON exam_vocab(unit_id);

CREATE INDEX IF NOT EXISTS idx_exam_phrases_unit
  ON exam_phrases(unit_id);

-- ─── VERIFY ───────────────────────────────────────────────────────────
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname='public'
  AND indexname LIKE 'idx_%'
  AND tablename IN (
    'audio_segments','flashcard_templates','exam_sections','exam_questions','lessons','comments','exam_passages','exam_results'
  )
ORDER BY tablename, indexname;

-- Cleanup option (chỉ chạy nếu thấy table vocab_cache nặng index, không quan trọng):
-- VACUUM (FULL, ANALYZE) vocab_cache;
-- VACUUM (FULL, ANALYZE) courses;
-- VACUUM (FULL, ANALYZE) books;
-- VACUUM (FULL, ANALYZE) posts;
