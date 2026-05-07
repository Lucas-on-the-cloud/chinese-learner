-- News read tracking: 1 row mỗi (user, article) khi user đọc đủ 30s hoặc scroll cuối.
-- Hỗ trợ cả anonymous user (Supabase signInAnonymously) và authenticated user.

CREATE TABLE IF NOT EXISTS news_reads (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id BIGINT NOT NULL REFERENCES news_articles(id) ON DELETE CASCADE,
  read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_news_reads_user_read_at
  ON news_reads (user_id, read_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_reads_article
  ON news_reads (article_id);

-- RLS: user chỉ đọc/ghi rows của chính họ
ALTER TABLE news_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "news_reads select own" ON news_reads;
CREATE POLICY "news_reads select own" ON news_reads
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "news_reads insert own" ON news_reads;
CREATE POLICY "news_reads insert own" ON news_reads
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "news_reads update own" ON news_reads;
CREATE POLICY "news_reads update own" ON news_reads
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "news_reads delete own" ON news_reads;
CREATE POLICY "news_reads delete own" ON news_reads
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
