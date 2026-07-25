// Fetches makemeahanzi dictionary and extracts IDS decomposition strings + component metadata.
// Outputs:
//   public/data/cjk-ids.json        — { char: "⿰亻故" } IDS map
//   public/data/component-meta.json — { char: { py, def, rad } } fallback metadata
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT     = path.join(__dirname, '..', 'public', 'data', 'cjk-ids.json');
const OUT_META = path.join(__dirname, '..', 'public', 'data', 'component-meta.json');

const URLS = [
  'https://cdn.jsdelivr.net/gh/skishore/makemeahanzi@master/dictionary.txt',
];

function get(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    if (!redirects) return reject(new Error('Too many redirects'));
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'node-fetch/generate-ids' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(get(res.headers.location, redirects - 1));
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

async function main() {
  console.log('Fetching makemeahanzi dictionary…');
  let text;
  for (const url of URLS) {
    try { text = await get(url); break; } catch (e) { console.warn('  failed:', url, e.message); }
  }
  if (!text) { console.error('Could not fetch any source.'); process.exit(1); }

  const ids = {};
  const meta = {};
  let count = 0;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const entry = JSON.parse(t);
      const ch = entry.character;
      const dc = entry.decomposition;
      if (!ch) continue;
      if (dc && dc !== '？' && dc !== '?') {
        ids[ch] = dc;
        count++;
      }
      // Always capture metadata for any character with useful fields
      const py  = Array.isArray(entry.pinyin) ? entry.pinyin[0] : (entry.pinyin || '');
      const def = entry.definition || '';
      const rad = entry.radical   || '';
      if (py || def || rad) {
        meta[ch] = {};
        if (py)  meta[ch].py  = py;
        if (def) meta[ch].def = def;
        if (rad) meta[ch].rad = rad;
      }
    } catch { /* skip */ }
  }

  console.log(`Parsed ${count} IDS entries, ${Object.keys(meta).length} metadata entries.`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(ids));
  const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
  console.log(`Written: ${OUT}  (${kb} KB)`);

  fs.writeFileSync(OUT_META, JSON.stringify(meta));
  const kb2 = (fs.statSync(OUT_META).size / 1024).toFixed(1);
  console.log(`Written: ${OUT_META}  (${kb2} KB)`);
}

main().catch(e => { console.error(e); process.exit(1); });
