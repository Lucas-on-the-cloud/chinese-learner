// Process raw C1.md (TOCFL Band C, OCR'd) into 3 import-ready files:
//   - C1-cleaned.md       : uniform markdown, one ## 文章 / ## 生詞 / ## 練習題 per article
//   - c1-lessons.json     : array of lessons for `lessons` table import
//   - c1-flashcards.json  : array of flashcard cards for `flashcard_templates` import
//
// Run:  node scripts/process-c1.mjs
//
// Source: c:\022026materials\web\chinese-learner\C1.md

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, 'C1.md');
const OUT_MD     = path.join(ROOT, 'C1-cleaned.md');
const OUT_LESSON = path.join(ROOT, 'c1-lessons.json');
const OUT_FC     = path.join(ROOT, 'c1-flashcards.json');

const COURSE_TITLE = 'TOCFL C1 — 流利精通級詞彙'; // human-facing course title
const BOOK_NAME    = 'TOCFL_C1';                  // identifier used as books.name + lessons.book + flashcard_templates.book_name (must match import-c1.mjs)
const BOOK_LEVEL   = 'C1';

// ─── Article catalog (in document order). Map raw OCR title → corrected title. ───
const ARTICLES = [
  { ocr: '打破膚色的個體差異',      title: '打破膚色的個體差異',      domain: '國際關係' },
  { ocr: '流行文化如何影響國際觀',  title: '流行文化如何影響國際觀',  domain: '國際關係' },
  { ocr: '年輕人該關注的世界危機',  title: '年輕人該關注的世界危機',  domain: '國際關係' },
  { ocr: '從發大財到民主化',        title: '從發大財到民主化',        domain: '國際關係' },
  { ocr: '僱傭制和承攬制',          title: '僱傭制和承攬制',          domain: '工作' },
  { ocr: '共享經濟與勞工權益之爭',  title: '共享經濟與勞工權益之爭',  domain: '工作' },
  { ocr: '物流商機',                title: '物流商機',                domain: '商業' },
  { ocr: '直播答題',                title: '直播答題',                domain: '商業' },
  { ocr: '聽覺型客戶',              title: '聽覺型客戶',              domain: '商業' },
  { ocr: '媒體電商化',              title: '媒體電商化',              domain: '商業' },
  { ocr: '安寧緩和醫療',            title: '安寧緩和醫療',            domain: '醫療' },
  { ocr: '遊戲成癮',                title: '遊戲成癮',                domain: '醫療' },
  { ocr: '生酮飲食',                title: '生酮飲食',                domain: '醫療' },
  { ocr: '基因編輯嬰兒',            title: '基因編輯嬰兒',            domain: '科學普及' },
  { ocr: '人造肉',                  title: '人造肉',                  domain: '科學普及' },
  { ocr: '關機介面',                title: '腦機介面',                domain: '科學普及' }, // OCR fix
  { ocr: '深偽技術',                title: '深偽技術',                domain: '科學普及' },
];

// Patterns for section headers with OCR variants ────────────────────────────
const SECTION_NUM = '(?:[\\d一二三四五六七八九十]\\s*[、 ]?\\s*)?';
const RE_ARTICLE_HEADER  = new RegExp(`^\\s*${SECTION_NUM}文\\s*章\\s*$`);
// 生活 / 土詞 are OCR errors for 生詞
const RE_VOCAB_HEADER    = new RegExp(`^\\s*${SECTION_NUM}(?:生\\s*詞|生活|土詞)\\s*$`);
// 繪製題 / 綜習題 / 三線習題 are OCR errors for 練習題
const RE_PRACTICE_HEADER = new RegExp(`^\\s*${SECTION_NUM}(?:練\\s*習\\s*題|繪製題|綜習題|三線習題)\\s*$`);

// Vocab item: "1. 詞 pinyin definition…" (optional **bold** around 詞)
const RE_VOCAB_ITEM = /^\s*(\d+)\s*[.．]\s*\*{0,2}([^\s*0-9]+?)\*{0,2}\s+([A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛÜĀĒĪŌŪÜ\s]+?)\s+(.+)$/;
const RE_QUOTE_LINE = /^\s*(?:&gt;|>)\s*(.+)$/;

// Practice question item
const RE_QUESTION = /^\s*(\d+)\s*[.．]\s*(.+)$/;

// ─── Read source ─────────────────────────────────────────────────────────────
const raw = fs.readFileSync(SRC, 'utf8').replace(/\r\n/g, '\n');
const lines = raw.split('\n');

// ─── Find article boundaries ────────────────────────────────────────────────
// An article starts at a line that contains exactly the OCR title (with or
// without leading "# "). Build a [startLine, endLine] range for each article.
const articleRanges = [];
let cursor = 0;
for (let i = 0; i < ARTICLES.length; i++) {
  const ocr = ARTICLES[i].ocr;
  let startIdx = -1;
  for (let k = cursor; k < lines.length; k++) {
    const stripped = lines[k].replace(/^#+\s*/, '').trim();
    if (stripped === ocr) { startIdx = k; break; }
  }
  if (startIdx === -1) {
    console.error(`✗ Article not found: "${ocr}" (searched from line ${cursor})`);
    process.exit(1);
  }
  articleRanges.push({ start: startIdx, end: lines.length });
  if (i > 0) articleRanges[i - 1].end = startIdx;
  cursor = startIdx + 1;
}

// ─── Parse each article ─────────────────────────────────────────────────────
function parseArticle(meta, blockLines) {
  // Sub-section boundaries within blockLines
  let articleStart = -1, vocabStart = -1, practiceStart = -1, articleEnd = blockLines.length;

  for (let i = 0; i < blockLines.length; i++) {
    const ln = blockLines[i].replace(/^#+\s*/, '').trim();
    if (RE_ARTICLE_HEADER.test(ln) && articleStart === -1) articleStart = i + 1;
    if (RE_VOCAB_HEADER.test(ln)  && vocabStart === -1)    vocabStart  = i + 1;
    if (RE_PRACTICE_HEADER.test(ln) && practiceStart === -1) practiceStart = i + 1;
  }

  // If 文章 header was missing entirely, body starts right after the title line.
  if (articleStart === -1) articleStart = 1;

  const articleEndIdx  = vocabStart    !== -1 ? vocabStart - 1    : (practiceStart !== -1 ? practiceStart - 1 : blockLines.length);
  const vocabEndIdx    = practiceStart !== -1 ? practiceStart - 1 : blockLines.length;
  const practiceEndIdx = blockLines.length;

  // Extract article body (strip page-number-only lines and image refs)
  const body = blockLines.slice(articleStart, articleEndIdx)
    .map(l => l.trim())
    .filter(l =>
      l !== '' &&
      !/^\d{1,3}$/.test(l) &&            // page numbers
      !/^!\[.*\]\(.*\)$/.test(l) &&      // image refs
      !RE_ARTICLE_HEADER.test(l.replace(/^#+\s*/, '').trim())
    )
    .join('\n\n');

  // Extract vocab items
  const vocab = [];
  let cur = null;
  if (vocabStart !== -1) {
    for (let i = vocabStart; i < vocabEndIdx; i++) {
      const ln = blockLines[i].replace(/^#+\s*/, '');
      const m = RE_VOCAB_ITEM.exec(ln);
      if (m) {
        if (cur) vocab.push(cur);
        cur = {
          n: parseInt(m[1], 10),
          char: m[2].trim(),
          pinyin: m[3].replace(/\s+/g, ' ').trim(),
          meaning: m[4].trim(),
          example: '',
        };
      } else {
        const q = RE_QUOTE_LINE.exec(ln);
        if (q && cur && !cur.example) cur.example = q[1].trim();
      }
    }
    if (cur) vocab.push(cur);
  }

  // Extract practice questions
  const questions = [];
  if (practiceStart !== -1) {
    for (let i = practiceStart; i < practiceEndIdx; i++) {
      const ln = blockLines[i].trim();
      if (!ln || /^\d{1,3}$/.test(ln) || /^#/.test(ln)) continue;
      const m = RE_QUESTION.exec(ln);
      if (m) questions.push({ n: parseInt(m[1], 10), text: m[2].trim() });
    }
  }

  return { ...meta, body, vocab, questions };
}

const articles = ARTICLES.map((meta, i) => {
  const { start, end } = articleRanges[i];
  // skip the title line itself (start)
  const block = lines.slice(start + 1, end);
  return parseArticle(meta, block);
});

// ─── Sanity report ──────────────────────────────────────────────────────────
console.log('\n── Parsed ' + articles.length + ' articles ──');
articles.forEach((a, i) => {
  console.log(`  ${String(i + 1).padStart(2)}. ${a.title.padEnd(20, '　')}` +
    `  body=${String(a.body.length).padStart(4)}ch` +
    `  vocab=${String(a.vocab.length).padStart(2)}` +
    `  Qs=${a.questions.length}`);
});

// ─── Output 1: cleaned markdown ─────────────────────────────────────────────
const md = [];
md.push(`# TOCFL ${BOOK_LEVEL} — 流利精通級詞彙`);
md.push('');
md.push(`> 17 篇文章 / ${articles.reduce((s, a) => s + a.vocab.length, 0)} 個生詞 · 5 大領域：國際關係、工作、商業、醫療、科學普及`);
md.push('');

articles.forEach((a, i) => {
  md.push(`# ${i + 1}. ${a.title}`);
  md.push('');
  md.push(`*領域：${a.domain}*`);
  md.push('');
  md.push('## 文章');
  md.push('');
  md.push(a.body);
  md.push('');
  md.push('## 生詞');
  md.push('');
  a.vocab.forEach(v => {
    md.push(`${v.n}. **${v.char}** ${v.pinyin}　${v.meaning}`);
    if (v.example) md.push(`   > ${v.example}`);
    md.push('');
  });
  md.push('## 練習題');
  md.push('');
  a.questions.forEach(q => {
    md.push(`${q.n}. ${q.text}`);
    md.push('');
  });
  md.push('---');
  md.push('');
});

fs.writeFileSync(OUT_MD, md.join('\n'), 'utf8');
console.log(`\n✓ Wrote  ${path.relative(ROOT, OUT_MD)}  (${md.length} lines)`);

// ─── Output 2: lessons.json (for `lessons` table) ───────────────────────────
const lessons = articles.map((a, i) => ({
  book:        BOOK_NAME,
  title:       a.title,
  chinese:     a.body,
  pinyin:      '',          // not provided in source — left for future fill
  vietnamese:  '',          // translation not in source — fill later
  description: a.body.slice(0, 80),
  // extra fields for downstream tooling (ignored on insert if column absent):
  _domain:        a.domain,
  _sort_order:    i + 1,
  _practice_qs:   a.questions.map(q => q.text),
}));
fs.writeFileSync(OUT_LESSON, JSON.stringify(lessons, null, 2), 'utf8');
console.log(`✓ Wrote  ${path.relative(ROOT, OUT_LESSON)}  (${lessons.length} lessons)`);

// ─── Output 3: flashcards.json (for `flashcard_templates` table) ────────────
// `lesson_id` will be populated after lessons are inserted; we use `_lesson_idx`
// as a placeholder index that import code can resolve.
const flashcards = [];
articles.forEach((a, lessonIdx) => {
  a.vocab.forEach((v, i) => {
    flashcards.push({
      _lesson_idx:   lessonIdx,        // 0-based; resolve to lesson_id at import time
      book_name:     BOOK_NAME,
      lesson_title:  a.title,
      char:          v.char,
      pinyin:        v.pinyin,
      meaning:       v.meaning,        // currently 中文釋義; translate to VI later
      example_zh:    v.example || '',
      example_vi:    '',
      sort_order:    i,
      published:     true,
    });
  });
});
fs.writeFileSync(OUT_FC, JSON.stringify(flashcards, null, 2), 'utf8');
console.log(`✓ Wrote  ${path.relative(ROOT, OUT_FC)}  (${flashcards.length} flashcards)\n`);
