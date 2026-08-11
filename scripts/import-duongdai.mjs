// Import 當代中文課程 Book 5 & 6 reading lessons into DB.
//
// Usage:
//   node scripts/import-duongdai.mjs --dry       # preview extracted text
//   node scripts/import-duongdai.mjs --push      # insert into DB
//   node scripts/import-duongdai.mjs --book=5 --dry
//   node scripts/import-duongdai.mjs --lesson=3 --dry   # single lesson preview

import { getClient } from './_supabase.mjs';
import fs from 'node:fs';

const DRY    = process.argv.includes('--dry');
const PUSH   = process.argv.includes('--push');
const BOOK   = process.argv.find(a => a.startsWith('--book='))?.slice(7);
const LESSON = parseInt(process.argv.find(a => a.startsWith('--lesson='))?.slice(9) || '0');

if (!DRY && !PUSH) { console.error('Pass --dry or --push'); process.exit(1); }

// ── Page text helpers ────────────────────────────────────────────────────────
function getPageText(page) {
  return (page.para_blocks || [])
    .map(b => (b.lines||[]).map(l => (l.spans||[]).map(s => s.content).join('')).join(' '))
    .filter(t => t.trim())
    .join('\n');
}

// Returns true if a line looks like article prose (not exercise/header)
function isArticleLine(line) {
  const l = line.trim();
  if (l.length < 20) return false;
  if (!/[一-鿿]/.test(l)) return false;                      // must have Chinese
  if (/^[□■◆◇▶◀●○•]/.test(l)) return false;                       // bullet points
  if (/^（[）\s]/.test(l)) return false;                              // （） checkbox
  if (/^\d+[\.。、\s]/.test(l) && l.length < 60) return false;       // short numbered items
  if (/^[a-zA-Z][\.。\s]/.test(l) && l.length < 60) return false;    // a. b. c.
  if (/^[(（][a-zA-Z\d][)）]/.test(l)) return false;                 // (A) (1) options
  // Section headers to skip
  if (/^(引言|摘要|課前活動|課文理解|生詞|New Words|學習目標|LESSON|Lesson\s*\d|重點詞彙|論點呈現|口語表達|語言擴展|結構[:：]|解釋[:：]|例句[:：]|練習|專有名詞|四字格|詞類表)/.test(l)) return false;
  if (/請在.*打[√✓]|請找出|請說說|請討論|請完成|請根據|請選擇|請使用|請回答|請寫出|請比較/.test(l)) return false;
  return true;
}

// ── JSON page loading ────────────────────────────────────────────────────────
function loadPages(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8')).pdf_info;
}

const LESSON_NUM = { 一:1, 二:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9, 十:10 };
const LESSON_RE  = /第([一二三四五六七八九十]+)課\s*([^\n]+)?/;
// Fallback for pages where "第X課" wasn't OCR'd but audio code was (e.g. "摘要 05-01")
const AUDIO_LESSON_RE = /(?:引言|摘要)\s+(\d{2})-01/;

// Find lesson start pages: returns [{lessonNum, pageIdx, title}]
function findLessonStarts(pages) {
  const starts = [];
  const seen = new Set();
  for (let i = 0; i < pages.length; i++) {
    const txt = getPageText(pages[i]);
    const m = txt.match(LESSON_RE);

    if (m) {
      const num = LESSON_NUM[m[1]];
      if (!num || seen.has(num)) continue;

      // TOC pages list MULTIPLE lesson numbers — skip them
      const allLessonMatches = [...txt.matchAll(/第([一二三四五六七八九十]+)課/g)];
      const distinctNums = new Set(allLessonMatches.map(x => x[1]));
      if (distinctNums.size > 1) continue;

      // Must have enough content (not just a header)
      const lines = txt.split('\n').filter(l => l.trim().length > 5);
      if (lines.length < 3) continue;

      // Search ALL lines (not filtered) for the lesson number line — "第八課" is only 3 chars
      const titleLine = txt.split('\n').find(l => LESSON_RE.test(l));
      if (!titleLine) continue;
      // Skip grammar-section references like "第三課的「把 A 列入 B」"
      if (/第[一二三四五六七八九十]+課的/.test(titleLine)) continue;

      // Extract clean title: strip audio codes, lesson numbers, leading junk
      const rawTitle = (m[2] || '').replace(/\s+/g,' ').replace(/^\s*[|\d\s]+/, '').trim();

      seen.add(num);
      starts.push({ lessonNum: num, pageIdx: i, title: rawTitle });
    } else {
      // Fallback: lesson title page wasn't OCR'd, but audio code is present (e.g. "摘要 05-01")
      const am = txt.match(AUDIO_LESSON_RE);
      if (!am) continue;
      const num = parseInt(am[1]);
      if (!num || seen.has(num)) continue;
      seen.add(num);
      starts.push({ lessonNum: num, pageIdx: i, title: '' });
    }
  }
  return starts.sort((a, b) => a.lessonNum - b.lessonNum);
}

// Extract article prose from a page range
function extractArticleText(pages, startIdx, endIdx) {
  const paras = [];
  let preReadingPage = -1; // page index that had 課前活動 (skip remainder of that page)

  for (let i = startIdx; i <= Math.min(endIdx, pages.length - 1); i++) {
    const txt = getPageText(pages[i]);
    const lines = txt.split('\n');
    let stoppedAt = -1;

    const pageLines = [];
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li].trim();
      if (!line) continue;

      if (/課文理解/.test(line)) { stoppedAt = li; break; }
      if (/課前活動|學習目標/.test(line)) { preReadingPage = i; continue; }

      // Skip the rest of the pre-reading page after its heading
      if (i === preReadingPage) continue;

      if (isArticleLine(line)) pageLines.push(line);
    }

    if (pageLines.length) paras.push(pageLines.join('\n'));
    if (stoppedAt >= 0) break;
  }

  return paras.join('\n\n');
}

// Extract 引言/摘要 intro from the lesson header page
function extractIntro(pages, startIdx) {
  const txt = getPageText(pages[startIdx]);
  const lines = txt.split('\n');
  let collecting = false;
  const introLines = [];
  for (const line of lines) {
    const l = line.trim();
    if (/引言|摘要/.test(l)) { collecting = true; continue; }
    if (/課前活動|學習目標|學習目標/.test(l)) break;
    if (collecting && l.length > 10 && /[一-鿿]/.test(l)) introLines.push(l);
  }
  return introLines.join('\n');
}

// ── HTML vocabulary parser ───────────────────────────────────────────────────
function loadVocabFromHtml(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  // vocab[lessonNum] = [{num, word, pinyin, pos, en}]
  const vocab = {};

  // Match each 生詞 heading with lesson audio code: "生詞 New Words 01-03"
  // Skip duplicates from id attributes by tracking processed table positions
  const sectionRe = /生詞[^<]*?(\d{2})-0[1-9]/gi;
  const processedTables = new Set();
  let m;
  while ((m = sectionRe.exec(html)) !== null) {
    const lesson = parseInt(m[1]);
    if (!vocab[lesson]) vocab[lesson] = [];

    // Find the next <table> after this heading (may skip an intermediate <h2>)
    const tableStart = html.indexOf('<table', m.index);
    if (tableStart < 0 || tableStart - m.index > 2000) continue;
    if (processedTables.has(tableStart)) continue; // deduplicate id vs text match
    processedTables.add(tableStart);

    const tableEnd = html.indexOf('</table>', tableStart);
    if (tableEnd < 0) continue;
    const chunk = html.slice(tableStart, tableEnd + 8);

    // Parse table rows
    const rowRe = /<tr>[\s\S]*?<\/tr>/gi;
    let row;
    while ((row = rowRe.exec(chunk)) !== null) {
      const cells = [...row[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => c[1].replace(/<[^>]+>/g,'').trim());
      if (cells.length >= 4 && /[一-鿿]/.test(cells[1])) {
        vocab[lesson].push({ num: cells[0], word: cells[1], pinyin: cells[2], pos: cells[3], en: cells[4]||'' });
      }
    }
  }
  return vocab;
}

function formatVocab(items) {
  if (!items || !items.length) return '';
  const lines = items.map(v => `${v.num ? v.num + ' ' : ''}${v.word} (${v.pinyin}) ${v.pos ? '[' + v.pos + '] ' : ''}— ${v.en}`);
  return '【生詞 New Words】\n' + lines.join('\n');
}

// ── Build lessons for one book ───────────────────────────────────────────────
function buildLessons(bookNum) {
  const base = 'baidoc_duongdai/';
  let pages, htmlPaths;

  if (bookNum === 5) {
    pages = [
      ...loadPages(base + 'MinerU_當代中文課程5 – 課本__20260807094421.json'),
      ...loadPages(base + 'MinerU_當代中文課程5 – 課本__20260807094451.json'),
    ];
    htmlPaths = [
      base + 'MinerU_html_當代中文課程5_–_課本_2085663802504814592.html',
      base + 'MinerU_html_當代中文課程5_–_課本_2085663849715896320.html',
    ];
  } else {
    // Book 6: 094512 has lessons 1-8, 094503 has lessons 9-10
    pages = [
      ...loadPages(base + 'MinerU_當代中文課程6 – 課本 (1)__20260807094512.json'),
      ...loadPages(base + 'MinerU_當代中文課程6 – 課本 (1)__20260807094503.json'),
    ];
    htmlPaths = [
      base + 'MinerU_html_當代中文課程6_–_課本_(1)_2085663696980316160.html',
      base + 'MinerU_html_當代中文課程6_–_課本_(1)_2085663748167602176.html',
    ];
  }

  // Load vocabulary from HTML files
  const vocab = {};
  for (const hp of htmlPaths) {
    if (fs.existsSync(hp)) {
      const v = loadVocabFromHtml(hp);
      for (const [k, items] of Object.entries(v)) {
        if (!vocab[k]) vocab[k] = [];
        vocab[k].push(...items);
      }
    }
  }

  // Find lesson starts
  const starts = findLessonStarts(pages);
  console.log(`\nBook ${bookNum}: found ${starts.length} lessons`);
  starts.forEach(s => console.log(`  Lesson ${s.lessonNum} (page ${s.pageIdx+1}): ${s.title}`));

  // Extract text for each lesson
  const lessons = [];
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i];
    if (LESSON && s.lessonNum !== LESSON) continue;

    const startIdx = s.pageIdx;
    const endIdx = (i + 1 < starts.length) ? starts[i+1].pageIdx - 1 : pages.length - 1;

    const intro = extractIntro(pages, startIdx);
    const article = extractArticleText(pages, startIdx, endIdx);

    // Deduplicate article lines (intro might repeat)
    const introClean = intro.split('\n').map(l=>l.trim());
    const articleClean = article.split('\n').filter(l => !introClean.includes(l.trim()));

    const vocabItems = vocab[s.lessonNum] || [];
    const vocabStr = formatVocab(vocabItems);

    const chinese = [
      intro,
      articleClean.join('\n'),
      vocabStr,
    ].filter(Boolean).join('\n\n');

    // Fallback title for lessons where the chapter title page wasn't OCR'd
    const MANUAL_TITLES = { 'DUONGDAI_6-5': '語言與溝通' };
    const manualTitle = MANUAL_TITLES[`DUONGDAI_${bookNum}-${s.lessonNum}`];
    const lessonTitle = manualTitle || s.title;

    lessons.push({
      title: `第${['','一','二','三','四','五','六','七','八','九','十'][s.lessonNum]}課　${lessonTitle}`,
      description: intro.slice(0, 200),
      chinese,
      pinyin: '',
      vietnamese: '',
      book: `DUONGDAI_${bookNum}`,
    });

    if (DRY) {
      console.log(`\n━━━ Lesson ${s.lessonNum}: ${lessonTitle} ━━━`);
      console.log('INTRO:', intro.slice(0,150));
      console.log('ARTICLE (' + article.split('\n').filter(Boolean).length + ' lines):', article.slice(0,300), '...');
      console.log('VOCAB items:', vocabItems.length);
    }
  }

  return lessons;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const books = BOOK ? [parseInt(BOOK)] : [5, 6];
const allLessons = [];

for (const b of books) {
  allLessons.push(...buildLessons(b));
}

console.log(`\nTotal lessons to import: ${allLessons.length}`);

if (PUSH) {
  const db = getClient({ writes: true });

  // 1. Create courses
  const courseData = [
    { title: '當代中文課程 5', level: '高階', description: '10 bài đọc trình độ cao cấp từ giáo trình 當代中文課程 quyển 5 (NTU MTCP). Chủ đề: tự do ngôn luận, thực phẩm biến đổi gen, phẫu thuật thẩm mỹ, truyền thống & hiện đại, mang thai hộ, án tử hình, thuế thu nhập, vấn đề tị nạn, điện hạt nhân, hôn nhân đồng giới.', published: true, sort_order: 10 },
    { title: '當代中文課程 6', level: '高階', description: '10 bài đọc trình độ cao cấp từ giáo trình 當代中文課程 quyển 6 (NTU MTCP). Chủ đề: giáo dục nghề nghiệp, công nghệ & cuộc sống, nghệ thuật múa, kỹ năng giao tiếp, gấu trúc ngoại giao, tình cảm, Olympic, quê hương, trí tuệ & năng lực.', published: true, sort_order: 11 },
  ];

  for (const [idx, cd] of courseData.entries()) {
    const bookNum = idx + 5;
    if (BOOK && parseInt(BOOK) !== bookNum) continue;
    const bookName = `DUONGDAI_${bookNum}`;

    // Upsert course
    const { data: existing } = await db.from('courses').select('id').ilike('title', `%當代中文課程 ${bookNum}%`).single();
    let courseId;
    if (existing) {
      courseId = existing.id;
      console.log(`Course ${bookNum} already exists (id=${courseId}), skipping create`);
    } else {
      const { data: created, error } = await db.from('courses').insert(cd).select('id').single();
      if (error) { console.error('create course error:', error.message); continue; }
      courseId = created.id;
      console.log(`Created course id=${courseId}: ${cd.title}`);

      // Create course_books link
      await db.from('course_books').insert({ course_id: courseId, book_name: bookName, skill_type: 'reading', sort_order: 0 });
    }

    // Insert lessons
    const bookLessons = allLessons.filter(l => l.book === bookName);
    console.log(`Inserting ${bookLessons.length} lessons for Book ${bookNum}...`);
    const { error: lerr } = await db.from('lessons').insert(bookLessons);
    if (lerr) console.error('insert lessons error:', lerr.message);
    else console.log(`✓ ${bookLessons.length} lessons inserted`);
  }
}

console.log('\nDone.');
