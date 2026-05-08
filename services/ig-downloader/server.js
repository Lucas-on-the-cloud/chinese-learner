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

// Run yt-dlp synchronously, capturing stdout as JSON. -f forces format
// selection so meta.url is populated (default -j leaves it null on some sites).
function ytdlpJson(url) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', [
      '-j',
      '--no-playlist',
      '--no-warnings',
      '-f', 'best[ext=mp4]/best',
      url,
    ], { timeout: 25_000 });
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

// Defensive: try meta.url first, then requested_formats, then highest-res
// video format from formats[].
function extractVideoUrl(meta) {
  if (meta.url) return meta.url;
  if (Array.isArray(meta.requested_formats)) {
    const v = meta.requested_formats.find(f => f.vcodec && f.vcodec !== 'none');
    if (v?.url) return v.url;
  }
  if (Array.isArray(meta.formats)) {
    const candidates = meta.formats
      .filter(f => f.url && f.vcodec && f.vcodec !== 'none')
      .sort((a, b) => (b.height || 0) - (a.height || 0));
    if (candidates[0]) return candidates[0].url;
  }
  return null;
}

app.get('/info', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'missing ?url=' });
  try {
    const meta = await ytdlpJson(String(url));
    res.json({
      videoUrl: extractVideoUrl(meta),
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

// Debug endpoint: returns full yt-dlp metadata so we can inspect format shape.
app.get('/debug', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'missing ?url=' });
  try {
    res.json(await ytdlpJson(String(url)));
  } catch (e) {
    res.status(502).json({ error: String(e.message || e).slice(0, 600) });
  }
});

// Stream audio-only m4a (much smaller than full mp4) — Whisper accepts m4a
// natively. Saves ~80% bandwidth + browser→Whisper upload time.
app.get('/video', (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).end('missing ?url=');
  res.setHeader('Content-Type', 'audio/mp4');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  const proc = spawn('yt-dlp', [
    '-o', '-',
    '--no-playlist',
    '--no-warnings',
    '-f', 'bestaudio[ext=m4a]/bestaudio/best',
    '-x', '--audio-format', 'm4a',
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
