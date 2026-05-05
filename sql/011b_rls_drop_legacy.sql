-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║ Block 6 (follow-up): drop legacy permissive policies that survived 011_phase1  ║
-- ║ vì tên cũ có dấu cách ("Public insert ...") không match DROP của Block 1.     ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- 6.1 lessons — drop legacy + ensure RLS on
DROP POLICY IF EXISTS "Public insert lessons" ON lessons;
DROP POLICY IF EXISTS "Public read lessons"   ON lessons;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;

-- 6.2 flashcards — drop legacy. Bảng này dùng cho user fork (mỗi user có flashcard riêng).
-- Cần kiểm tra schema có user_id không. Nếu có → giống user_flashcards (own only).
-- Tạm: drop hết để chặn anon, mình sẽ giúp viết policy đúng sau.
DROP POLICY IF EXISTS "Public delete flashcards" ON flashcards;
DROP POLICY IF EXISTS "Public insert flashcards" ON flashcards;
DROP POLICY IF EXISTS "Public read flashcards"   ON flashcards;
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;

-- 6.3 vocab_cache — drop legacy. Bảng này không phải user-owned (cache theo lesson_id).
-- Public read OK. INSERT/UPDATE chỉ service role (CLI scripts qua proxy hoặc admin).
DROP POLICY IF EXISTS "Public insert vocab_cache" ON vocab_cache;
DROP POLICY IF EXISTS "Public read vocab_cache"   ON vocab_cache;
DROP POLICY IF EXISTS "Public update vocab_cache" ON vocab_cache;
-- vocab_cache_select_all (từ Block 1) đã đủ cho read public
ALTER TABLE vocab_cache ENABLE ROW LEVEL SECURITY;

-- 6.4 exam_results: có 4 policy duplicate (mới + 3 cũ). Cleanup để chỉ giữ 1 policy "_own".
DROP POLICY IF EXISTS "exam_results_select_own" ON exam_results;
DROP POLICY IF EXISTS "exam_results_update_own" ON exam_results;
DROP POLICY IF EXISTS "exam_results_upsert_own" ON exam_results;
-- exam_results_own (FOR ALL) còn lại đã handle SELECT/INSERT/UPDATE/DELETE.

-- VERIFY: list lại policies
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname='public' AND tablename IN ('lessons','flashcards','vocab_cache','exam_results')
ORDER BY tablename, policyname;
