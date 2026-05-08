// Tiny self-hosted yt-dlp wrapper. Two endpoints:
//   GET /info?url=...   → JSON { videoUrl, thumbnail, title, duration, uploader }
//   GET /video?url=...  → streams mp4 (with CORS) so browser can blob it
//
// CORS is wide-open because this is a personal tool. If you want, restrict
// Origin to your domain via the ALLOWED_ORIGIN env var.

import express from 'express';
import { spawn } from 'node:child_process';

const app = express();
const ALLOWED = process.env.ALLOWED_ORIGIN || '*';

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/', (_, res) => res.type('text').send('ig-downloader OK\n\nGET /info?url=...\nGET /video?url=...'));

app.get('/healthz', (_, res) => res.json({ ok: true }));

// Run yt-dlp synchronously, capturing stdout as JSON.
function ytdlpJson(url) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', ['-j', '--no-playlist', '--no-warnings', url], {
      timeout: 25_000,
    });
    let out = '', err = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.stderr.on('data', d => err += d.toString());
    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`yt-dlp exit ${code}: ${err.slice(0, 400)}`));
      try { resolve(JSON.parse(out)); }
      catch (e) { reject(new Error('yt-dlp output not JSON: ' + out.slice(0, 200))); }
    });
  });
}

app.get('/info', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'missing ?url=' });
  try {
    const meta = await ytdlpJson(String(url));
    res.json({
      videoUrl: meta.url || null,
      thumbnail: meta.thumbnail || null,
      title: meta.title || meta.fulltitle || null,
      duration: meta.duration || null,
      uploader: meta.uploader || meta.uploader_id || null,
      description: meta.description || null,
    });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e).slice(0, 600) });
  }
});

app.get('/video', (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).end('missing ?url=');
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  const proc = spawn('yt-dlp', [
    '-o', '-',
    '--no-playlist',
    '--no-warnings',
    '-f', 'best[ext=mp4]/best',
    String(url),
  ], { timeout: 60_000 });
  proc.stdout.pipe(res);
  let stderr = '';
  proc.stderr.on('data', d => { stderr += d.toString(); });
  proc.on('error', e => { if (!res.headersSent) res.status(500).end(e.message); });
  proc.on('close', code => {
    if (code !== 0 && !res.headersSent) {
      res.status(502).end('yt-dlp failed: ' + stderr.slice(0, 300));
    }
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('ig-downloader listening on :' + port));
