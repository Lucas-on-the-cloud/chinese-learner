import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client using service role key (bypasses RLS)
export function getServerDb() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function updateJob(db, jobId, fields) {
  const { error } = await db
    .from('exam_jobs')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) console.error('updateJob error:', error.message);
}
