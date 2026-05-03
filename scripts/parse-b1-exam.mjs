// Parse exam markdown files → <level>-exam.json (single combined file).
// Logic ported from public/admin/js/exams.js
//
// Run:  node scripts/parse-b1-exam.mjs --level=B1
//   or: node scripts/parse-b1-exam.mjs --level=B2 --title="TOCFL B2 Level 4 — 高階篇"

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const argLevel = process.argv.find(a => a.startsWith('--level='))?.slice(8) || 'B1';
const argTitle = process.argv.find(a => a.startsWith('--title='))?.slice(8);

const TITLES = {
  B1: 'TOCFL B1 Level 3 — 進階篇',
  B2: 'TOCFL B2 Level 4 — 高階篇',
};

const LEVEL = argLevel.toUpperCase();
const TITLE = argTitle || TITLES[LEVEL] || `TOCFL ${LEVEL}`;

const EXERCISE = path.join(ROOT, LEVEL, `${LEVEL}_markdown_excercise.md`);
const ANSWERS  = path.join(ROOT, LEVEL, `${LEVEL}_markdown_answer.md`);
const OUT      = path.join(ROOT, `${LEVEL.toLowerCase()}-exam.json`);

console.log(`Level: ${LEVEL} · Title: ${TITLE}`);

// ─── Parsers (ported from admin/js/exams.js) ───────────────────────────────

function parseMdAnswers(text) {
  const answers = {};
  // Match ANY "Unit X" header — sub-id format may be OCR-mangled (X-Y, X.Y, XY, X) X-Y, X B-Y, etc.)
  const unitRe = /^#{0,3}\s*Unit\s+(\d+)\b/gm;
  const positions = [];
  let m;
  while ((m = unitRe.exec(text)) !== null) {
    positions.push({ unitNum: parseInt(m[1]), idx: m.index, headerEnd: m.index + m[0].length });
  }

  positions.forEach((pos, i) => {
    const blockEnd = i + 1 < positions.length ? positions[i + 1].idx : text.length;
    const block    = text.slice(pos.headerEnd, blockEnd);
    const headerLine = text.slice(pos.idx, pos.headerEnd + 40).split('\n')[0];

    // Strategy: header "X-Y" clean (where X==unitNum) → trust header.
    // Otherwise (mangled — letter prefix, no separator), count body footers.
    let subNum = null;
    const restAfterUnit = headerLine.slice(pos.headerEnd - pos.idx);

    // Step 1: header "X-Y" or "X.Y" with X matching unit → clean
    const hm = restAfterUnit.match(/(\d+)[-.](\d+)/);
    if (hm && parseInt(hm[1]) === pos.unitNum) {
      subNum = parseInt(hm[2]);
    } else {
      // Step 2: tally footers within block
      const fmCounts = {};
      const add = sub => { fmCounts[sub] = (fmCounts[sub] || 0) + 1; };
      // 2a. "X-Y" / "X.Y" where X matches unit
      [...block.matchAll(/Answer\s*Keys?\s*解答篇\s+(\d+)[-.](\d+)\b/g)]
        .filter(f => parseInt(f[1]) === pos.unitNum)
        .forEach(f => add(parseInt(f[2])));
      // 2b. Concatenated "XY" (X unit digit, single-digit unit only)
      if (String(pos.unitNum).length === 1) {
        const re = new RegExp(`解答篇\\s+${pos.unitNum}(\\d)\\b`, 'g');
        [...block.matchAll(re)].forEach(f => add(parseInt(f[1])));
      }
      // 2c. "[Letter]-Y" — assume letter is OCR'd unit
      [...block.matchAll(/Answer\s*Keys?\s*解答篇\s+[A-Z][-.](\d+)\b/g)]
        .forEach(f => add(parseInt(f[1])));

      const top = Object.entries(fmCounts).sort((a, b) => b[1] - a[1])[0];
      if (top) subNum = parseInt(top[0]);
    }

    // Step 3: last-resort header parse (e.g. "Unit 5 52" → 5-2)
    if (subNum == null) {
      const sm = restAfterUnit.match(/^[\s)]*(\d{2})\b/);
      if (sm && sm[1].startsWith(String(pos.unitNum))) {
        subNum = parseInt(sm[1].slice(String(pos.unitNum).length));
      }
    }

    if (subNum == null) {
      console.warn(`⚠ Could not determine sub-number for "${headerLine}"`);
      return;
    }

    const key  = `${pos.unitNum}-${subNum}`;
    const qAns = {};
    for (const line of block.split('\n')) {
      if (!line.includes('|')) continue;
      if (/^\s*\|[\s|:-]+\|\s*$/.test(line)) continue;
      const cells = line.split('|').slice(1, -1).map(c => c.trim()).filter(Boolean);
      for (let j = 0; j + 1 < cells.length; j += 2) {
        const n = parseInt(cells[j]);
        const a = cells[j + 1].toUpperCase();
        if (n > 0 && /^[A-G]$/.test(a)) qAns[n] = a;
      }
    }
    answers[key] = qAns;
  });
  return answers;
}

function parseMdExercise(text, answers) {
  const units = [];
  const hdrRe = /^#{1,3}\s+Unit\s+(\d+)\s+(.+?)\s+(\d+)-(\d+)\s+(.+)$/gm;
  const splits = [];
  let m;
  while ((m = hdrRe.exec(text)) !== null) {
    splits.push({
      unitNum: parseInt(m[1]), titleZh: m[2].trim(),
      subNum:  parseInt(m[4]), subTitleZh: m[5].trim(),
      idx: m.index,
    });
  }
  splits.forEach((sp, i) => {
    const block   = text.slice(sp.idx, i + 1 < splits.length ? splits[i + 1].idx : text.length);
    const unitAns = answers[`${sp.unitNum}-${sp.subNum}`] || {};
    const secAM   = block.match(/^#{1,3}\s+A[.．]\s+/m);
    const secBM   = block.match(/^#{1,3}\s+B[.．]\s+/m);
    const aStart  = secAM ? secAM.index + secAM[0].length : null;
    const bStart  = secBM ? secBM.index + secBM[0].length : null;
    const secAText = aStart != null ? block.slice(aStart, bStart ?? block.length) : block;
    const secBText = bStart != null ? block.slice(bStart) : '';
    units.push({
      unit_number:  sp.unitNum,  sub_number:   sp.subNum,
      title_zh:     sp.titleZh,  sub_title_zh: sp.subTitleZh,
      sections:     mdParseSectionA(secAText, unitAns),
      ...mdParseSectionB(secBText),
    });
  });
  return units;
}

function mdParseSectionA(text, answers) {
  const sections = [];
  const CN = { '一':1,'二':2,'三':3,'四':4,'五':5 };
  const TY = { 1:'listening',2:'completion',3:'cloze',4:'reading',5:'essay' };
  const ms = [...text.matchAll(/^#{1,3}\s+(一|二|三|四|五)、(.+)$/gm)];
  ms.forEach((sm, i) => {
    const n    = CN[sm[1]];
    const body = text.slice(sm.index + sm[0].length, i + 1 < ms.length ? ms[i + 1].index : text.length);
    const { passages, questions } = mdParseQBlock(body, answers);
    sections.push({
      section_number: n, type: TY[n] || 'mcq',
      title: `${sm[1]}、${sm[2].trim()}`, passages, questions,
    });
  });
  return sections;
}

function extractPassageAndQs(text, label, passages, questions, answers) {
  const lines = text.split('\n');
  const segs  = [];
  let buf  = [];
  let mode = null;

  const flush = () => {
    if (buf.some(l => l.trim())) segs.push({ type: mode || 'passage', lines: [...buf] });
    buf = [];
  };

  for (const line of lines) {
    const t        = line.trim();
    const isQ      = /^\d+[.．、]/.test(t);
    const isChoice = /^[A-D]\s+/.test(t);

    if (isQ || (mode === 'question' && isChoice)) {
      if (mode !== 'question') { flush(); mode = 'question'; }
      buf.push(line);
    } else if (!t) {
      buf.push(line);
    } else {
      if (mode === 'question') { flush(); mode = 'passage'; }
      if (!mode) mode = 'passage';
      buf.push(line);
    }
  }
  flush();

  let passIdx = 0;
  for (const seg of segs) {
    const content = seg.lines.join('\n')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!content) continue;
    if (seg.type === 'passage') {
      passages.push({ label: passIdx === 0 ? label : null, text: content });
      passIdx++;
    } else {
      questions.push(...mdParseQuestions(content, passIdx <= 1 ? label : null, answers));
    }
  }
}

function mdParseQBlock(text, answers) {
  const passages  = [];
  const questions = [];
  const passMs = [...text.matchAll(/^##\s+(.+)$/gm)];

  if (passMs.length === 0) {
    extractPassageAndQs(text, null, passages, questions, answers);
    return { passages, questions };
  }

  const before = text.slice(0, passMs[0].index);
  if (before.trim()) extractPassageAndQs(before, null, passages, questions, answers);

  passMs.forEach((pm, i) => {
    const label  = pm[1].trim();
    const bStart = pm.index + pm[0].length;
    const bEnd   = i + 1 < passMs.length ? passMs[i + 1].index : text.length;
    extractPassageAndQs(text.slice(bStart, bEnd), label, passages, questions, answers);
  });

  return { passages, questions };
}

function mdParseQuestions(text, passageLabel, answers) {
  const qs    = [];
  const lines = text.split('\n');
  let cur     = null;

  const save = () => {
    if (!cur) return;
    qs.push({ q_num: cur.num, text: cur.text || '', passage_label: passageLabel,
              choices: cur.choices, answer: answers[cur.num] || null });
    cur = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const qM = line.match(/^(\d+)[.．、]\s*(.*)/);
    if (qM) {
      save();
      const { qText, choices } = mdParseChoices(qM[2].trim());
      cur = { num: parseInt(qM[1]), text: qText, choices };
      continue;
    }
    const chM = line.match(/^([A-D])\s+(.*)/);
    if (chM && cur) { cur.choices[chM[1]] = chM[2].trim(); continue; }
    if (cur && Object.keys(cur.choices).length === 0) {
      cur.text = cur.text ? `${cur.text} ${line}` : line;
    }
  }
  save();
  return qs;
}

function mdParseChoices(text) {
  if (!text) return { qText: '', choices: {} };
  if (/^A\s/.test(text)) {
    const all = mdExtractABCD(text);
    if (all) return { qText: '', choices: all };
    return { qText: '', choices: { A: text.slice(2).trim() } };
  }
  const m = text.match(/^(.*?)\s+A\s+(.*?)\s+B\s+(.*?)\s+C\s+(.*?)\s+D\s+(.+)$/s);
  if (m && m[1].trim()) {
    return { qText: m[1].trim(),
             choices: { A: m[2].trim(), B: m[3].trim(), C: m[4].trim(), D: m[5].trim() } };
  }
  return { qText: text, choices: {} };
}

function mdExtractABCD(text) {
  const m = text.match(/^A\s+(.*?)\s+B\s+(.*?)\s+C\s+(.*?)\s+D\s+(.+)$/s);
  if (!m) return null;
  return { A: m[1].trim(), B: m[2].trim(), C: m[3].trim(), D: m[4].trim() };
}

function mdParseSectionB(text) {
  const vocab   = [];
  const phrases = [];
  const vocM = text.match(/^#{1,3}\s+一[、，.]\s*主題相關詞語/m);
  const phrM = text.match(/^#{1,3}\s+二[、，.]\s*常用詞組/m);
  const vocT = vocM ? text.slice(vocM.index + vocM[0].length, phrM ? phrM.index : text.length) : '';
  const phrT = phrM ? text.slice(phrM.index + phrM[0].length) : '';

  for (const row of mdParseTable(vocT)) {
    if (row.every(c => /^[-:]+$/.test(c))) continue;
    if (/本冊|章節|詞語/.test(row[0])) continue;
    const source = row[0];
    const words  = (row[1] || '').split(/[、,，\s]+/).map(w => w.trim()).filter(Boolean);
    for (const word of words) if (word) vocab.push({ source, word, related: '' });
  }
  for (const row of mdParseTable(phrT)) {
    if (row.every(c => /^[-:]+$/.test(c))) continue;
    if (/本冊|章節|詞組/.test(row[0])) continue;
    if (!row[1]?.trim()) continue;
    phrases.push({ source: row[0] || '', phrase: row[1].trim(), example_zh: row[2]?.trim() || '' });
  }
  return { vocab, phrases };
}

function mdParseTable(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.split('|').slice(1, -1).map(c => c.trim());
    if (cells.some(c => c)) rows.push(cells);
  }
  return rows;
}

// ─── Run ───────────────────────────────────────────────────────────────────
const exerciseText = fs.readFileSync(EXERCISE, 'utf8').replace(/\r\n/g, '\n');
const answersText  = fs.readFileSync(ANSWERS, 'utf8').replace(/\r\n/g, '\n');

const answers = parseMdAnswers(answersText);
const units   = parseMdExercise(exerciseText, answers);

// Sanity report
console.log(`\n── Parsed ${units.length} sub-units ──`);
let totalSec = 0, totalQ = 0, totalPassages = 0, missingAns = 0;
units.forEach(u => {
  const sCnt = u.sections.length;
  const qCnt = u.sections.reduce((s, sec) => s + sec.questions.length, 0);
  const pCnt = u.sections.reduce((s, sec) => s + sec.passages.length, 0);
  const ansCnt = u.sections.reduce((s, sec) => s + sec.questions.filter(q => q.answer).length, 0);
  totalSec += sCnt; totalQ += qCnt; totalPassages += pCnt;
  missingAns += (qCnt - ansCnt);
  console.log(`  ${u.unit_number}-${u.sub_number} ${u.sub_title_zh.padEnd(20, '　')} `
    + `§${sCnt} Q=${qCnt} ans=${ansCnt}/${qCnt} pass=${pCnt}`);
});
console.log(`\nTotal: ${units.length} sub-units · ${totalSec} sections · ${totalQ} questions · ${totalPassages} passages · ${missingAns} questions missing answer\n`);

// Write JSON
const out = {
  book: {
    title:       TITLE,
    level:       LEVEL,
    total_units: 30,
  },
  units,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
console.log(`✓ Wrote  ${path.relative(ROOT, OUT)}  (${units.length} units)`);
