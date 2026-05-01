// ── State ──────────────────────────────────────────────────────────
const _ex = {
  book:     null,   // selected exam_books row
  pdf:      null,   // pdfjs document
  docAi:    {},     // { pageNum: synthetic single-page response }
  ocrDone:  0,
  ocrTotal: 0,
};

// ── Document AI helpers ────────────────────────────────────────────
function daText(textAnchor, fullText) {
  if (!textAnchor?.textSegments?.length) return '';
  return textAnchor.textSegments
    .map(s => fullText.slice(parseInt(s.startIndex) || 0, parseInt(s.endIndex) || 0))
    .join('');
}

function daPageText(response) {
  // Return full text from Document AI (clean, no hallucination)
  return (response.document?.text || '').trim();
}

function daExtractTables(response) {
  // _fullText holds original doc text when response is a synthetic per-page slice
  const full   = response.document?._fullText || response.document?.text || '';
  const tables = response.document?.pages?.[0]?.tables || [];
  return tables.map(t => {
    const rows = [...(t.headerRows || []), ...(t.bodyRows || [])];
    return rows.map(r => (r.cells || []).map(c => daText(c.layout?.textAnchor, full).trim()));
  });
}

// Extract page-specific text from a multi-page Document AI response
function daPageTextAt(doc, pageIdx) {
  const full   = doc?.text || '';
  const page   = doc?.pages?.[pageIdx];
  const anchor = page?.layout?.textAnchor;
  if (!anchor?.textSegments?.length) return full.trim();
  return anchor.textSegments
    .map(s => full.slice(parseInt(s.startIndex) || 0, parseInt(s.endIndex) || 0))
    .join('').trim();
}

// Build a synthetic single-page response compatible with daPageText() and daExtractTables()
function exMakePageResponse(multiResponse, pageIdx) {
  const doc  = multiResponse.document || {};
  const full = doc.text || '';
  const page = (doc.pages || [])[pageIdx];
  if (!page) return null;
  return {
    document: {
      text:      daPageTextAt(doc, pageIdx),
      _fullText: full,   // for table cell index lookups
      pages:     [page],
    },
  };
}

// ── Boot ───────────────────────────────────────────────────────────
async function loadExams() {
  const { data: books } = await _adminDb.client
    .from('exam_books')
    .select('id,title,level,total_units,status,created_at')
    .order('created_at', { ascending: false });

  const el = document.getElementById('ex-book-list');
  if (!books?.length) {
    el.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:24px;font-size:13px">Chưa có bộ đề thi nào</p>';
    return;
  }
  el.innerHTML = books.map(b => {
    const active = _ex.book?.id === b.id;
    return `<div onclick="exSelectBook(${b.id})"
      style="padding:10px 12px;border-radius:8px;cursor:pointer;margin-bottom:4px;
             border:1.5px solid ${active ? '#1a56db' : '#e5e7eb'};
             background:${active ? '#eff6ff' : '#fff'}">
      <div style="font-weight:600;font-size:13px">${escHtml(b.title)}</div>
      <div style="display:flex;gap:6px;margin-top:4px;align-items:center;flex-wrap:wrap">
        ${b.level ? `<span style="font-size:11px;background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:999px">${b.level}</span>` : ''}
        <span style="font-size:11px;color:#6b7280">${b.total_units || 30} units</span>
        <span style="font-size:11px;padding:2px 8px;border-radius:999px;margin-left:auto;
               background:${b.status === 'published' ? '#f0fdf4' : '#fef9c3'};
               color:${b.status === 'published' ? '#15803d' : '#a16207'}">
          ${b.status === 'published' ? 'Đã xuất bản' : 'Bản nháp'}
        </span>
      </div>
    </div>`;
  }).join('');
}

// ── Panel helpers ──────────────────────────────────────────────────
function exShowPanel(id) {
  ['ex-panel-create', 'ex-panel-ocr', 'ex-panel-parse', 'ex-panel-units', 'ex-panel-markdown']
    .forEach(p => { document.getElementById(p).style.display = p === id ? '' : 'none'; });
}

function exShowCreate() {
  _ex.book = null; _ex.pdf = null; _ex.docAi = {};
  loadExams();
  exShowPanel('ex-panel-create');
}

// ── Book CRUD ──────────────────────────────────────────────────────
async function exSaveBook() {
  const title      = document.getElementById('ex-title').value.trim();
  const level      = document.getElementById('ex-level').value;
  const totalUnits = parseInt(document.getElementById('ex-total-units').value) || 30;
  if (!title) { showMsg('ex-create-msg', 'Nhập tên bộ đề.', 'err'); return; }

  const btn = document.getElementById('ex-save-btn');
  btn.disabled = true;

  const { data, error } = await _adminDb.client
    .from('exam_books')
    .insert({ title, level: level || null, total_units: totalUnits, status: 'draft' })
    .select().single();

  btn.disabled = false;
  if (error) { showMsg('ex-create-msg', 'Lỗi: ' + error.message, 'err'); return; }

  _ex.book = data;
  await loadExams();
  exShowPanel('ex-panel-ocr');
  exRenderOCRPanel();
}

async function exSelectBook(bookId) {
  _ex.pdf = null; _ex.docAi = {};
  const { data } = await _adminDb.client.from('exam_books').select('*').eq('id', bookId).single();
  _ex.book = data;
  await loadExams();

  const [{ count: unitCount }, { count: ocrCount }] = await Promise.all([
    _adminDb.client.from('exam_units').select('*', { count: 'exact', head: true }).eq('book_id', bookId),
    _adminDb.client.from('exam_ocr_pages').select('*', { count: 'exact', head: true }).eq('book_id', bookId),
  ]);

  if (unitCount > 0) {
    exShowPanel('ex-panel-units');
    document.getElementById('ex-units-title').textContent = data.title;
    exLoadUnits(bookId);
  } else if (ocrCount > 0) {
    exShowPanel('ex-panel-parse');
    exRenderParsePanel(ocrCount);
  } else {
    exShowPanel('ex-panel-ocr');
    exRenderOCRPanel();
  }
}

async function exDeleteBook() {
  if (!_ex.book) return;
  if (!confirm(`Xóa "${_ex.book.title}"? Tất cả dữ liệu sẽ bị xóa vĩnh viễn.`)) return;
  await _adminDb.client.from('exam_books').delete().eq('id', _ex.book.id);
  _ex.book = null; _ex.pdf = null; _ex.docAi = {};
  await loadExams();
  exShowPanel('ex-panel-create');
}

// ── OCR Panel ──────────────────────────────────────────────────────
function exRenderOCRPanel() {
  const label = document.getElementById('ex-ocr-book-label');
  if (label && _ex.book) label.textContent = _ex.book.title;

  document.getElementById('ex-ocr-content').innerHTML = `
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 14px;font-size:12px;color:#1e40af;margin-bottom:14px">
      <i class="fa-solid fa-eye"></i> OCR dùng <strong>Google Document AI</strong> · ~3 trang/giây · không hallucinate
    </div>
    <div class="s-label">File PDF (ảnh scan)</div>
    <input type="file" id="ex-pdf-input" accept=".pdf" style="display:none" onchange="exFileChange(this)">
    <div id="ex-drop-zone"
         onclick="document.getElementById('ex-pdf-input').click()"
         ondragover="event.preventDefault();this.style.borderColor='#1a56db'"
         ondragleave="this.style.borderColor='#d1d5db'"
         ondrop="exFileDrop(event)"
         style="border:2px dashed #d1d5db;border-radius:10px;padding:36px;text-align:center;
                cursor:pointer;background:#f9fafb;transition:border-color .15s">
      <i class="fa-solid fa-file-pdf" style="font-size:32px;color:#dc2626;display:block;margin-bottom:10px"></i>
      <div style="font-size:14px;font-weight:600;color:#374151">Kéo thả PDF vào đây</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:4px">hoặc click để chọn</div>
    </div>
    <div id="ex-file-info" style="display:none;margin-top:10px;background:#eff6ff;border-radius:8px;padding:10px 14px;font-size:13px"></div>
    <div id="ex-ocr-progress" style="display:none;margin-top:14px">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px">
        <span id="ex-ocr-label">OCR đang chạy…</span>
        <span id="ex-ocr-pct" style="font-weight:700;color:#dc2626">0%</span>
      </div>
      <div style="background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden">
        <div id="ex-ocr-bar" style="height:100%;background:linear-gradient(90deg,#dc2626,#f87171);
             border-radius:999px;width:0%;transition:width .4s"></div>
      </div>
      <div id="ex-ocr-detail" style="font-size:11px;color:#6b7280;margin-top:5px"></div>
    </div>
    <div id="ex-ocr-msg" class="s-msg" style="margin-top:10px"></div>
    <button id="ex-start-ocr-btn" class="s-btn" onclick="exStartOCR()"
            style="display:none;margin-top:12px;width:100%">
      <i class="fa-solid fa-eye"></i> Bắt đầu OCR
    </button>
  `;
}

function exFileChange(input) { if (input.files[0]) exSetFile(input.files[0]); }
function exFileDrop(e) {
  e.preventDefault();
  document.getElementById('ex-drop-zone').style.borderColor = '#d1d5db';
  if (e.dataTransfer.files[0]) exSetFile(e.dataTransfer.files[0]);
}

async function exSetFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    showMsg('ex-ocr-msg', 'Chỉ chấp nhận file PDF.', 'err'); return;
  }

  const infoEl = document.getElementById('ex-file-info');
  const btn    = document.getElementById('ex-start-ocr-btn');
  infoEl.style.display = '';
  infoEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang load PDF…';

  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    const buf = await file.arrayBuffer();
    _ex.pdf      = await pdfjsLib.getDocument({ data: buf }).promise;
    _ex.ocrTotal = _ex.pdf.numPages;
    _ex.ocrDone  = 0;
    _ex.docAi    = {};

    const sizeMB = (file.size / 1024 / 1024).toFixed(1);

    const { count: existing } = await _adminDb.client
      .from('exam_ocr_pages').select('*', { count: 'exact', head: true })
      .eq('book_id', _ex.book.id);

    infoEl.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center">
        <i class="fa-solid fa-file-pdf" style="color:#dc2626;font-size:22px"></i>
        <div>
          <div style="font-weight:600">${escHtml(file.name)}</div>
          <div style="color:#6b7280;margin-top:2px">${_ex.ocrTotal} trang · ${sizeMB} MB</div>
        </div>
      </div>`;

    btn.style.display = '';
    btn.innerHTML = existing > 0
      ? `<i class="fa-solid fa-eye"></i> Tiếp tục OCR (${existing}/${_ex.ocrTotal} trang đã xong)`
      : `<i class="fa-solid fa-eye"></i> Bắt đầu OCR ${_ex.ocrTotal} trang`;
  } catch (e) {
    infoEl.innerHTML = `<span style="color:#dc2626">Lỗi load PDF: ${e.message}</span>`;
  }
}

// ── Render one page to JPEG base64 via pdf.js ─────────────────────
async function exRenderPage(pageNum, maxW = 1400) {
  const page     = await _ex.pdf.getPage(pageNum);
  const scale    = maxW / page.getViewport({ scale: 1 }).width;
  const viewport = page.getViewport({ scale });
  const canvas   = document.createElement('canvas');
  canvas.width   = viewport.width;
  canvas.height  = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  const b64 = canvas.toDataURL('image/jpeg', 0.90).split(',')[1];
  canvas.width = 0; canvas.height = 0;
  return b64;
}

// ── Call Cloud Vision API (DOCUMENT_TEXT_DETECTION) ───────────────
async function exCallVision(imageBase64, attempt = 0) {
  const res  = await fetch('/api/vision', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ imageBase64 }),
  });
  const raw = await res.text();
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error(raw.slice(0, 200)); }
  if (res.status === 429 || data.error?.includes?.('RESOURCE_EXHAUSTED')) {
    if (attempt >= 4) throw new Error('Vision API rate limit sau 4 lần retry');
    await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    return exCallVision(imageBase64, attempt + 1);
  }
  if (data.error) throw new Error(typeof data.error === 'object' ? data.error.message : data.error);
  return data;
}

// Reconstruct structured text from Vision symbol-level break info
// This preserves line breaks, paragraph separation — much better than raw .text
function visionSynthetic(visionResponse) {
  const fullAnnotation = visionResponse.responses?.[0]?.fullTextAnnotation;
  if (!fullAnnotation) return { document: { text: '', pages: [{ tables: [], visualElements: [] }] } };

  const vPage = fullAnnotation.pages?.[0];
  if (!vPage) return { document: { text: fullAnnotation.text || '', pages: [{ tables: [], visualElements: [] }] } };

  const parts = [];
  for (const block of (vPage.blocks || [])) {
    const blockLines = [];
    for (const para of (block.paragraphs || [])) {
      let line = '';
      for (const word of (para.words || [])) {
        for (const sym of (word.symbols || [])) {
          line += sym.text;
          const brk = sym.property?.detectedBreak?.type;
          if (brk === 'SPACE' || brk === 'SURE_SPACE')       line += ' ';
          if (brk === 'EOL_SURE_SPACE' || brk === 'LINE_BREAK') { blockLines.push(line.trim()); line = ''; }
          if (brk === 'HYPHEN') { line += '-'; blockLines.push(line.trim()); line = ''; }
        }
      }
      if (line.trim()) blockLines.push(line.trim());
    }
    if (blockLines.length) parts.push(blockLines.join('\n'));
  }

  const text = parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  return { document: { text, pages: [{ tables: [], visualElements: [] }] } };
}

// ── Start OCR — page-by-page via Cloud Vision ─────────────────────
async function exStartOCR() {
  const btn      = document.getElementById('ex-start-ocr-btn');
  const progEl   = document.getElementById('ex-ocr-progress');
  const barEl    = document.getElementById('ex-ocr-bar');
  const labelEl  = document.getElementById('ex-ocr-label');
  const pctEl    = document.getElementById('ex-ocr-pct');
  const detailEl = document.getElementById('ex-ocr-detail');
  const msgEl    = document.getElementById('ex-ocr-msg');

  if (!_ex.pdf) { showMsg('ex-ocr-msg', 'Chưa chọn file.', 'err'); return; }
  btn.disabled = true;
  progEl.style.display = '';

  const updateProg = () => {
    const pct = Math.round(_ex.ocrDone / _ex.ocrTotal * 100);
    barEl.style.width   = pct + '%';
    pctEl.textContent   = pct + '%';
    labelEl.textContent = `OCR: ${_ex.ocrDone} / ${_ex.ocrTotal} trang`;
  };

  // Resume: load already-done pages
  const { data: existing } = await _adminDb.client
    .from('exam_ocr_pages').select('page_num').eq('book_id', _ex.book.id);
  const { data: existingDocAi } = await _adminDb.client
    .from('exam_doc_ai_pages').select('page_num,layout_json').eq('book_id', _ex.book.id);

  const donePages = new Set((existing || []).map(r => r.page_num));
  _ex.ocrDone = donePages.size;
  (existingDocAi || []).forEach(r => { _ex.docAi[r.page_num] = r.layout_json; });
  updateProg();

  const pending = Array.from({ length: _ex.ocrTotal }, (_, i) => i + 1)
    .filter(p => !donePages.has(p));

  const PARALLEL = 10; // Cloud Vision allows 1800 QPM; 10 concurrent is safe
  let active = 0;
  const waiters = [];
  const acquire = () => new Promise(resolve => {
    if (active < PARALLEL) { active++; resolve(); }
    else waiters.push(resolve);
  });
  const release = () => {
    active--;
    if (waiters.length) { active++; waiters.shift()(); }
  };

  const saveBuffer = [];
  const flushBuffer = async () => {
    if (!saveBuffer.length) return;
    const rows = saveBuffer.splice(0);
    await Promise.all([
      _adminDb.client.from('exam_ocr_pages').upsert(
        rows.map(r => ({ book_id: _ex.book.id, page_num: r.pageNum, raw_text: r.text, ocr_status: 'done' })),
        { onConflict: 'book_id,page_num' }
      ),
      _adminDb.client.from('exam_doc_ai_pages').upsert(
        rows.map(r => ({ book_id: _ex.book.id, page_num: r.pageNum, layout_json: r.synth, raw_text: r.text, has_table: false, has_visual_element: false })),
        { onConflict: 'book_id,page_num' }
      ),
    ]);
  };

  try {
    await Promise.all(pending.map(async pageNum => {
      await acquire();
      try {
        const b64    = await exRenderPage(pageNum);
        const vision = await exCallVision(b64);
        const synth  = visionSynthetic(vision);
        const text   = daPageText(synth);
        _ex.docAi[pageNum] = synth;
        _ex.ocrDone++;
        detailEl.textContent = `Trang ${pageNum} xong`;
        updateProg();
        saveBuffer.push({ pageNum, text, synth });
        if (saveBuffer.length >= 5) await flushBuffer();
      } finally {
        release();
      }
    }));

    await flushBuffer();
    await _adminDb.client.from('exam_books').update({ total_pages: _ex.ocrTotal }).eq('id', _ex.book.id);

    barEl.style.width   = '100%';
    pctEl.textContent   = '100%';
    msgEl.textContent   = `✓ OCR hoàn tất ${_ex.ocrTotal} trang.`;
    msgEl.className     = 's-msg ok';

    setTimeout(() => {
      exShowPanel('ex-panel-parse');
      exRenderParsePanel(_ex.ocrTotal);
    }, 1200);

  } catch (e) {
    msgEl.textContent = 'Lỗi OCR: ' + e.message;
    msgEl.className   = 's-msg err';
    btn.disabled      = false;
  }
}

// ── Parse Panel ────────────────────────────────────────────────────
function exRenderParsePanel(ocrPageCount) {
  document.getElementById('ex-parse-content').innerHTML = `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;font-size:13px;margin-bottom:14px">
      <i class="fa-solid fa-circle-check" style="color:#16a34a"></i>
      Document AI OCR hoàn tất · <strong>${ocrPageCount}</strong> trang
    </div>

    <!-- Preview OCR text per page -->
    <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb">
        <i class="fa-solid fa-magnifying-glass" style="color:#6b7280;font-size:12px"></i>
        <span style="font-size:13px;font-weight:600;flex:1">Xem text OCR</span>
        <button onclick="exPreviewPage(-1)" style="width:26px;height:26px;border:1px solid #e5e7eb;border-radius:5px;background:#fff;cursor:pointer">‹</button>
        <span style="font-size:12px;color:#6b7280">Trang</span>
        <input id="ex-preview-page" type="number" min="1" max="${ocrPageCount}" value="1"
               oninput="exPreviewPage(0)"
               style="width:50px;height:26px;border:1px solid #e5e7eb;border-radius:5px;text-align:center;font-size:12px;padding:0 4px">
        <span style="font-size:12px;color:#6b7280">/ ${ocrPageCount}</span>
        <button onclick="exPreviewPage(1)" style="width:26px;height:26px;border:1px solid #e5e7eb;border-radius:5px;background:#fff;cursor:pointer">›</button>
        <button onclick="exCopyPage()" style="height:26px;padding:0 8px;border:1px solid #e5e7eb;border-radius:5px;background:#fff;cursor:pointer;font-size:11px">
          <i class="fa-solid fa-copy"></i> Copy
        </button>
      </div>
      <textarea id="ex-preview-text" readonly
        style="width:100%;height:200px;border:none;padding:10px 12px;font-family:'JetBrains Mono',monospace;
               font-size:11.5px;line-height:1.7;resize:vertical;outline:none;color:#374151;background:#fff"
        placeholder="Chọn trang để xem…"></textarea>
    </div>

    <div style="font-size:13px;color:#4b5563;margin-bottom:14px">
      AI sẽ tự tìm <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px">Unit X-Y</code> sub-unit boundaries
      rồi parse song song — câu hỏi, đáp án, từ vựng Section B.
    </div>
    <div id="ex-parse-progress" style="display:none;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
        <span id="ex-parse-label">Đang phân tích…</span>
        <span id="ex-parse-pct" style="font-weight:700;color:#7c3aed">0%</span>
      </div>
      <div style="background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden">
        <div id="ex-parse-bar" style="height:100%;background:linear-gradient(90deg,#7c3aed,#a78bfa);
             border-radius:999px;width:0%;transition:width .4s"></div>
      </div>
      <div id="ex-parse-chips" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:10px"></div>
    </div>
    <div id="ex-parse-msg" class="s-msg"></div>
    <button id="ex-start-parse-btn" class="s-btn" onclick="exStartParse()" style="width:100%;margin-top:12px">
      <i class="fa-solid fa-sparkles"></i> Phân tích tất cả Sub-unit với AI
    </button>
  `;
  exPreviewPage(0);
}

function exPreviewPage(delta) {
  const input  = document.getElementById('ex-preview-page');
  const textEl = document.getElementById('ex-preview-text');
  if (!input || !textEl) return;
  let p = parseInt(input.value) + delta;
  p = Math.max(1, Math.min(parseInt(input.max) || 1, p));
  input.value = p;

  // Try memory first, then DB
  const cached = _ex.docAi[p];
  if (cached) {
    textEl.value = daPageText(cached);
    return;
  }
  textEl.value = 'Đang tải…';
  _adminDb.client.from('exam_ocr_pages').select('raw_text').eq('book_id', _ex.book.id).eq('page_num', p).single()
    .then(({ data }) => { textEl.value = data?.raw_text || '(Trống)'; });
}

function exCopyPage() {
  const t = document.getElementById('ex-preview-text');
  if (t?.value) navigator.clipboard.writeText(t.value).then(() => {
    const btn = document.querySelector('[onclick="exCopyPage()"]');
    if (btn) { btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied'; setTimeout(() => { btn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy'; }, 1500); }
  });
}

// ── Detect sub-unit boundaries ─────────────────────────────────────
function exDetectSubUnitBoundaries(totalPages) {
  const maxUnit = parseInt(document.getElementById('ex-total-units')?.value) || 50;
  const seen    = new Map(); // key → first page
  // Pattern: "Unit 9 購物 9-1 網路購物" or "9-1" at start of line
  const SUBUNIT = /\bUnit\s*(\d{1,2})[^\n]*?(\d{1,2})-(\d{1,2})\b/i;
  const HEADER  = /(?:^|\n)\s*Unit\s*(\d{1,2})\b/i; // fallback: Unit N only

  const bounds = [];
  for (let p = 1; p <= totalPages; p++) {
    const text = _ex.docAi[p] ? daPageText(_ex.docAi[p]) : '';
    const mSub = text.match(SUBUNIT);
    if (mSub) {
      const unitNum = parseInt(mSub[1]);
      const subNum  = parseInt(mSub[3]);
      if (unitNum >= 1 && unitNum <= maxUnit) {
        const key = `${unitNum}-${subNum}`;
        if (!seen.has(key)) { seen.set(key, p); bounds.push({ unitNum, subNum, startPage: p }); }
      }
      continue;
    }
    // Fallback: plain "Unit N"
    const mUnit = text.match(HEADER);
    if (mUnit) {
      const unitNum = parseInt(mUnit[1]);
      if (unitNum >= 1 && unitNum <= maxUnit) {
        const key = `${unitNum}-0`;
        if (!seen.has(key)) { seen.set(key, p); bounds.push({ unitNum, subNum: 0, startPage: p }); }
      }
    }
  }
  return bounds.sort((a, b) => a.unitNum !== b.unitNum ? a.unitNum - b.unitNum : a.subNum - b.subNum);
}

// ── AI parse one sub-unit ──────────────────────────────────────────
async function exCallAIParse(unitText, tableText, unitNum, subNum) {
  const body = {
    model: 'gpt-4o',
    max_tokens: 4096,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a TOCFL Chinese exam parser. Extract content for Sub-unit ${unitNum}-${subNum} from OCR text.

Section A (測驗練習):
1. 一、對話聽力 — listening MCQ, question_text is always ""
2. 二、完成句子 — sentence completion, fill in blank ___
3. 三、選詞填空 — cloze passage with numbered blanks
4. 四、材料閱讀 — reading material + MCQ
5. 五、短文閱讀 — short essay + MCQ

Section B (關鍵詞語):
- 一、主題相關詞語 table
- 二、常用詞組 table

RULES:
- Traditional Chinese (繁體中文) only — never output simplified characters
- correct answers are NOT in the question scan — always set answer: null
- Extract ALL choices A B C D for every question

Return ONLY valid JSON:
{
  "unit_number": ${unitNum}, "sub_number": ${subNum},
  "title_zh": "主題", "sub_title_zh": "副主題",
  "sections": [{
    "section_number": 1, "type": "listening", "title": "一、對話聽力",
    "passages": [],
    "questions": [{"q_num":1,"text":"","passage_label":null,
      "choices":{"A":"...","B":"...","C":"...","D":"..."},"answer":null}]
  }],
  "vocab": [{"source":"一、對話聽力1","word":"天堂","related":"付稅"}],
  "phrases": [{"source":"一、對話聽力3","phrase":"付稅","example_zh":"進口貨..."}]
}`
      },
      {
        role: 'user',
        content: `OCR text for Sub-unit ${unitNum}-${subNum}:\n\n${unitText.slice(0, 12000)}${tableText ? '\n\nTables:\n' + tableText : ''}`
      }
    ]
  };

  const key      = localStorage.getItem('api_key_openai') || '';
  if (!key) throw new Error('Chưa có OpenAI key');
  const useProxy = location.protocol !== 'file:';

  const res = useProxy
    ? await fetch(location.origin + '/api/proxy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'openai', apiKey: key, body })
      })
    : await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body)
      });

  const data = await res.json();
  if (data.error) throw new Error(typeof data.error === 'object' ? data.error.message : data.error);
  return JSON.parse(data.choices[0].message.content);
}

// ── Save parsed sub-unit ───────────────────────────────────────────
async function exSaveUnitData(parsed) {
  const { data: unit, error: uErr } = await _adminDb.client
    .from('exam_units')
    .upsert(
      { book_id: _ex.book.id, unit_number: parsed.unit_number, sub_number: parsed.sub_number,
        title_zh: parsed.title_zh, sub_title_zh: parsed.sub_title_zh, status: 'draft' },
      { onConflict: 'book_id,unit_number,sub_number' }
    )
    .select().single();
  if (uErr) throw uErr;

  await _adminDb.client.from('exam_sections').delete().eq('unit_id', unit.id);

  for (const sec of (parsed.sections || [])) {
    const { data: section } = await _adminDb.client
      .from('exam_sections')
      .insert({ unit_id: unit.id, section_number: sec.section_number, section_type: sec.type, title: sec.title })
      .select().single();

    const passMap = {};
    for (const pass of (sec.passages || [])) {
      if (!pass.text && !pass.label) continue;
      const { data: passage } = await _adminDb.client
        .from('exam_passages')
        .insert({ section_id: section.id, label: pass.label || null, content_text: pass.text || '' })
        .select().single();
      passMap[pass.label || '__def__'] = passage.id;
    }

    for (const q of (sec.questions || [])) {
      const passId = passMap[q.passage_label] || passMap['__def__'] || null;
      const { data: question } = await _adminDb.client
        .from('exam_questions')
        .insert({ section_id: section.id, passage_id: passId, question_number: q.q_num,
          question_text: q.text || '', correct_answer: q.answer || null })
        .select().single();

      const choiceRows = Object.entries(q.choices || {})
        .map(([label, text]) => ({ question_id: question.id, label, text }));
      if (choiceRows.length) await _adminDb.client.from('exam_choices').insert(choiceRows);
    }
  }

  await _adminDb.client.from('exam_vocab').delete().eq('unit_id', unit.id);
  if (parsed.vocab?.length) await _adminDb.client.from('exam_vocab').insert(
    parsed.vocab.map(v => ({ unit_id: unit.id, source_section: v.source, word_zh: v.word, related_words: v.related }))
  );

  await _adminDb.client.from('exam_phrases').delete().eq('unit_id', unit.id);
  if (parsed.phrases?.length) await _adminDb.client.from('exam_phrases').insert(
    parsed.phrases.map(p => ({ unit_id: unit.id, source_section: p.source, phrase_zh: p.phrase, example_zh: p.example_zh }))
  );
}

// ── Start AI Parse ─────────────────────────────────────────────────
async function exStartParse() {
  const btn     = document.getElementById('ex-start-parse-btn');
  const progEl  = document.getElementById('ex-parse-progress');
  const barEl   = document.getElementById('ex-parse-bar');
  const labelEl = document.getElementById('ex-parse-label');
  const pctEl   = document.getElementById('ex-parse-pct');
  const chipsEl = document.getElementById('ex-parse-chips');
  const msgEl   = document.getElementById('ex-parse-msg');
  btn.disabled = true;
  progEl.style.display = '';

  try {
    // Load OCR texts if not in memory
    if (Object.keys(_ex.docAi).length === 0) {
      const { data: pages } = await _adminDb.client
        .from('exam_doc_ai_pages').select('page_num,layout_json').eq('book_id', _ex.book.id).order('page_num');
      (pages || []).forEach(r => { _ex.docAi[r.page_num] = r.layout_json; });
    }

    const totalPages = Object.keys(_ex.docAi).length;
    const bounds     = exDetectSubUnitBoundaries(totalPages);

    if (!bounds.length) {
      msgEl.textContent = 'Không tìm thấy sub-unit header. Xem OCR text để kiểm tra.';
      msgEl.className = 's-msg err';
      btn.disabled = false; return;
    }

    const chunks = bounds.map((b, i) => {
      const endPage = i + 1 < bounds.length ? bounds[i + 1].startPage - 1 : totalPages;
      const text    = Array.from({ length: endPage - b.startPage + 1 }, (_, j) => {
        const p = b.startPage + j;
        return _ex.docAi[p] ? daPageText(_ex.docAi[p]) : '';
      }).join('\n\n');

      // Extract tables from Document AI for Section B vocab
      const tableText = Array.from({ length: endPage - b.startPage + 1 }, (_, j) => {
        const p = b.startPage + j;
        if (!_ex.docAi[p]) return '';
        return daExtractTables(_ex.docAi[p]).map(rows =>
          rows.map(cells => cells.join(' | ')).join('\n')
        ).join('\n---\n');
      }).filter(Boolean).join('\n');

      return { unitNum: b.unitNum, subNum: b.subNum, text, tableText };
    });

    let done = 0;
    labelEl.textContent = `Tìm thấy ${chunks.length} sub-unit. Đang parse…`;
    chipsEl.innerHTML = chunks.map(c =>
      `<span id="ex-chip-${c.unitNum}-${c.subNum}" style="font-size:11px;padding:3px 10px;border-radius:999px;background:#e5e7eb;color:#6b7280">
        ${c.unitNum}-${c.subNum}
      </span>`
    ).join('');

    const failed = [];
    const POOL = 6;
    for (let i = 0; i < chunks.length; i += POOL) {
      const pool = chunks.slice(i, i + POOL);
      const res  = await Promise.allSettled(pool.map(async c => {
        const parsed = await exCallAIParse(c.text, c.tableText, c.unitNum, c.subNum);
        await exSaveUnitData(parsed);
        done++;
        const pct  = Math.round(done / chunks.length * 100);
        barEl.style.width = pct + '%';
        pctEl.textContent = pct + '%';
        labelEl.textContent = `Phân tích: ${done} / ${chunks.length} sub-unit…`;
        const chip = document.getElementById(`ex-chip-${c.unitNum}-${c.subNum}`);
        if (chip) { chip.style.background = '#dcfce7'; chip.style.color = '#15803d'; chip.textContent = `${c.unitNum}-${c.subNum} ✓`; }
      }));
      res.forEach((r, j) => {
        if (r.status === 'rejected') {
          failed.push(pool[j]);
          const chip = document.getElementById(`ex-chip-${pool[j].unitNum}-${pool[j].subNum}`);
          if (chip) { chip.style.background = '#fee2e2'; chip.style.color = '#dc2626'; chip.textContent = `${pool[j].unitNum}-${pool[j].subNum} ✗`; }
        }
      });
    }

    if (failed.length) {
      msgEl.textContent = `${done}/${chunks.length} thành công · ${failed.length} lỗi.`;
      msgEl.className = 's-msg err';
      btn.disabled = false;
    } else {
      msgEl.textContent = `✓ Phân tích hoàn tất ${chunks.length} sub-unit.`;
      msgEl.className = 's-msg ok';
      setTimeout(() => {
        exShowPanel('ex-panel-units');
        document.getElementById('ex-units-title').textContent = _ex.book.title;
        exLoadUnits(_ex.book.id);
      }, 1200);
    }
  } catch (e) {
    msgEl.textContent = 'Lỗi: ' + e.message;
    msgEl.className = 's-msg err';
    btn.disabled = false;
  }
}

// ── Unit list ──────────────────────────────────────────────────────
async function exLoadUnits(bookId) {
  const { data: units } = await _adminDb.client
    .from('exam_units')
    .select('id,unit_number,sub_number,title_zh,sub_title_zh,status')
    .eq('book_id', bookId).order('unit_number').order('sub_number');

  const el = document.getElementById('ex-units-list');
  if (!units?.length) {
    el.innerHTML = '<p style="color:#9ca3af;font-size:13px;text-align:center;padding:24px">Chưa có Sub-unit nào.</p>';
    return;
  }
  el.innerHTML = units.map(u => `
    <div style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;background:#f9fafb"
           onclick="exToggleUnit(${u.id})">
        <span style="font-family:'Noto Serif TC',serif;font-size:14px;font-weight:700;color:#1a56db;min-width:36px">
          ${u.unit_number}${u.sub_number > 0 ? '-' + u.sub_number : ''}
        </span>
        <div style="flex:1">
          <div style="font-weight:600;font-size:13px">${escHtml(u.sub_title_zh || u.title_zh || '—')}</div>
          ${u.title_zh && u.sub_title_zh ? `<div style="font-size:11px;color:#9ca3af">${escHtml(u.title_zh)}</div>` : ''}
        </div>
        <span style="font-size:11px;padding:2px 10px;border-radius:999px;
               background:${u.status === 'published' ? '#dcfce7' : '#fef9c3'};
               color:${u.status === 'published' ? '#15803d' : '#a16207'}">
          ${u.status === 'published' ? 'Đã xuất bản' : 'Bản nháp'}
        </span>
        <button onclick="event.stopPropagation();exPublishUnit(${u.id},'${u.status}')"
                class="s-btn" style="padding:3px 10px;font-size:11px;
                background:${u.status === 'published' ? '#6b7280' : '#1a56db'}">
          ${u.status === 'published' ? 'Bỏ XB' : 'Xuất bản'}
        </button>
        <i class="fa-solid fa-chevron-down" id="ex-chev-${u.id}"
           style="font-size:10px;color:#9ca3af;transition:.2s;margin-left:4px"></i>
      </div>
      <div id="ex-unit-body-${u.id}" style="display:none"></div>
    </div>`).join('');
}

async function exToggleUnit(unitId) {
  const body = document.getElementById(`ex-unit-body-${unitId}`);
  const chev = document.getElementById(`ex-chev-${unitId}`);
  if (body.style.display !== 'none') { body.style.display = 'none'; chev.style.transform = ''; return; }
  chev.style.transform = 'rotate(180deg)';
  body.style.display = '';
  body.innerHTML = '<div style="padding:12px 14px;color:#9ca3af;font-size:13px">Đang tải…</div>';

  const { data: sections } = await _adminDb.client
    .from('exam_sections').select('id,section_number,section_type,title')
    .eq('unit_id', unitId).order('section_number');

  const sectionIds = (sections || []).map(s => s.id);
  const { data: questions } = await _adminDb.client
    .from('exam_questions')
    .select('id,section_id,question_number,question_text,correct_answer,flag_warnings')
    .in('section_id', sectionIds).order('question_number');

  const qIds = (questions || []).map(q => q.id);
  const { data: choicesArr } = qIds.length
    ? await _adminDb.client.from('exam_choices').select('id,question_id,label,text').in('question_id', qIds)
    : { data: [] };

  const [{ data: vocab }, { data: phrases }] = await Promise.all([
    _adminDb.client.from('exam_vocab').select('*').eq('unit_id', unitId),
    _adminDb.client.from('exam_phrases').select('*').eq('unit_id', unitId),
  ]);

  const choicesByQ = {};
  (choicesArr || []).forEach(c => {
    if (!choicesByQ[c.question_id]) choicesByQ[c.question_id] = {};
    choicesByQ[c.question_id][c.label] = c;
  });
  const qsBySection = {};
  (questions || []).forEach(q => {
    if (!qsBySection[q.section_id]) qsBySection[q.section_id] = [];
    qsBySection[q.section_id].push(q);
  });

  let html = '<div style="padding:0 14px 16px">';
  if (sections?.length) {
    html += '<div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.06em;margin:12px 0 8px;text-transform:uppercase">A · 測驗練習</div>';
    for (const sec of sections) {
      const qs         = qsBySection[sec.id] || [];
      const unanswered = qs.filter(q => !q.correct_answer).length;
      const flagged    = qs.filter(q => q.flag_warnings?.some(f => f.level === 'red')).length;
      html += `<div style="margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">
          ${escHtml(sec.title || sec.section_type)}
          <span style="font-weight:400;color:#9ca3af">${qs.length} câu</span>
          ${unanswered ? `<span style="font-size:11px;color:#dc2626;background:#fef2f2;padding:1px 8px;border-radius:999px">${unanswered} chưa đáp án</span>` : ''}
          ${flagged ? `<span style="font-size:11px;color:#dc2626;background:#fef2f2;padding:1px 8px;border-radius:999px">⚠ ${flagged}</span>` : ''}
        </div>
        ${qs.map(q => exQRow(q, choicesByQ[q.id] || {})).join('')}
      </div>`;
    }
  }

  if (vocab?.length || phrases?.length) {
    html += '<div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.06em;margin:16px 0 8px;text-transform:uppercase">B · 關鍵詞語</div>';
    if (vocab?.length) html += `<div style="margin-bottom:12px">
      <div style="font-size:13px;font-weight:600;margin-bottom:6px">一、主題相關詞語</div>
      <table style="width:100%;font-size:12px;border-collapse:collapse">
        <thead><tr style="background:#f3f4f6">
          <th style="padding:5px 10px;text-align:left;border:1px solid #e5e7eb">Xuất xứ</th>
          <th style="padding:5px 10px;text-align:left;border:1px solid #e5e7eb">Từ</th>
          <th style="padding:5px 10px;text-align:left;border:1px solid #e5e7eb">Từ liên quan</th>
        </tr></thead>
        <tbody>${vocab.map(v => `<tr>
          <td style="padding:5px 10px;border:1px solid #e5e7eb;color:#6b7280;font-size:11px">${escHtml(v.source_section||'')}</td>
          <td style="padding:5px 10px;border:1px solid #e5e7eb;font-family:'Noto Serif TC',serif">${escHtml(v.word_zh||'')}</td>
          <td style="padding:5px 10px;border:1px solid #e5e7eb">${escHtml(v.related_words||'')}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;

    if (phrases?.length) html += `<div>
      <div style="font-size:13px;font-weight:600;margin-bottom:6px">二、常用詞組</div>
      <table style="width:100%;font-size:12px;border-collapse:collapse">
        <thead><tr style="background:#f3f4f6">
          <th style="padding:5px 10px;text-align:left;border:1px solid #e5e7eb">Xuất xứ</th>
          <th style="padding:5px 10px;text-align:left;border:1px solid #e5e7eb">Cụm từ</th>
          <th style="padding:5px 10px;text-align:left;border:1px solid #e5e7eb">Ví dụ</th>
        </tr></thead>
        <tbody>${phrases.map(p => `<tr>
          <td style="padding:5px 10px;border:1px solid #e5e7eb;color:#6b7280;font-size:11px">${escHtml(p.source_section||'')}</td>
          <td style="padding:5px 10px;border:1px solid #e5e7eb;font-family:'Noto Serif TC',serif">${escHtml(p.phrase_zh||'')}</td>
          <td style="padding:5px 10px;border:1px solid #e5e7eb">${escHtml(p.example_zh||'')}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
  }
  html += '</div>';
  body.innerHTML = html;
}

// ── Question row ───────────────────────────────────────────────────
function exQRow(q, choices) {
  const ABCD   = ['A','B','C','D'];
  const flags  = q.flag_warnings || [];
  const red    = flags.filter(f => f.level === 'red');
  return `<div id="ex-q-${q.id}" style="background:#f9fafb;border:1px solid ${red.length?'#fca5a5':'#e5e7eb'};
    border-radius:6px;padding:9px 12px;margin-bottom:5px;font-size:12px">
    ${red.length ? `<div style="font-size:11px;color:#dc2626;margin-bottom:5px">⚠ ${escHtml(red[0].message)}</div>` : ''}
    <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px">
      <span style="font-weight:700;color:#1a56db;min-width:26px">Q${q.question_number}</span>
      <span style="color:#374151;flex:1">${escHtml(q.question_text||'(Nghe)')}</span>
      <span onclick="exEditQ(${q.id})" style="cursor:pointer;color:#6b7280;font-size:11px;white-space:nowrap">
        <i class="fa-solid fa-pen-to-square"></i> Sửa</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-bottom:7px">
      ${ABCD.map(l => {
        const c = choices[l]; const ok = q.correct_answer === l;
        return `<div style="padding:3px 8px;border-radius:4px;
          background:${ok?'#dcfce7':'#fff'};border:1px solid ${ok?'#16a34a':'#e5e7eb'}">
          <span style="font-weight:700;color:${ok?'#15803d':'#9ca3af'};margin-right:5px">${l}</span>
          <span>${escHtml(c?.text||'—')}</span></div>`;
      }).join('')}
    </div>
    <div style="display:flex;align-items:center;gap:5px">
      <span style="font-size:11px;color:#6b7280;margin-right:2px">Đáp án:</span>
      ${ABCD.map(l => `<button onclick="exSetAnswer(${q.id},'${l}')"
        style="width:26px;height:26px;border-radius:5px;cursor:pointer;font-weight:700;font-size:11px;
               border:1.5px solid ${q.correct_answer===l?'#1a56db':'#e5e7eb'};
               background:${q.correct_answer===l?'#1a56db':'#fff'};
               color:${q.correct_answer===l?'#fff':'#374151'}">${l}</button>`).join('')}
    </div>
  </div>`;
}

async function exSetAnswer(qId, answer) {
  await _adminDb.client.from('exam_questions').update({ correct_answer: answer }).eq('id', qId);
  const [{ data: q }, { data: ca }] = await Promise.all([
    _adminDb.client.from('exam_questions').select('*').eq('id', qId).single(),
    _adminDb.client.from('exam_choices').select('*').eq('question_id', qId),
  ]);
  const choices = {}; (ca||[]).forEach(c => { choices[c.label] = c; });
  const el = document.getElementById(`ex-q-${qId}`);
  if (el) el.outerHTML = exQRow(q, choices);
}

async function exEditQ(qId) {
  const [{ data: q }, { data: ca }] = await Promise.all([
    _adminDb.client.from('exam_questions').select('*').eq('id', qId).single(),
    _adminDb.client.from('exam_choices').select('*').eq('question_id', qId).order('label'),
  ]);
  const choices = {}; (ca||[]).forEach(c => { choices[c.label] = c; });
  const el = document.getElementById(`ex-q-${qId}`); if (!el) return;
  el.innerHTML = `
    <div style="font-weight:600;font-size:12px;margin-bottom:6px;color:#1a56db">Q${q.question_number} — Chỉnh sửa</div>
    <textarea id="eq-text-${qId}" style="width:100%;height:44px;font-size:12px;border:1px solid #e5e7eb;border-radius:6px;padding:6px;resize:vertical;margin-bottom:8px">${escHtml(q.question_text||'')}</textarea>
    ${['A','B','C','D'].map(l => `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
      <span style="font-weight:700;min-width:16px;color:#6b7280">${l}</span>
      <input id="eq-c-${qId}-${l}" class="s-input" value="${escHtml(choices[l]?.text||'')}" style="flex:1;padding:4px 8px;font-size:12px">
    </div>`).join('')}
    <div style="display:flex;gap:6px;margin-top:8px">
      <button class="s-btn" onclick="exSaveQ(${qId})" style="padding:4px 14px;font-size:12px">Lưu</button>
      <button class="s-btn" onclick="exCancelQ(${qId})" style="padding:4px 14px;font-size:12px;background:#6b7280">Hủy</button>
    </div>`;
}

async function exSaveQ(qId) {
  const text = document.getElementById(`eq-text-${qId}`)?.value.trim()||'';
  await _adminDb.client.from('exam_questions').update({ question_text: text }).eq('id', qId);
  for (const l of ['A','B','C','D']) {
    const val = document.getElementById(`eq-c-${qId}-${l}`)?.value.trim()||'';
    await _adminDb.client.from('exam_choices').update({ text: val }).match({ question_id: qId, label: l });
  }
  exCancelQ(qId);
}

async function exCancelQ(qId) {
  const [{ data: q }, { data: ca }] = await Promise.all([
    _adminDb.client.from('exam_questions').select('*').eq('id', qId).single(),
    _adminDb.client.from('exam_choices').select('*').eq('question_id', qId),
  ]);
  const choices = {}; (ca||[]).forEach(c => { choices[c.label] = c; });
  const el = document.getElementById(`ex-q-${qId}`);
  if (el) el.outerHTML = exQRow(q, choices);
}

async function exPublishUnit(unitId, currentStatus) {
  const next = currentStatus === 'published' ? 'draft' : 'published';
  await _adminDb.client.from('exam_units').update({ status: next }).eq('id', unitId);
  exLoadUnits(_ex.book.id);
}

// ── Markdown Import ────────────────────────────────────────────────
const _md = { exerciseText: null, answerText: null };

function exShowMarkdown() {
  _ex.book = null;
  _md.exerciseText = null;
  _md.answerText   = null;
  loadExams();
  exShowPanel('ex-panel-markdown');
}

function mdFileChange(input, type) {
  const file = input.files[0];
  if (!file) return;
  const key    = type === 'exercise' ? 'exerciseText' : 'answerText';
  const nameEl = document.getElementById(`md-${type}-name`);
  const dropEl = document.getElementById(`md-${type}-drop`);
  nameEl.textContent = 'Đang đọc…';
  const reader = new FileReader();
  reader.onload = e => {
    _md[key]                 = e.target.result;
    nameEl.textContent       = file.name;
    dropEl.style.borderColor = '#7c3aed';
    dropEl.style.background  = '#f5f3ff';
  };
  reader.readAsText(file, 'utf-8');
}

// ── Answer markdown parser ─────────────────────────────────────────
// Input: text of answers.md
// Returns: { "unitNum-subNum": { qNum: "A"|"B"|"C"|"D", ... }, ... }
function parseMdAnswers(text) {
  const answers = {};
  const unitRe  = /^#{1,3}\s+Unit\s+(\d+)\s+(\d+)-(\d+)/gm;
  const positions = [];
  let m;
  while ((m = unitRe.exec(text)) !== null) {
    positions.push({ unitNum: parseInt(m[1]), subNum: parseInt(m[3]), idx: m.index + m[0].length });
  }
  positions.forEach((pos, i) => {
    const key      = `${pos.unitNum}-${pos.subNum}`;
    const blockEnd = i + 1 < positions.length ? positions[i + 1].idx : text.length;
    const block    = text.slice(pos.idx, blockEnd);
    const qAns     = {};
    for (const line of block.split('\n')) {
      if (!line.includes('|')) continue;
      if (/^\s*\|[\s|:-]+\|\s*$/.test(line)) continue; // separator row
      const cells = line.split('|').slice(1, -1).map(c => c.trim()).filter(Boolean);
      for (let j = 0; j + 1 < cells.length; j += 2) {
        const n = parseInt(cells[j]);
        const a = cells[j + 1].toUpperCase();
        if (n > 0 && /^[A-D]$/.test(a)) qAns[n] = a;
      }
    }
    answers[key] = qAns;
  });
  return answers;
}

// ── Exercise markdown parser ───────────────────────────────────────
// Input: text of exercise.md, answers map from parseMdAnswers()
// Returns: array of unit objects ready for exSaveUnitData()
function parseMdExercise(text, answers) {
  const units  = [];
  // Header: "## Unit 1 個人資料 1-1 姓名、籍貫…"
  const hdrRe  = /^#{1,3}\s+Unit\s+(\d+)\s+(.+?)\s+(\d+)-(\d+)\s+(.+)$/gm;
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
    const secAText = aStart != null ? block.slice(aStart, bStart ?? block.length) : '';
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

// Parse Section A: 一/二/三/四/五 sub-sections with questions
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

// Segment text into alternating passage/question groups, extract both
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

// Parse a block that may have ## passage sub-headers before questions
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

// Parse numbered questions with A/B/C/D choices (multi-line or inline)
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
    // Single-letter choice line: "A text", "B text", etc.
    const chM = line.match(/^([A-D])\s+(.*)/);
    if (chM && cur) { cur.choices[chM[1]] = chM[2].trim(); continue; }
    // Continuation text before any choices seen
    if (cur && Object.keys(cur.choices).length === 0) {
      cur.text = cur.text ? `${cur.text} ${line}` : line;
    }
  }
  save();
  return qs;
}

// Detect whether choices appear inline with (or instead of) question text
function mdParseChoices(text) {
  if (!text) return { qText: '', choices: {} };
  // Line starts with "A ..." — either all-inline or first choice only
  if (/^A\s/.test(text)) {
    const all = mdExtractABCD(text);
    if (all) return { qText: '', choices: all };
    // Only choice A — remainder will come from subsequent lines
    return { qText: '', choices: { A: text.slice(2).trim() } };
  }
  // "question text A ch B ch C ch D ch" pattern
  const m = text.match(/^(.*?)\s+A\s+(.*?)\s+B\s+(.*?)\s+C\s+(.*?)\s+D\s+(.+)$/s);
  if (m && m[1].trim()) {
    return { qText: m[1].trim(),
             choices: { A: m[2].trim(), B: m[3].trim(), C: m[4].trim(), D: m[5].trim() } };
  }
  return { qText: text, choices: {} };
}

// Extract "A ... B ... C ... D ..." when all four choices are on one line
function mdExtractABCD(text) {
  const m = text.match(/^A\s+(.*?)\s+B\s+(.*?)\s+C\s+(.*?)\s+D\s+(.+)$/s);
  if (!m) return null;
  return { A: m[1].trim(), B: m[2].trim(), C: m[3].trim(), D: m[4].trim() };
}

// Parse Section B: 主題相關詞語 and 常用詞組 markdown tables
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

// Parse a markdown table; returns array of string arrays (one per data row)
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

// ── Run markdown import ────────────────────────────────────────────
async function exStartMdImport() {
  const title      = document.getElementById('md-title').value.trim();
  const level      = document.getElementById('md-level').value;
  const totalUnits = parseInt(document.getElementById('md-total-units').value) || 30;
  const btn        = document.getElementById('md-import-btn');

  if (!title)            { showMsg('md-msg', 'Nhập tên bộ đề.', 'err'); return; }
  if (!_md.exerciseText) { showMsg('md-msg', 'Chưa chọn file bài tập.', 'err'); return; }
  if (!_md.answerText)   { showMsg('md-msg', 'Chưa chọn file đáp án.', 'err'); return; }

  btn.disabled = true;
  showMsg('md-msg', '', '');

  try {
    const answers = parseMdAnswers(_md.answerText);
    const units   = parseMdExercise(_md.exerciseText, answers);
    if (!units.length) {
      showMsg('md-msg', 'Không tìm thấy Unit nào trong file. Kiểm tra lại định dạng.', 'err');
      btn.disabled = false;
      return;
    }

    const { data: book, error: bErr } = await _adminDb.client
      .from('exam_books')
      .insert({ title, level: level || null, total_units: totalUnits, status: 'draft' })
      .select().single();
    if (bErr) throw bErr;
    _ex.book = book;
    await loadExams();

    const progEl  = document.getElementById('md-progress');
    const barEl   = document.getElementById('md-progress-bar');
    const labelEl = document.getElementById('md-progress-label');
    const pctEl   = document.getElementById('md-progress-pct');
    const chipsEl = document.getElementById('md-progress-chips');
    progEl.style.display = '';
    chipsEl.innerHTML = units.map(u =>
      `<span id="md-chip-${u.unit_number}-${u.sub_number}"
             style="font-size:11px;padding:3px 10px;border-radius:999px;background:#e5e7eb;color:#6b7280">
         ${u.unit_number}-${u.sub_number}
       </span>`
    ).join('');

    let done = 0;
    const failed = [];
    for (const unit of units) {
      try {
        await exSaveUnitData(unit);
        done++;
        const pct = Math.round(done / units.length * 100);
        barEl.style.width   = pct + '%';
        pctEl.textContent   = pct + '%';
        labelEl.textContent = `Lưu: ${done} / ${units.length} sub-unit…`;
        const chip = document.getElementById(`md-chip-${unit.unit_number}-${unit.sub_number}`);
        if (chip) { chip.style.background = '#dcfce7'; chip.style.color = '#15803d'; chip.textContent = `${unit.unit_number}-${unit.sub_number} ✓`; }
      } catch (e) {
        failed.push(`${unit.unit_number}-${unit.sub_number}`);
        const chip = document.getElementById(`md-chip-${unit.unit_number}-${unit.sub_number}`);
        if (chip) { chip.style.background = '#fee2e2'; chip.style.color = '#dc2626'; chip.textContent = `${unit.unit_number}-${unit.sub_number} ✗`; }
      }
    }

    if (failed.length) {
      showMsg('md-msg', `${done}/${units.length} thành công · lỗi: ${failed.join(', ')}`, 'err');
      btn.disabled = false;
    } else {
      showMsg('md-msg', `✓ Import hoàn tất ${units.length} sub-unit.`, 'ok');
      setTimeout(() => {
        exShowPanel('ex-panel-units');
        document.getElementById('ex-units-title').textContent = book.title;
        exLoadUnits(book.id);
      }, 1200);
    }
  } catch (e) {
    showMsg('md-msg', 'Lỗi: ' + e.message, 'err');
    btn.disabled = false;
  }
}
