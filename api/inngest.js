import { serve } from 'inngest/vercel';
import { inngest } from '../lib/inngest-client.js';
import { getServerDb, updateJob } from '../lib/supabase-server.js';

// ── Function: process one exam book through the full pipeline ──────
const examProcessBook = inngest.createFunction(
  {
    id: 'exam-process-book',
    retries: 3,
    concurrency: { limit: 2 },
  },
  { event: 'exam/book.process' },
  async ({ event, step }) => {
    const { book_id, job_id } = event.data;
    const db = getServerDb();

    await updateJob(db, job_id, {
      status: 'running',
      current_step: 'upload_gcs',
      progress_pct: 5,
      progress_label: 'Bắt đầu xử lý...',
      started_at: new Date().toISOString(),
    });

    // ── Stage 2: Upload PDF to GCS (Sprint 2) ─────────────────────
    await step.run('upload-to-gcs', async () => {
      await updateJob(db, job_id, {
        current_step: 'upload_gcs',
        progress_pct: 10,
        progress_label: 'Đang copy PDF lên GCS...',
      });
      // TODO Sprint 2: copy from Supabase Storage → GCS
      // const book = await db.from('exam_books').select('*').eq('id', book_id).single();
      // await copyToGCS(book.data.source_pdf_path, book_id);
    });

    // ── Stage 3: Document AI Batch (Sprint 2) ─────────────────────
    await step.run('doc-ai-batch', async () => {
      await updateJob(db, job_id, {
        current_step: 'doc_ai',
        progress_pct: 20,
        progress_label: 'Đang chờ Document AI xử lý...',
      });
      // TODO Sprint 2: call Document AI Batch API
    });

    // ── Stage 4: Detect structure (Sprint 3) ──────────────────────
    await step.run('detect-structure', async () => {
      await updateJob(db, job_id, {
        current_step: 'detect_structure',
        progress_pct: 50,
        progress_label: 'Đang phân tích cấu trúc sub-unit...',
      });
      // TODO Sprint 3: rule-based structure detection
    });

    // ── Stage 5: Extract content with LLM (Sprint 4) ──────────────
    await step.run('extract-content', async () => {
      await updateJob(db, job_id, {
        current_step: 'extract',
        progress_pct: 70,
        progress_label: 'Đang trích xuất câu hỏi với AI...',
      });
      // TODO Sprint 4: LLM extract per section
    });

    // ── Stage 6: Parse answer keys + transcripts (Sprint 4) ───────
    await step.run('parse-answer-keys', async () => {
      await updateJob(db, job_id, {
        current_step: 'answer_keys',
        progress_pct: 85,
        progress_label: 'Đang ghép đáp án và transcript...',
      });
      // TODO Sprint 4: parse C. 解答說明 + B. 聽力對話
    });

    // ── Stage 7: Validate + notify (Sprint 4) ─────────────────────
    await step.run('validate', async () => {
      await updateJob(db, job_id, {
        current_step: 'validate',
        progress_pct: 95,
        progress_label: 'Đang kiểm tra chất lượng...',
      });
      // TODO Sprint 4: cross-validation rules
    });

    // ── Done ───────────────────────────────────────────────────────
    await updateJob(db, job_id, {
      status: 'awaiting_review',
      current_step: 'done',
      progress_pct: 100,
      progress_label: 'Xử lý hoàn tất. Sẵn sàng review.',
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
