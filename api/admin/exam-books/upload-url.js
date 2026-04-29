import { getServerDb } from '../../../lib/supabase-server.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: 'Missing filename' });

  const path = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const db   = getServerDb();

  const { data, error } = await db.storage
    .from('exam-books')
    .createSignedUploadUrl(path);

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ signed_url: data.signedUrl, token: data.token, path });
}
