-- Exam results: store student scores per sub-unit attempt
-- Run once in Supabase SQL Editor, then reload schema cache.

CREATE TABLE IF NOT EXISTS exam_results (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unit_id      BIGINT NOT NULL REFERENCES exam_units(id) ON DELETE CASCADE,
  answers      JSONB,
  score        INT    NOT NULL,
  total        INT    NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, unit_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_results_user ON exam_results(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_unit ON exam_results(unit_id);

-- RLS: users can only read/write their own rows
ALTER TABLE exam_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exam_results_select_own" ON exam_results
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "exam_results_upsert_own" ON exam_results
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "exam_results_update_own" ON exam_results
  FOR UPDATE USING (auth.uid() = user_id);
