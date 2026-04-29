-- ═══════════════════════════════════════════════════════════════════
-- Migration 002: Enterprise pipeline v1
-- Run in Supabase SQL Editor, then reload schema cache.
-- ═══════════════════════════════════════════════════════════════════

-- ─── exam_books: add pipeline columns ────────────────────────────
ALTER TABLE exam_books
  ADD COLUMN IF NOT EXISTS source_pdf_path     TEXT,
  ADD COLUMN IF NOT EXISTS gcs_input_path      TEXT,
  ADD COLUMN IF NOT EXISTS doc_ai_processor_id TEXT,
  ADD COLUMN IF NOT EXISTS extraction_version  INT DEFAULT 1;

-- ─── exam_units: add sub-unit support ────────────────────────────
ALTER TABLE exam_units
  ADD COLUMN IF NOT EXISTS sub_number    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sub_title_zh  TEXT,
  ADD COLUMN IF NOT EXISTS start_page    INT,
  ADD COLUMN IF NOT EXISTS end_page      INT,
  ADD COLUMN IF NOT EXISTS extracted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by   UUID;

-- Drop old unique constraint, replace with (book_id, unit_number, sub_number)
ALTER TABLE exam_units DROP CONSTRAINT IF EXISTS exam_units_book_id_unit_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS exam_units_unique_idx
  ON exam_units(book_id, unit_number, sub_number);

-- Change status column to use new values (keep existing rows as-is)
-- Old: 'draft'|'published' → New: 'extracted'|'reviewing'|'verified'|'published'

-- ─── exam_passages: add image support ────────────────────────────
ALTER TABLE exam_passages
  ADD COLUMN IF NOT EXISTS content_image_bbox JSONB,
  ADD COLUMN IF NOT EXISTS passage_type       TEXT DEFAULT 'text';

-- ─── exam_questions: add verification + audit columns ────────────
ALTER TABLE exam_questions
  ADD COLUMN IF NOT EXISTS explanation  TEXT,
  ADD COLUMN IF NOT EXISTS verified     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_by  UUID,
  ADD COLUMN IF NOT EXISTS verified_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS flag_warnings JSONB,
  ADD COLUMN IF NOT EXISTS source_page  INT,
  ADD COLUMN IF NOT EXISTS source_bbox  JSONB;

-- ─── exam_listening_transcripts: new table ───────────────────────
CREATE TABLE IF NOT EXISTS exam_listening_transcripts (
  id             BIGSERIAL PRIMARY KEY,
  question_id    BIGINT NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
  transcript_zh  TEXT   NOT NULL,
  audio_url      TEXT,
  source_page    INT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transcripts_question
  ON exam_listening_transcripts(question_id);

-- ─── exam_doc_ai_pages: raw Document AI output per page ──────────
CREATE TABLE IF NOT EXISTS exam_doc_ai_pages (
  book_id              BIGINT NOT NULL REFERENCES exam_books(id) ON DELETE CASCADE,
  page_num             INT    NOT NULL,
  layout_json          JSONB  NOT NULL,
  raw_text             TEXT,
  has_table            BOOLEAN DEFAULT false,
  has_visual_element   BOOLEAN DEFAULT false,
  PRIMARY KEY (book_id, page_num)
);

-- ─── exam_jobs: job queue ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_jobs (
  id               BIGSERIAL PRIMARY KEY,
  book_id          BIGINT NOT NULL REFERENCES exam_books(id) ON DELETE CASCADE,
  job_type         TEXT NOT NULL DEFAULT 'full_pipeline',
  status           TEXT NOT NULL DEFAULT 'queued',
  current_step     TEXT,
  progress_pct     INT  DEFAULT 0,
  progress_label   TEXT,
  doc_ai_operation_id TEXT,
  inngest_event_id    TEXT,
  scope            JSONB,
  error_message    TEXT,
  error_stack      TEXT,
  retry_count      INT  DEFAULT 0,
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jobs_book_status
  ON exam_jobs(book_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_status
  ON exam_jobs(status, created_at);

-- ─── exam_extraction_log: audit trail ────────────────────────────
CREATE TABLE IF NOT EXISTS exam_extraction_log (
  id             BIGSERIAL PRIMARY KEY,
  book_id        BIGINT,
  unit_id        BIGINT,
  job_id         BIGINT REFERENCES exam_jobs(id) ON DELETE SET NULL,
  stage          TEXT NOT NULL,
  ai_provider    TEXT,
  ai_model       TEXT,
  prompt_version TEXT,
  input_tokens   INT,
  output_tokens  INT,
  cost_usd       NUMERIC(10, 6),
  duration_ms    INT,
  error          TEXT,
  metadata       JSONB,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_log_book_stage
  ON exam_extraction_log(book_id, stage);

-- ─── Disable RLS on new tables (admin-only for now) ───────────────
ALTER TABLE exam_jobs                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE exam_doc_ai_pages          DISABLE ROW LEVEL SECURITY;
ALTER TABLE exam_extraction_log        DISABLE ROW LEVEL SECURITY;
ALTER TABLE exam_listening_transcripts DISABLE ROW LEVEL SECURITY;

-- ─── Enable Realtime for job monitoring ───────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE exam_jobs;

-- ─── Supabase Storage: create exam-books bucket ──────────────────
-- Run this separately in Supabase Storage UI or via:
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exam-books',
  'exam-books',
  false,
  209715200,  -- 200MB limit
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Allow anon key to upload (admin panel uses anon key without auth)
CREATE POLICY IF NOT EXISTS "exam-books anon upload"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'exam-books');

CREATE POLICY IF NOT EXISTS "exam-books anon read"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'exam-books');
