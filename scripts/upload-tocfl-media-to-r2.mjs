// Upload TOCFL media from media/ → R2, rewrite URLs in tocfl_exams_full.json.
// Run: node scripts/upload-tocfl-media-to-r2.mjs [--dryrun] [--concurrency=10]

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
const R2_PUBLIC_URL        = readEnv('R2_PUBLIC_URL').replace(/\/$/, '');

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true];
}));
const DRYRUN = !!args.dryrun;
const CONC   = +(args.concurrency || 10);

const r2 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

function toR2Key(localPath) {
  const rel = path.relative(path.join(ROOT, 'media'), localPath).replace(/\\/g, '/');
  return 'tocfl/' + rel;
}

function r2Url(key) { return R2_PUBLIC_URL + '/' + key; }

async function r2Has(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch { return false; }
}

function mime(file) {
  if (file.endsWith('.mp3'))                        return 'audio/mpeg';
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
  if (file.endsWith('.png'))                        return 'image/png';
  if (file.endsWith('.webp'))                       return 'image/webp';
  return 'application/octet-stream';
}

async function uploadOne(localPath) {
  const key = toR2Key(localPath);
  if (await r2Has(key)) return { status: 'skip', key };
  if (DRYRUN)           return { status: 'dryrun', key };
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key,
    Body: fs.readFileSync(localPath),
    ContentType: mime(localPath),
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return { status: 'ok', key };
}

function walk(dir) {
  const files = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

async function runPool(items, conc, fn, onResult) {
  let i = 0, active = 0, done = 0;
  return new Promise(res => {
    function next() {
      while (active < conc && i < items.length) {
        const item = items[i++]; active++;
        fn(item).then(r => {
          active--; done++; onResult(r, done, items.length); next();
          if (done === items.length) res();
        }).catch(e => {
          active--; done++; onResult({ status: 'error', key: toR2Key(item), err: e.message }, done, items.length); next();
          if (done === items.length) res();
        });
      }
    }
    next();
  });
}

async function main() {
  console.log('R2 bucket :', R2_BUCKET);
  console.log('R2 public :', R2_PUBLIC_URL);
  console.log('Dry run   :', DRYRUN);
  console.log('');

  const mediaDir = path.join(ROOT, 'media');
  if (!fs.existsSync(mediaDir)) {
    console.error('media/ not found'); process.exit(1);
  }

  const files = walk(mediaDir);
  console.log(`Files to process: ${files.length} (concurrency ${CONC}${DRYRUN ? ', DRY RUN' : ''})\n`);

  let ok = 0, skip = 0, err = 0;

  await runPool(files, CONC, uploadOne, (r, done, total) => {
    if (r.status === 'ok')    ok++;
    else if (r.status === 'skip' || r.status === 'dryrun') skip++;
    else { err++; console.error('\n  ✗ Error:', r.key, r.err); }

    if (done % 50 === 0 || done === total)
      process.stdout.write(`\r  ${done}/${total} — ✓ ${ok} uploaded, ⏭ ${skip} skipped, ✗ ${err} errors   `);
  });

  console.log('\n');

  // Rewrite tocfl_exams_full.json with R2 URLs
  const jsonPath = path.join(ROOT, 'tocfl_exams_full.json');
  if (fs.existsSync(jsonPath)) {
    let raw = fs.readFileSync(jsonPath, 'utf8');
    const before = raw.length;
    raw = raw.replace(/"https:\/\/zh\.taiwandiary\.vn\/(audio\/[^"]+)"/g,
      (_, p) => '"' + R2_PUBLIC_URL + '/tocfl/' + p + '"');
    raw = raw.replace(/"https:\/\/zh\.taiwandiary\.vn\/(image\/[^"]+)"/g,
      (_, p) => '"' + R2_PUBLIC_URL + '/tocfl/' + p + '"');
    if (!DRYRUN) {
      fs.writeFileSync(jsonPath, raw, 'utf8');
      console.log('✓ URLs rewritten in tocfl_exams_full.json (' + before + ' → ' + raw.length + ' bytes)');
    } else {
      const changed = (raw.match(/pub-/g) || []).length;
      console.log('(dry run) — would rewrite ~' + changed + ' URLs in tocfl_exams_full.json');
    }
  } else {
    console.warn('⚠ tocfl_exams_full.json not found — skipping URL rewrite');
  }

  console.log(`\n✓ Done. Uploaded: ${ok}, Skipped: ${skip}, Errors: ${err}`);
  if (err > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
