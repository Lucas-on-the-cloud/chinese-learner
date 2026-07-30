// Import Band C Question Bank → Supabase TOCFL tables (band='QB-C').
// Parses TXT files + Answer XLSX, uploads MP3s to R2, upserts to DB.
//
// Usage:
//   node scripts/import-qbank-c.mjs --dryrun          # parse only, print counts
//   node scripts/import-qbank-c.mjs --skip-upload      # no R2 upload, still writes DB
//   node scripts/import-qbank-c.mjs                    # full run

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getServiceClient } from './_supabase.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const xlsx = require('xlsx');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QB   = path.join(ROOT, 'question_bank', 'bandC');

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true];
}));
const DRYRUN      = !!args.dryrun;
const SKIP_UPLOAD = !!args['skip-upload'] || DRYRUN;

// ─── R2 setup ────────────────────────────────────────────────────────────────
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

let r2;
if (!SKIP_UPLOAD) {
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_URL) {
    console.error('✗ Missing R2 env vars in .env.local');
    process.exit(1);
  }
  r2 = new S3Client({
    region: 'auto', endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
}

function r2url(r2Key) {
  return `${R2_PUBLIC_URL}/${r2Key}`;
}

async function r2Has(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch (e) {
    if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) return false;
    throw e;
  }
}

async function uploadMp3(localPath, r2Key) {
  if (SKIP_UPLOAD) return r2url(r2Key);
  if (await r2Has(r2Key)) return r2url(r2Key);
  const buf = fs.readFileSync(localPath);
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: r2Key, Body: buf,
    ContentType: 'audio/mpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return r2url(r2Key);
}

// ─── XLSX parser ─────────────────────────────────────────────────────────────
// Returns: [{filename, groupAudioId, questions:[{qNum,answer,audioId}]}]
function parseAnswerXlsx(filePath, hasAudio) {
  const wb = xlsx.readFile(filePath);
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sh, { header: 1 }).slice(1); // skip header

  const groups = [];
  let cur = null;

  for (const row of rows) {
    const filename  = row[1] ? String(row[1]).trim() : null;
    const answer    = row[2] ? String(row[2]).trim() : null;
    const audioId   = hasAudio && row[3] ? String(row[3]).trim() : null;

    if (filename) {
      // New group
      if (answer) {
        // Single-question group (Q-prefix with direct answer)
        cur = { filename, groupAudioId: audioId, questions: [{ qNum: 1, answer, audioId }] };
      } else {
        // Multi-question group (null answer means sub-rows follow)
        cur = { filename, groupAudioId: audioId, questions: [] };
      }
      groups.push(cur);
    } else if (cur && answer) {
      // Sub-question row
      const qNum = cur.questions.length + 1;
      cur.questions.push({ qNum, answer, audioId });
    }
  }
  return groups;
}

// ─── Text parsers ─────────────────────────────────────────────────────────────

// Parse Listening _T file → [{qNum, options:{A,B,C,D}}]
function parseListeningOptions(content) {
  const lines = content.split('\n').map(l => l.trim());
  const qs = [];
  let cur = null;
  for (const line of lines) {
    if (/^\d+[.．]\s*$/.test(line)) {
      cur = { qNum: parseInt(line), options: {} };
      qs.push(cur);
    } else if (cur) {
      const m = /^（([A-D])）(.+)/.exec(line);
      if (m) cur.options[m[1]] = m[2].trim();
    }
  }
  return qs;
}

// Parse Listening Script → {sharedText, questionTexts:[]}
function parseListeningScript(content, numQuestions) {
  const lines = content.split('\n').map(l => l.trim());
  const nonEmpty = lines.filter(l => l);

  // Patterns
  const arabicQRe   = /^(\d+)[.．]\s+([^（A-D（].{3,})/; // "1. 問題文字"
  const romanQRe    = /^(I{1,3}|IV|VI{0,3}|V)[.．]\s+(.+)/;
  const speakerRe   = /^[男女甲乙丙丁主記者訪談聽眾播音員]+[：:]/;
  const singleQRe   = /^\d+[.．]\s*$/; // just "1."

  // Detect Roman numeral questions (in preamble before dialogue)
  const romanQs = nonEmpty.filter(l => romanQRe.test(l)).map(l => romanQRe.exec(l)[2].trim());

  // Detect Arabic questions at end (not option lines)
  const arabicQs = [];
  for (const l of nonEmpty) {
    const m = arabicQRe.exec(l);
    if (m) arabicQs.push({ num: +m[1], text: m[2].trim() });
  }

  // Detect single-Q format (first line is just "1.")
  const isSingleQ = singleQRe.test(nonEmpty[0] || '');

  let questionTexts = [];

  if (arabicQs.length >= numQuestions) {
    questionTexts = arabicQs.map(q => q.text);
  } else if (romanQs.length >= numQuestions) {
    questionTexts = romanQs;
  } else if (isSingleQ || numQuestions === 1) {
    // Single question: find last speaker question line
    const speakerLines = nonEmpty.filter(l => speakerRe.test(l));
    const lastSpeaker = speakerLines[speakerLines.length - 1] || '';
    const qText = lastSpeaker.replace(/^[^：:]+[：:]/, '').trim();
    questionTexts = [qText];
  } else {
    questionTexts = Array.from({ length: numQuestions }, (_, i) => `第 ${i+1} 題`);
  }

  // Build shared text (strip trailing Arabic question lines, strip leading "1." for single-Q)
  let sharedLines = [...nonEmpty];
  if (arabicQs.length > 0) {
    const firstArabicLine = nonEmpty.findIndex(l => arabicQRe.test(l));
    if (firstArabicLine > 0) sharedLines = nonEmpty.slice(0, firstArabicLine);
  }
  if (isSingleQ && sharedLines[0] && singleQRe.test(sharedLines[0])) {
    sharedLines = sharedLines.slice(1);
  }
  // Remove last speaker line if it's the question (single-Q format)
  if (numQuestions === 1 && questionTexts[0]) {
    const lastIdx = sharedLines.length - 1;
    const lastLine = sharedLines[lastIdx] || '';
    if (speakerRe.test(lastLine) && lastLine.includes(questionTexts[0].slice(0, 6))) {
      sharedLines = sharedLines.slice(0, lastIdx);
    }
  }

  return {
    sharedText: sharedLines.join('\n').trim(),
    questionTexts,
  };
}

// Parse Gap Filling _T file → {passageText, questions:[{qNum,options}]}
function parseGapFilling(content) {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l);

  // Options header: "1. 2." or "5." — all digits and dots/spaces
  const isHeader = l => /^[\d.．\s]+$/.test(l) && /\d/.test(l);

  let optStart = lines.findIndex(isHeader);
  if (optStart < 0) optStart = lines.length;

  const passageText = lines.slice(0, optStart).join('\n').trim();
  const optLines = lines.slice(optStart);

  const questions = {};
  let currentNums = [];

  for (const line of optLines) {
    if (isHeader(line)) {
      currentNums = line.match(/\d+/g).map(Number);
      for (const n of currentNums) {
        if (!questions[n]) questions[n] = { qNum: n, options: {} };
      }
      continue;
    }
    // Option line: may have 1 or 2 columns
    const allOpts = [...line.matchAll(/（([A-D])）([^（]*)/g)];
    for (let i = 0; i < allOpts.length && i < currentNums.length; i++) {
      const label = allOpts[i][1];
      const text  = allOpts[i][2].trim();
      questions[currentNums[i]].options[label] = text;
    }
  }

  return {
    passageText,
    questions: Object.values(questions).sort((a, b) => a.qNum - b.qNum),
  };
}

// Parse Reading Comp _T file → {passageText, questions:[{qNum,text,options}]}
function parseReadingComp(content) {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l);

  const qStartRe = /^(\d+)[.．]\s+([^（].{2,})/;
  const optRe    = /^（([A-D])）(.+)/;

  const passageLines = [];
  const questions = {};
  let cur = null;
  let inPassage = true;

  for (const line of lines) {
    const qm  = qStartRe.exec(line);
    const om  = optRe.exec(line);

    if (qm && !om) {
      inPassage = false;
      cur = { qNum: +qm[1], text: qm[2].trim(), options: {} };
      questions[+qm[1]] = cur;
    } else if (om && cur) {
      cur.options[om[1]] = om[2].trim();
    } else if (inPassage) {
      passageLines.push(line);
    }
  }

  return {
    passageText: passageLines.join('\n').trim(),
    questions: Object.values(questions).sort((a, b) => a.qNum - b.qNum),
  };
}

// ─── Upsert helper ────────────────────────────────────────────────────────────
const sb = DRYRUN ? null : getServiceClient();

async function upsert(table, rows) {
  if (!rows.length) return;
  if (DRYRUN) { console.log(`  [dryrun] ${rows.length} → ${table}`); return; }
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + CHUNK), { onConflict: 'id' });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n═══ Import Band C Question Bank${DRYRUN ? ' [DRYRUN]' : ''}${SKIP_UPLOAD ? ' [SKIP_UPLOAD]' : ''} ═══\n`);

  // Collect all DB rows
  const exams = [], parts = [], groups = [], questions = [], options = [];
  let totalMp3Uploads = 0, totalMp3Skipped = 0;

  // ── ID ranges (safe above existing max: exam=16, part=154, group=413, q=2003, opt=6723) ──
  const EXAM_ID = 1000;
  let partId    = 2000;
  let groupId   = 5000;
  let qId       = 10000;
  let optId     = 50000;

  // ── Exam ──
  exams.push({
    id: EXAM_ID,
    title: 'Band C 題庫練習',
    band: 'QB-C',
    publish_year: null,
    total_questions: 0, // updated at end
  });

  // ── Parts ──
  const PART_DEFS = [
    { part_number: 1, skill: 'Listening', instruction: '對話（Dialogue）' },
    { part_number: 2, skill: 'Listening', instruction: '段落（Monologue）' },
    { part_number: 3, skill: 'Reading',   instruction: '選詞填空（Gap Filling）' },
    { part_number: 4, skill: 'Reading',   instruction: '閱讀理解（Reading Comprehension）' },
  ];
  const PART_IDS = {};
  for (const p of PART_DEFS) {
    const id = ++partId;
    PART_IDS[p.part_number] = id;
    parts.push({ id, exam_id: EXAM_ID, ...p, question_count: 0 });
  }
  // shorthand part IDs by number
  const [PID_DL, PID_ML, PID_GF, PID_RC] = [1,2,3,4].map(n => PART_IDS[n]);

  // ═══ Helper: upload MP3 group ═════════════════════════════════════════════
  async function maybeUploadMp3(localMp3Dir, audioId, r2Subdir) {
    if (!audioId) return null;
    const fname    = `${audioId}.mp3`;
    const localFp  = path.join(localMp3Dir, fname);
    const r2Key    = `qbank/bandc/${r2Subdir}/${fname}`;
    if (!fs.existsSync(localFp)) return null;
    try {
      return await uploadMp3(localFp, r2Key);
    } catch (e) {
      console.warn(`  ⚠ upload failed ${fname}: ${e.message}`);
      return null;
    }
  }

  // ═══ Process Dialogue ═════════════════════════════════════════════════════
  console.log('── Dialogue ──');
  {
    const curPartId  = PID_DL;
    const qCountBefore = questions.length;
    const xlsxGroups = parseAnswerXlsx(
      path.join(QB, 'C_L_Dialogue_Answer.xlsx'), true
    );
    const tDir = path.join(QB, 'C_L_Dialogue_T');
    const lsDir = path.join(QB, 'C_L_Dialogue_Listening Script');
    const mp3Dir = path.join(QB, 'C_L_Dialogue_MP3');

    let orderNum = 0;
    for (const xg of xlsxGroups) {
      const { filename, groupAudioId, questions: xqs } = xg;
      const curGroupId = ++groupId;

      // Check TXT files exist
      const tFile  = path.join(tDir, `${filename}.txt`);
      const lsFile = path.join(lsDir, `${filename}.txt`);
      if (!fs.existsSync(tFile) || !fs.existsSync(lsFile)) {
        console.warn(`  ⚠ skip ${filename} (no TXT)`);
        groupId--; continue;
      }

      // Parse
      const tContent  = fs.readFileSync(tFile,  'utf8');
      const lsContent = fs.readFileSync(lsFile, 'utf8');

      const optBlocks = parseListeningOptions(tContent);
      const { sharedText, questionTexts } = parseListeningScript(lsContent, xqs.length);

      // Upload group audio
      const groupAudioUrl = await maybeUploadMp3(mp3Dir, groupAudioId, 'dialogue');
      if (groupAudioUrl) totalMp3Uploads++;

      groups.push({
        id: curGroupId,
        part_id: curPartId,
        order_num: ++orderNum,
        level: null,
        shared_text: sharedText || null,
        shared_audio_url: groupAudioUrl,
        shared_image_url: null,
      });

      for (const xq of xqs) {
        const { qNum, answer, audioId } = xq;
        const curQId = ++qId;

        // Upload question audio
        const qAudioUrl = (audioId && audioId !== groupAudioId)
          ? await maybeUploadMp3(mp3Dir, audioId, 'dialogue')
          : null;
        if (qAudioUrl) totalMp3Uploads++; else if (audioId !== groupAudioId) totalMp3Skipped++;

        const qText = questionTexts[qNum - 1] || null;
        const optBlock = optBlocks.find(o => o.qNum === qNum) || { options: {} };

        questions.push({
          id: curQId, group_id: curGroupId, question_num: qNum,
          question_text: qText,
          question_audio_url: qAudioUrl,
          question_image_url: null,
          explanation: null,
        });

        for (const label of ['A', 'B', 'C', 'D']) {
          const text = optBlock.options[label];
          if (!text) continue;
          options.push({
            id: ++optId, question_id: curQId,
            label, text, image_url: null,
            is_correct: label === answer,
          });
        }
      }
    }
    parts.find(p => p.id === curPartId).question_count = questions.length - qCountBefore;
    console.log(`  ${orderNum} groups, ${questions.length - qCountBefore} questions`);
  }

  // ═══ Process Monologue ════════════════════════════════════════════════════
  console.log('── Monologue ──');
  {
    const curPartId  = PID_ML;
    const qCountBefore = questions.length;
    const xlsxGroups = parseAnswerXlsx(
      path.join(QB, 'C_L_Monologue_Answer.xlsx'), true
    );
    const tDir  = path.join(QB, 'C_L_Monologue_T');
    const lsDir = path.join(QB, 'C_L_Monologue_Listening Script');
    const mp3Dir = path.join(QB, 'C_L_Monologue_MP3');

    let orderNum = 0;
    for (const xg of xlsxGroups) {
      const { filename, groupAudioId, questions: xqs } = xg;
      const curGroupId = ++groupId;

      const tFile  = path.join(tDir,  `${filename}.txt`);
      const lsFile = path.join(lsDir, `${filename}.txt`);
      if (!fs.existsSync(tFile) || !fs.existsSync(lsFile)) {
        console.warn(`  ⚠ skip ${filename} (no TXT)`);
        groupId--; continue;
      }

      const tContent  = fs.readFileSync(tFile,  'utf8');
      const lsContent = fs.readFileSync(lsFile, 'utf8');

      const optBlocks = parseListeningOptions(tContent);
      const { sharedText, questionTexts } = parseListeningScript(lsContent, xqs.length);

      const groupAudioUrl = await maybeUploadMp3(mp3Dir, groupAudioId, 'monologue');
      if (groupAudioUrl) totalMp3Uploads++;

      groups.push({
        id: curGroupId, part_id: curPartId, order_num: ++orderNum, level: null,
        shared_text: sharedText || null,
        shared_audio_url: groupAudioUrl,
        shared_image_url: null,
      });

      for (const xq of xqs) {
        const { qNum, answer, audioId } = xq;
        const curQId = ++qId;

        const qAudioUrl = (audioId && audioId !== groupAudioId)
          ? await maybeUploadMp3(mp3Dir, audioId, 'monologue')
          : null;
        if (qAudioUrl) totalMp3Uploads++;

        const qText    = questionTexts[qNum - 1] || null;
        const optBlock = optBlocks.find(o => o.qNum === qNum) || { options: {} };

        questions.push({
          id: curQId, group_id: curGroupId, question_num: qNum,
          question_text: qText,
          question_audio_url: qAudioUrl,
          question_image_url: null,
          explanation: null,
        });

        for (const label of ['A', 'B', 'C', 'D']) {
          const text = optBlock.options[label];
          if (!text) continue;
          options.push({
            id: ++optId, question_id: curQId,
            label, text, image_url: null,
            is_correct: label === answer,
          });
        }
      }
    }
    parts.find(p => p.id === curPartId).question_count = questions.length - qCountBefore;
    console.log(`  ${orderNum} groups, ${questions.length - qCountBefore} questions`);
  }

  // ═══ Process Gap Filling ══════════════════════════════════════════════════
  console.log('── Gap Filling ──');
  {
    const curPartId = PID_GF;
    const qCountBefore = questions.length;
    const xlsxGroups = parseAnswerXlsx(
      path.join(QB, 'C_R_Gap Filling_Answer.xlsx'), false
    );
    const tDir = path.join(QB, 'C_R_Gap Filling_T', 'C_R_Gap Filling_T');

    let orderNum = 0;
    for (const xg of xlsxGroups) {
      const { filename, questions: xqs } = xg;
      const curGroupId = ++groupId;

      const tFile = path.join(tDir, `${filename}.txt`);
      if (!fs.existsSync(tFile)) {
        console.warn(`  ⚠ skip ${filename} (no TXT)`);
        groupId--; continue;
      }

      const { passageText, questions: parsed } = parseGapFilling(
        fs.readFileSync(tFile, 'utf8')
      );

      groups.push({
        id: curGroupId, part_id: curPartId, order_num: ++orderNum, level: null,
        shared_text: passageText || null,
        shared_audio_url: null,
        shared_image_url: null,
      });

      for (const xq of xqs) {
        const { qNum, answer } = xq;
        const curQId = ++qId;
        const pq  = parsed.find(q => q.qNum === qNum) || { options: {} };

        questions.push({
          id: curQId, group_id: curGroupId, question_num: qNum,
          question_text: null,
          question_audio_url: null, question_image_url: null, explanation: null,
        });

        for (const label of ['A', 'B', 'C', 'D']) {
          const text = pq.options[label];
          if (!text) continue;
          options.push({
            id: ++optId, question_id: curQId,
            label, text, image_url: null,
            is_correct: label === answer,
          });
        }
      }
    }
    parts.find(p => p.id === curPartId).question_count = questions.length - qCountBefore;
    console.log(`  ${orderNum} groups, ${questions.length - qCountBefore} questions`);
  }

  // ═══ Process Reading Comprehension ════════════════════════════════════════
  console.log('── Reading Comprehension ──');
  {
    const curPartId = PID_RC;
    const qCountBefore = questions.length;
    const xlsxGroups = parseAnswerXlsx(
      path.join(QB, 'C_R_Reading Comprehension_Answer.xlsx'), false
    );
    const tDir = path.join(QB, 'C_R_Reading Comprehension_T', 'C_R_Reading Comprehension_T');

    let orderNum = 0;
    for (const xg of xlsxGroups) {
      const { filename, questions: xqs } = xg;
      const curGroupId = ++groupId;

      const tFile = path.join(tDir, `${filename}.txt`);
      if (!fs.existsSync(tFile)) {
        console.warn(`  ⚠ skip ${filename} (no TXT)`);
        groupId--; continue;
      }

      const { passageText, questions: parsed } = parseReadingComp(
        fs.readFileSync(tFile, 'utf8')
      );

      groups.push({
        id: curGroupId, part_id: curPartId, order_num: ++orderNum, level: null,
        shared_text: passageText || null,
        shared_audio_url: null,
        shared_image_url: null,
      });

      for (const xq of xqs) {
        const { qNum, answer } = xq;
        const curQId = ++qId;
        const pq  = parsed.find(q => q.qNum === qNum);

        questions.push({
          id: curQId, group_id: curGroupId, question_num: qNum,
          question_text: pq?.text || null,
          question_audio_url: null, question_image_url: null, explanation: null,
        });

        const src = pq || { options: {} };
        for (const label of ['A', 'B', 'C', 'D']) {
          const text = src.options[label];
          if (!text) continue;
          options.push({
            id: ++optId, question_id: curQId,
            label, text, image_url: null,
            is_correct: label === answer,
          });
        }
      }
    }
    parts.find(p => p.id === curPartId).question_count = questions.length - qCountBefore;
    console.log(`  ${orderNum} groups, ${questions.length - qCountBefore} questions`);
  }

  // ── Totals ──
  exams[0].total_questions = questions.length;

  console.log(`\nTotals:`);
  console.log(`  ${exams.length} exam, ${parts.length} parts, ${groups.length} groups`);
  console.log(`  ${questions.length} questions, ${options.length} options`);
  console.log(`  MP3: ${totalMp3Uploads} uploaded, ${totalMp3Skipped} skipped`);

  // ── Upsert to Supabase ──
  if (DRYRUN) {
    console.log('\n[DRYRUN] Nothing written to Supabase.\n');
    return;
  }

  await upsert('tocfl_exams',     exams);     console.log('✓ tocfl_exams');
  await upsert('tocfl_parts',     parts);     console.log('✓ tocfl_parts');
  await upsert('tocfl_groups',    groups);    console.log('✓ tocfl_groups');
  await upsert('tocfl_questions', questions); console.log('✓ tocfl_questions');
  await upsert('tocfl_options',   options);   console.log('✓ tocfl_options');
  console.log('\n✓ Import complete.');
}

main().catch(e => { console.error(e); process.exit(1); });
