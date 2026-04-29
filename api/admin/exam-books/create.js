import { getServerDb } from '../../../lib/supabase-server.js';
import { inngest } from '../../../lib/inngest-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { title, level, total_units, source_pdf_path, total_pages } = req.body;
  if (!title || !source_pdf_path) {
    return res.status(400).json({ error: 'Thiếu title hoặc source_pdf_path' });
  }

  const db = getServerDb();

  // Create exam_books record
  const { data: book, error: bookErr } = await db
    .from('exam_books')
    .insert({
      title,
      level:         level || null,
      total_units:   parseInt(total_units) || 30,
      total_pages:   parseInt(total_pages) || null,
      source_pdf_path,
      status:        'draft',
    })
    .select()
    .single();

  if (bookErr) return res.status(500).json({ error: bookErr.message });

  // Create exam_jobs record
  const { data: job, error: jobErr } = await db
    .from('exam_jobs')
    .insert({
      book_id:        book.id,
      job_type:       'full_pipeline',
      status:         'queued',
      current_step:   'queued',
      progress_pct:   0,
      progress_label: 'Đang chờ xử lý...',
    })
    .select()
    .single();

  if (jobErr) return res.status(500).json({ error: jobErr.message });

  // Trigger Inngest job
  try {
    await inngest.send({
      name: 'exam/book.process',
      data: { book_id: book.id, job_id: job.id },
    });
  } catch (e) {
    // Non-fatal: job is in DB, can be triggered manually
    console.error('Inngest send failed:', e.message);
  }

  return res.status(200).json({ book_id: book.id, job_id: job.id });
}
