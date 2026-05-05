-- Migration 014: news_articles table for "Đọc báo" feature.
-- Hybrid display: original ZH + AI-generated VI translation + pinyin + vocab. Source linked.

CREATE TABLE IF NOT EXISTS news_articles (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT      NOT NULL,           -- 'cna' | 'udn' | 'ltn' | 'pts' | 'cw'
  source_url      TEXT      NOT NULL UNIQUE,
  source_name     TEXT,                          -- '中央社' / '聯合新聞網' / etc
  title_zh        TEXT      NOT NULL,
  title_vi        TEXT,                          -- AI-translated title
  excerpt_zh      TEXT,                          -- Original short summary
  content_zh      TEXT      NOT NULL,
  content_vi      TEXT,                          -- AI-translated content
  pinyin          TEXT,                          -- AI pinyin for content
  vocab           JSONB,                         -- 15-25 từ khoá AI extract: [{char, pinyin, meaning, example, exMeaning, level}]
  category        TEXT,                          -- politics/tech/sports/culture/lifestyle/business
  cover_url       TEXT,                          -- Article cover image
  published_at    TIMESTAMPTZ,                   -- From source RSS
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status          TEXT      NOT NULL DEFAULT 'published'
);

CREATE INDEX IF NOT EXISTS idx_news_articles_published
  ON news_articles(published_at DESC) WHERE status='published';
CREATE INDEX IF NOT EXISTS idx_news_articles_source
  ON news_articles(source, published_at DESC) WHERE status='published';

-- RLS: anon SELECT published only, service role bypass for inserts
ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "news_articles_select_published" ON news_articles;
CREATE POLICY "news_articles_select_published" ON news_articles
  FOR SELECT USING (status='published');
