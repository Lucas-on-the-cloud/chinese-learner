import { Inngest } from 'inngest';
import { serve } from 'inngest/vercel';
import { createClient } from '@supabase/supabase-js';

const inngest = new Inngest({
  id: 'tocfl-fafa',
  eventKey: process.env.INNGEST_EVENT_KEY,
});

// ── Helper ─────────────────────────────────────────────────────────
async function updateJob(jobId, fields) {
  const db = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  await db.from('exam_jobs')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', jobId);
}

// ── Function ───────────────────────────────────────────────────────
const examProcessBook = inngest.createFunction(
  { id: 'exam-process-book', retries: 3, concurrency: { limit: 2 } },
  { event: 'exam/book.process' },
  async ({ event, step }) => {
    const { book_id, job_id } = event.data;

    await updateJob(job_id, {
      status: 'running', current_step: 'upload_gcs',
      progress_pct: 5, progress_label: 'Bắt đầu xử lý...',
      started_at: new Date().toISOString(),
    });

    await step.run('upload-to-gcs', async () => {
      await updateJob(job_id, { progress_pct: 10, progress_label: 'Copy PDF → GCS (Sprint 2)...' });
    });

    await step.run('doc-ai-batch', async () => {
      await updateJob(job_id, { current_step: 'doc_ai', progress_pct: 20, progress_label: 'Document AI OCR (Sprint 2)...' });
    });

    await step.run('detect-structure', async () => {
      await updateJob(job_id, { current_step: 'detect_structure', progress_pct: 50, progress_label: 'Phân tích cấu trúc (Sprint 3)...' });
    });

    await step.run('extract-content', async () => {
      await updateJob(job_id, { current_step: 'extract', progress_pct: 70, progress_label: 'Trích xuất câu hỏi (Sprint 4)...' });
    });

    await step.run('parse-answer-keys', async () => {
      await updateJob(job_id, { current_step: 'answer_keys', progress_pct: 85, progress_label: 'Ghép đáp án (Sprint 4)...' });
    });

    await step.run('validate', async () => {
      await updateJob(job_id, { current_step: 'validate', progress_pct: 95, progress_label: 'Kiểm tra chất lượng...' });
    });

    await updateJob(job_id, {
      status: 'awaiting_review', current_step: 'done',
      progress_pct: 100, progress_label: 'Xử lý hoàn tất. Sẵn sàng review.',
      finished_at: new Date().toISOString(),
    });
  }
);

// ── Serve ──────────────────────────────────────────────────────────
export default serve({
  client: inngest,
  functions: [examProcessBook],
  signingKey: process.env.INNGEST_SIGNING_KEY,
});
