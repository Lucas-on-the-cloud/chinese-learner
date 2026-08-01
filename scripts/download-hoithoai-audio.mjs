// Download hoithoai audio from zh.taiwandiary.vn → Cloudflare R2
// Updates public/data/hoithoai.json in-place with R2 URLs.
//
// Reads creds from .env.local: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL
// Idempotent: skips files already on R2 (HEAD check).
//
// Usage:
//   node scripts/download-hoithoai-audio.mjs --dryrun       # preview only, no upload
//   node scripts/download-hoithoai-audio.mjs --concurrency=4
//   node scripts/download-hoithoai-audio.mjs                # full run

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true];
}));
const DRYRUN = !!args.dryrun;
const CONC   = +(args.concurrency || 4);
const SOURCE_BASE = 'https://zh.taiwandiary.vn/';
const R2_PREFIX   = 'hoithoai/';

function readEnv(key) {
  try {
    const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
    const m = env.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  } catch { return ''; }
}

const R2_ENDPOINT          = readEnv('R2_ENDPOINT');
const R2_ACCESS_KEY_ID     = readEnv('R2_ACCESS_KEY_ID');
const R2_SECRET_ACCESS_KEY = readEnv('R2_SECRET_ACCESS_KEY');
const R2_BUCKET            = readEnv('R2_BUCKET');
const R2_PUBLIC_URL        = readEnv('R2_PUBLIC_URL').replace(/\/+$/, '');

if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_BUCKET || !R2_PUBLIC_URL) {
  console.error('✗ Missing R2 env vars. Need: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL');
  process.exit(1);
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

async function r2Has(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch { return false; }
}

async function downloadBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

async function processFile(audioPath, idx, total) {
  const r2Key    = R2_PREFIX + audioPath;
  const srcUrl   = SOURCE_BASE + audioPath;
  const r2Url    = `${R2_PUBLIC_URL}/${r2Key}`;
  const ext      = path.extname(audioPath).toLowerCase();
  const mimeMap  = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg' };
  const mime     = mimeMap[ext] || 'audio/mpeg';

  process.stdout.write(`[${idx}/${total}] ${audioPath} ... `);

  if (DRYRUN) { console.log('(dryrun)'); return r2Url; }

  if (await r2Has(r2Key)) { console.log('✓ already on R2'); return r2Url; }

  try {
    const buf = await downloadBuffer(srcUrl);
    await r2.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: r2Key,
      Body: buf,
      ContentType: mime,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    console.log(`✓ uploaded (${(buf.length / 1024).toFixed(0)} KB)`);
    return r2Url;
  } catch (err) {
    console.log(`✗ FAILED: ${err.message}`);
    return null;
  }
}

// Run with limited concurrency
async function runPool(tasks, concurrency) {
  const results = new Array(tasks.length);
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

(async () => {
  const jsonPath = path.join(ROOT, 'public', 'data', 'hoithoai.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  // Collect unique audio paths
  const uniquePaths = [...new Set(data.items.filter(it => it.audio).map(it => it.audio))];
  console.log(`Found ${uniquePaths.length} unique audio files to process (concurrency=${CONC})${DRYRUN ? ' [DRYRUN]' : ''}\n`);

  // Build tasks
  const pathToUrl = {};
  const tasks = uniquePaths.map((audioPath, i) =>
    () => processFile(audioPath, i + 1, uniquePaths.length).then(url => {
      pathToUrl[audioPath] = url;
    })
  );

  await runPool(tasks, CONC);

  const failed = Object.entries(pathToUrl).filter(([, v]) => v === null);
  console.log(`\n─── Done: ${uniquePaths.length - failed.length} ok, ${failed.length} failed ───`);
  if (failed.length) {
    console.log('Failed files:');
    failed.forEach(([p]) => console.log('  ', p));
  }

  if (DRYRUN) {
    console.log('\n(dryrun) hoithoai.json not updated.');
    return;
  }

  // Update hoithoai.json: replace audio paths with R2 URLs
  let updated = 0;
  for (const item of data.items) {
    if (item.audio && pathToUrl[item.audio]) {
      item.audio = pathToUrl[item.audio];
      updated++;
    }
  }

  fs.writeFileSync(jsonPath, JSON.stringify(data), 'utf8');
  console.log(`\nUpdated hoithoai.json: ${updated} items now point to R2.`);
  console.log('Next: update hoithoai-study.html to use item.audio as full URL (no base prepend).');
})();
