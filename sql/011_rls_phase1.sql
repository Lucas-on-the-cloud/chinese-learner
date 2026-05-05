-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║ Phase 1: RLS lockdown                                                          ║
-- ║                                                                                ║
-- ║ COPY-PASTE TỪNG BLOCK MỘT vào Supabase SQL Editor.                             ║
-- ║ Chạy block → test website → nếu OK chạy block kế tiếp.                         ║
-- ║                                                                                ║
-- ║ Service role bypass tất cả RLS — CLI scripts không bị ảnh hưởng nếu dùng key   ║
-- ║ service_role.                                                                  ║
-- ║                                                                                ║
-- ║ Rollback: cuối file có khối DOWN cho từng phần.                                ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- ════════════════════════════════════════════════════════════════════════════════
-- ▼▼▼ BLOCK 1: Public read (no publish flag) — chạy trước, an toàn nhất ▼▼▼
-- ════════════════════════════════════════════════════════════════════════════════
-- Mục tiêu: anon đọc được tất cả rows, không ghi/sửa/xoá.
-- Test sau khi chạy: mở /courses.html, /reading.html?id=1 — vẫn xem được nội dung.
--                    Mở DevTools console: thử .from('lessons').insert(...) → phải fail.

DO $$
DECLARE
  t TEXT;
  pub_tables TEXT[] := ARRAY[
    'lessons','books','vocab_cache','exam_sections','exam_passages',
    'exam_questions','exam_choices','exam_vocab','exam_phrases','exam_listening_transcripts'
  ];
BEGIN
  FOREACH t IN ARRAY pub_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- Drop any existing permissive policies (to start clean)
    EXECUTE format('DROP POLICY IF EXISTS "anon_all" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%I_all" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%I_select" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%I_select_all" ON %I', t, t);
    -- New: anyone (anon + authenticated) can SELECT
    EXECUTE format('CREATE POLICY "%I_select_all" ON %I FOR SELECT USING (true)', t, t);
    -- INSERT/UPDATE/DELETE: no policy = deny for anon. Service role bypasses.
  END LOOP;
END $$;

-- VERIFY: should return rows for all tables
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'
  AND tablename = ANY(ARRAY['lessons','books','vocab_cache','exam_sections','exam_passages',
                            'exam_questions','exam_choices','exam_vocab','exam_phrases','exam_listening_transcripts'])
  ORDER BY tablename;
-- rowsecurity should be 'true' for all 10 rows.

-- ════════════════════════════════════════════════════════════════════════════════
-- ▼▼▼ BLOCK 2: Public read with status filter ▼▼▼
-- ════════════════════════════════════════════════════════════════════════════════
-- Mục tiêu: anon chỉ đọc rows có published=true / status='published'. Ghi bị chặn.
-- Test: nếu có post status='draft' thì /blog.html không hiện bài đó.
--       Spot-check /exams.html → vẫn list các exam_books status='published'.

-- 2.1: posts (column: published BOOLEAN)
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "posts_select_published" ON posts;
DROP POLICY IF EXISTS "anon_all" ON posts;
DROP POLICY IF EXISTS "posts_select_all" ON posts;
CREATE POLICY "posts_select_published" ON posts FOR SELECT USING (published = true);

-- 2.2: audio_segments (column: published BOOLEAN)
ALTER TABLE audio_segments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audio_segments_select_published" ON audio_segments;
DROP POLICY IF EXISTS "anon_all" ON audio_segments;
DROP POLICY IF EXISTS "audio_segments_select_all" ON audio_segments;
CREATE POLICY "audio_segments_select_published" ON audio_segments FOR SELECT USING (published = true);

-- 2.3: flashcard_templates (column: published BOOLEAN)
ALTER TABLE flashcard_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "flashcard_templates_select_published" ON flashcard_templates;
DROP POLICY IF EXISTS "anon_all" ON flashcard_templates;
DROP POLICY IF EXISTS "flashcard_templates_select_all" ON flashcard_templates;
CREATE POLICY "flashcard_templates_select_published" ON flashcard_templates FOR SELECT USING (published = true);

-- 2.4: exam_books (column: status TEXT, value 'published')
ALTER TABLE exam_books ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "exam_books_select_published" ON exam_books;
DROP POLICY IF EXISTS "anon_all" ON exam_books;
DROP POLICY IF EXISTS "exam_books_select_all" ON exam_books;
CREATE POLICY "exam_books_select_published" ON exam_books FOR SELECT USING (status = 'published');

-- 2.5: exam_units (column: status TEXT, value 'published')
ALTER TABLE exam_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "exam_units_select_published" ON exam_units;
DROP POLICY IF EXISTS "anon_all" ON exam_units;
DROP POLICY IF EXISTS "exam_units_select_all" ON exam_units;
CREATE POLICY "exam_units_select_published" ON exam_units FOR SELECT USING (status = 'published');

-- ════════════════════════════════════════════════════════════════════════════════
-- ▼▼▼ BLOCK 3: User-owned tables ▼▼▼
-- ════════════════════════════════════════════════════════════════════════════════
-- Mục tiêu: mỗi user chỉ thao tác trên rows của mình (auth.uid() = user_id).
-- Anon: deny tất cả. Authenticated: own rows only.

-- 3.1: exam_results
ALTER TABLE exam_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "exam_results_own" ON exam_results;
DROP POLICY IF EXISTS "anon_all" ON exam_results;
DROP POLICY IF EXISTS "exam_results_select_all" ON exam_results;
CREATE POLICY "exam_results_own" ON exam_results
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3.2: user_flashcards
ALTER TABLE user_flashcards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_flashcards_own" ON user_flashcards;
DROP POLICY IF EXISTS "anon_all" ON user_flashcards;
DROP POLICY IF EXISTS "user_flashcards_select_all" ON user_flashcards;
CREATE POLICY "user_flashcards_own" ON user_flashcards
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3.3: profiles (assuming id = auth.uid() — kiểm tra schema trước)
-- Bỏ qua nếu chưa dùng; chạy sau khi confirm schema.

-- ════════════════════════════════════════════════════════════════════════════════
-- ▼▼▼ BLOCK 4: Comments ▼▼▼
-- ════════════════════════════════════════════════════════════════════════════════
-- Hiện tại: SELECT all, INSERT/UPDATE/DELETE all (đã setup ở migration 008).
-- Mới: SELECT visible only, INSERT public, UPDATE/DELETE chỉ service role (admin).

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comments_select_all" ON comments;
DROP POLICY IF EXISTS "comments_insert_anyone" ON comments;
DROP POLICY IF EXISTS "comments_update_anyone" ON comments;
DROP POLICY IF EXISTS "comments_delete_anyone" ON comments;
DROP POLICY IF EXISTS "comments_select_visible" ON comments;

CREATE POLICY "comments_select_visible" ON comments FOR SELECT USING (status = 'visible');
CREATE POLICY "comments_insert_anyone"  ON comments FOR INSERT WITH CHECK (
  -- Basic anti-abuse: reject is_admin=true from anon (only service role can set true)
  is_admin = false
  AND length(body) BETWEEN 1 AND 2000
);
-- UPDATE / DELETE: no policy = deny anon. Service role bypasses → admin panel
-- sẽ phải migrate sang dùng service role qua proxy (Phase 3).

-- ════════════════════════════════════════════════════════════════════════════════
-- ▼▼▼ BLOCK 5: Verify ▼▼▼
-- ════════════════════════════════════════════════════════════════════════════════
-- 5.1: list all tables + RLS on/off + policy count
SELECT
  t.tablename,
  t.rowsecurity AS rls_enabled,
  (SELECT COUNT(*) FROM pg_policies p WHERE p.tablename = t.tablename) AS policy_count
FROM pg_tables t
WHERE t.schemaname = 'public'
ORDER BY t.tablename;

-- 5.2: list all policies (review carefully)
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;


-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║ ROLLBACK (chỉ chạy nếu cần undo)                                              ║
-- ║                                                                                ║
-- ║ -- Disable RLS trên 1 bảng cụ thể:                                            ║
-- ║ ALTER TABLE <tablename> DISABLE ROW LEVEL SECURITY;                            ║
-- ║                                                                                ║
-- ║ -- Hoặc khôi phục policy "ai cũng làm gì":                                    ║
-- ║ CREATE POLICY "anon_all" ON <tablename> FOR ALL USING (true) WITH CHECK (true);║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
