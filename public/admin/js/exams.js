// ── State ──────────────────────────────────────────────────────────
const _ex = {
  book:      null,   // selected exam_books row
  pdf:       null,   // pdfjs document
  ocrTexts:  {},     // { pageNum: rawText }
  ocrDone:   0,
  ocrTotal:  0,
  parseDone: 0,
  parseTotal: 0,
};

function exMsg(id, text, type) { showMsg(id, text, type); }

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
  ['ex-panel-create', 'ex-panel-ocr', 'ex-panel-parse', 'ex-panel-units']
    .forEach(p => { document.getElementById(p).style.display = p === id ? '' : 'none'; });
}

function exShowCreate() {
  _ex.book = null;
  loadExams();
  exShowPanel('ex-panel-create');
}

function exShowOCRPanel() {
  exShowPanel('ex-panel-ocr');
  exRenderOCRPanel();
}

// ── Book CRUD ──────────────────────────────────────────────────────
async function exSaveBook() {
  const title      = document.getElementById('ex-title').value.trim();
  const level      = document.getElementById('ex-level').value;
  const totalUnits = parseInt(document.getElementById('ex-total-units').value) || 30;
  if (!title) { exMsg('ex-create-msg', 'Nhập tên bộ đề.', 'err'); return; }

  const btn = document.getElementById('ex-save-btn');
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo…';

  const { data, error } = await _adminDb.client
    .from('exam_books')
    .insert({ title, level: level || null, total_units: totalUnits, status: 'draft' })
    .select().single();

  btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-plus"></i> Tạo bộ đề & tiến đến OCR';

  if (error) { exMsg('ex-create-msg', 'Lỗi: ' + error.message, 'err'); return; }

  _ex.book = data;
  await loadExams();
  exShowPanel('ex-panel-ocr');
  exRenderOCRPanel();
}

async function exSelectBook(bookId) {
  const { data } = await _adminDb.client
    .from('exam_books').select('*').eq('id', bookId).single();
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
  if (!confirm(`Xóa "${_ex.book.title}"? Toàn bộ Unit, câu hỏi và OCR data sẽ bị xóa vĩnh viễn.`)) return;
  await _adminDb.client.from('exam_books').delete().eq('id', _ex.book.id);
  _ex.book = null;
  _ex.ocrTexts = {};
  _ex.pdf = null;
  await loadExams();
  exShowPanel('ex-panel-create');
}

// ── OCR Panel ──────────────────────────────────────────────────────
function exRenderOCRPanel() {
  const openaiKey = localStorage.getItem('api_key_openai') || '';
  const label     = document.getElementById('ex-ocr-book-label');
  if (label && _ex.book) label.textContent = _ex.book.title;

  document.getElementById('ex-ocr-content').innerHTML = `
    ${!openaiKey ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;font-size:13px;color:#dc2626;margin-bottom:12px">
      <i class="fa-solid fa-triangle-exclamation"></i> Chưa có OpenAI key —
      <a href="settings.html" style="color:#1a56db;font-weight:600">vào Settings</a> để thêm.
    </div>` : `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 14px;font-size:12px;color:#1e40af;margin-bottom:12px">
      <i class="fa-solid fa-eye"></i> OCR dùng <strong>gpt-4o-mini vision</strong> · 3 trang/call · 10 song song · ~$0.002/trang
    </div>`}
    <div class="s-label">Upload file PDF (ảnh scan)</div>
    <input type="file" id="ex-pdf-input" accept=".pdf" style="display:none" onchange="exFileChange(this)">
    <div id="ex-drop-zone"
         onclick="document.getElementById('ex-pdf-input').click()"
         ondragover="event.preventDefault();this.style.borderColor='#1a56db'"
         ondragleave="this.style.borderColor='#d1d5db'"
         ondrop="exDropFile(event)"
         style="border:2px dashed #d1d5db;border-radius:10px;padding:36px;text-align:center;cursor:pointer;background:#f9fafb;transition:border-color .15s">
      <i class="fa-solid fa-file-pdf" style="font-size:32px;color:#dc2626;display:block;margin-bottom:10px"></i>
      <div style="font-size:14px;font-weight:600;color:#374151">Kéo thả PDF vào đây</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:4px">hoặc click để chọn · PDF ảnh scan, không cần text</div>
    </div>
    <div id="ex-pdf-info" style="display:none;margin-top:10px;background:#eff6ff;border-radius:8px;padding:10px 14px;font-size:13px"></div>
    <div id="ex-ocr-progress" style="display:none;margin-top:14px">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
        <span id="ex-ocr-label">Đang OCR…</span>
        <span id="ex-ocr-pct" style="font-weight:700;color:#1a56db">0%</span>
      </div>
      <div style="background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden">
        <div id="ex-ocr-bar" style="height:100%;background:linear-gradient(90deg,#dc2626,#f87171);border-radius:999px;width:0%;transition:width .4s"></div>
      </div>
      <div id="ex-ocr-detail" style="font-size:11px;color:#6b7280;margin-top:5px"></div>
    </div>
    <div id="ex-ocr-msg" class="s-msg" style="margin-top:10px"></div>
    <button id="ex-start-ocr-btn" class="s-btn" onclick="exStartOCR()" style="display:none;margin-top:12px;width:100%">
      <i class="fa-solid fa-eye"></i> Bắt đầu OCR
    </button>
  `;
}

async function exFileChange(input) {
  const file = input.files[0];
  if (file) await exLoadPDF(file);
}

function exDropFile(e) {
  e.preventDefault();
  document.getElementById('ex-drop-zone').style.borderColor = '#d1d5db';
  const file = e.dataTransfer.files[0];
  if (file) exLoadPDF(file);
}

async function exLoadPDF(file) {
  const infoEl = document.getElementById('ex-pdf-info');
  const btn    = document.getElementById('ex-start-ocr-btn');
  infoEl.style.display = '';
  infoEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang load PDF…';

  try {
    if (typeof pdfjsLib === 'undefined') throw new Error('pdf.js chưa load — refresh trang.');
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

    const buf  = await file.arrayBuffer();
    _ex.pdf    = await pdfjsLib.getDocument({ data: buf }).promise;
    _ex.ocrTotal = _ex.pdf.numPages;
    _ex.ocrDone  = 0;
    _ex.ocrTexts = {};

    const sizeMB  = (file.size / 1024 / 1024).toFixed(1);
    const batches = Math.ceil(_ex.ocrTotal / 30); // 10 parallel × 3 pages/call
    const estSec  = batches * 5;                  // ~5s per batch

    // Check existing OCR pages
    const { count: existing } = await _adminDb.client
      .from('exam_ocr_pages')
      .select('*', { count: 'exact', head: true })
      .eq('book_id', _ex.book.id);

    infoEl.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center">
        <i class="fa-solid fa-file-pdf" style="color:#dc2626;font-size:22px"></i>
        <div>
          <div style="font-weight:600">${escHtml(file.name)}</div>
          <div style="color:#6b7280;margin-top:2px">${_ex.ocrTotal} trang · ${sizeMB} MB · ước tính ~${estSec}s</div>
        </div>
      </div>
    `;

    btn.style.display = '';
    btn.innerHTML = existing > 0
      ? `<i class="fa-solid fa-eye"></i> Tiếp tục OCR (${existing}/${_ex.ocrTotal} trang đã xong)`
      : `<i class="fa-solid fa-eye"></i> Bắt đầu OCR ${_ex.ocrTotal} trang`;

  } catch (e) {
    infoEl.innerHTML = `<span style="color:#dc2626">Lỗi: ${e.message}</span>`;
  }
}

// ── Render one page to base64 JPEG ────────────────────────────────
async function exRenderPage(pageNum, maxW = 1024) {
  const page     = await _ex.pdf.getPage(pageNum);
  const scale    = maxW / page.getViewport({ scale: 1 }).width;
  const viewport = page.getViewport({ scale });
  const canvas   = document.createElement('canvas');
  canvas.width   = viewport.width;
  canvas.height  = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  const dataUrl  = canvas.toDataURL('image/jpeg', 0.80);
  canvas.width = 0; canvas.height = 0; // free GPU memory
  return dataUrl;
}

// ── GPT-4o-mini Vision: 3 pages per call ─────────────────────────
async function exCallVisionBatch(pageItems) {
  // pageItems: [{pageNum, dataUrl}, ...]
  const key = localStorage.getItem('api_key_openai') || '';
  if (!key) throw new Error('Chưa có OpenAI key — vào Settings.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);

  const pageNums = pageItems.map(p => p.pageNum);
  const content  = pageItems.map(({ dataUrl }) => ({
    type: 'image_url',
    image_url: { url: dataUrl, detail: 'high' }
  }));
  content.push({
    type: 'text',
    text: `You received ${pageItems.length} scanned Chinese exam pages in order.
For each page output a marker then the extracted text, exactly like:
[PAGE ${pageNums.join(']\n...\n[PAGE ')}]
...

Rules:
- Preserve Traditional Chinese (繁體中文) characters exactly
- Keep headers like "Unit 1", "一、對話聽力", "A. 測驗練習" exactly as written
- Keep question numbers and choice labels A B C D
- No translation, no commentary — extracted text only`
  });

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    signal: controller.signal,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 4096,
      temperature: 0,
      messages: [{ role: 'user', content }]
    })
  });
  clearTimeout(timer);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  const output  = data.choices?.[0]?.message?.content || '';
  const results = {};
  pageNums.forEach((pn, idx) => {
    const next    = pageNums[idx + 1];
    const pattern = next
      ? new RegExp(`\\[PAGE ${pn}\\]([\\s\\S]*?)(?=\\[PAGE ${next}\\])`)
      : new RegExp(`\\[PAGE ${pn}\\]([\\s\\S]*?)$`);
    const m = output.match(pattern);
    results[pn] = m ? m[1].trim() : '';
  });
  return results;
}

// ── Start OCR ─────────────────────────────────────────────────────
async function exStartOCR() {
  const btn      = document.getElementById('ex-start-ocr-btn');
  const progEl   = document.getElementById('ex-ocr-progress');
  const barEl    = document.getElementById('ex-ocr-bar');
  const labelEl  = document.getElementById('ex-ocr-label');
  const pctEl    = document.getElementById('ex-ocr-pct');
  const detailEl = document.getElementById('ex-ocr-detail');
  const msgEl    = document.getElementById('ex-ocr-msg');

  btn.disabled = true;
  progEl.style.display = '';

  const updateProg = () => {
    const pct = Math.round(_ex.ocrDone / _ex.ocrTotal * 100);
    barEl.style.width = pct + '%';
    pctEl.textContent = pct + '%';
    labelEl.textContent = `OCR: ${_ex.ocrDone} / ${_ex.ocrTotal} trang`;
  };

  // Load already-OCR'd pages from DB
  const { data: existing } = await _adminDb.client
    .from('exam_ocr_pages').select('page_num,raw_text').eq('book_id', _ex.book.id);
  (existing || []).forEach(r => {
    _ex.ocrTexts[r.page_num] = r.raw_text;
    _ex.ocrDone++;
  });
  updateProg();

  const pending = Array.from({ length: _ex.ocrTotal }, (_, i) => i + 1)
    .filter(p => !_ex.ocrTexts[p]);

  // Group pending into chunks of 3 pages per API call
  const PAGES_PER_CALL = 3;
  const PARALLEL       = 10; // 10 concurrent calls × 3 pages = 30 pages/batch
  const groups = [];
  for (let i = 0; i < pending.length; i += PAGES_PER_CALL) {
    groups.push(pending.slice(i, i + PAGES_PER_CALL));
  }

  try {
    for (let i = 0; i < groups.length; i += PARALLEL) {
      const batchGroups = groups.slice(i, i + PARALLEL);
      const first = batchGroups[0][0];
      const last  = batchGroups[batchGroups.length - 1].at(-1);
      detailEl.textContent = `Batch ${Math.ceil((i + 1) / PARALLEL)} · trang ${first}–${last}`;

      const batchResults = await Promise.all(
        batchGroups.map(async pageNums => {
          const pageItems = await Promise.all(
            pageNums.map(async pageNum => ({ pageNum, dataUrl: await exRenderPage(pageNum) }))
          );
          return exCallVisionBatch(pageItems);
        })
      );

      // Flatten {pageNum: text} maps
      const rows = [];
      for (const pageMap of batchResults) {
        for (const [pn, text] of Object.entries(pageMap)) {
          _ex.ocrTexts[parseInt(pn)] = text;
          _ex.ocrDone++;
          rows.push({ book_id: _ex.book.id, page_num: parseInt(pn), raw_text: text, ocr_status: 'done' });
        }
      }
      updateProg();
      await _adminDb.client.from('exam_ocr_pages').upsert(rows, { onConflict: 'book_id,page_num' });
    }

    await _adminDb.client.from('exam_books')
      .update({ total_pages: _ex.ocrTotal }).eq('id', _ex.book.id);

    msgEl.textContent = `✓ OCR hoàn tất ${_ex.ocrTotal} trang.`;
    msgEl.className = 's-msg ok';
    setTimeout(() => {
      exShowPanel('ex-panel-parse');
      exRenderParsePanel(_ex.ocrTotal);
    }, 1200);

  } catch (e) {
    msgEl.textContent = 'Lỗi OCR: ' + e.message;
    msgEl.className = 's-msg err';
    btn.disabled = false;
  }
}

// ── Parse Panel ────────────────────────────────────────────────────
function exRenderParsePanel(ocrPageCount) {
  document.getElementById('ex-parse-content').innerHTML = `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;font-size:13px;margin-bottom:14px">
      <i class="fa-solid fa-circle-check" style="color:#16a34a"></i>
      OCR hoàn tất · <strong>${ocrPageCount}</strong> trang đã quét
    </div>

    <!-- OCR Preview -->
    <div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;flex-wrap:wrap">
        <i class="fa-solid fa-magnifying-glass" style="color:#6b7280;font-size:12px"></i>
        <span style="font-size:13px;font-weight:600;flex:1">Xem chất lượng OCR</span>
        <button onclick="exPreviewPage(-1)" style="width:26px;height:26px;border:1px solid #e5e7eb;border-radius:5px;background:#fff;cursor:pointer;font-size:13px">‹</button>
        <span style="font-size:12px;color:#6b7280">Trang</span>
        <input id="ex-preview-page" type="number" min="1" max="${ocrPageCount}" value="1"
               oninput="exPreviewPage(0)"
               style="width:54px;height:26px;border:1px solid #e5e7eb;border-radius:5px;text-align:center;font-size:12px;padding:0 4px">
        <span style="font-size:12px;color:#6b7280">/ ${ocrPageCount}</span>
        <button onclick="exPreviewPage(1)" style="width:26px;height:26px;border:1px solid #e5e7eb;border-radius:5px;background:#fff;cursor:pointer;font-size:13px">›</button>
        <button onclick="exCopyPage()" title="Copy text trang này"
          style="height:26px;padding:0 8px;border:1px solid #e5e7eb;border-radius:5px;background:#fff;cursor:pointer;font-size:11px;color:#374151">
          <i class="fa-solid fa-copy"></i> Copy
        </button>
        <button onclick="exShowBoundaries()" title="Xem ranh giới Unit được phát hiện"
          style="height:26px;padding:0 8px;border:1px solid #7c3aed;border-radius:5px;background:#f5f3ff;cursor:pointer;font-size:11px;color:#7c3aed;white-space:nowrap">
          <i class="fa-solid fa-sitemap"></i> Ranh giới Unit
        </button>
      </div>
      <textarea id="ex-preview-text" readonly
        style="width:100%;height:220px;border:none;padding:10px 12px;font-family:'JetBrains Mono',monospace;font-size:11.5px;line-height:1.7;resize:vertical;outline:none;color:#374151;background:#fff"
        placeholder="Chọn trang để xem text OCR…"></textarea>
      <div id="ex-boundary-result" style="display:none;border-top:1px solid #e5e7eb;padding:10px 12px;font-size:12px;background:#fafafa;max-height:180px;overflow-y:auto"></div>
    </div>

    <div style="font-size:13px;color:#4b5563;margin-bottom:14px">
      AI sẽ tự tìm header <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px">Unit X</code> trong text,
      chia thành các chunk và phân tích <strong>song song</strong> — Section A (câu hỏi) + Section B (từ vựng).
    </div>
    <div id="ex-parse-progress" style="display:none;margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
        <span id="ex-parse-label">Đang phân tích…</span>
        <span id="ex-parse-pct" style="font-weight:700;color:#7c3aed">0%</span>
      </div>
      <div style="background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden">
        <div id="ex-parse-bar" style="height:100%;background:linear-gradient(90deg,#7c3aed,#a78bfa);border-radius:999px;width:0%;transition:width .4s"></div>
      </div>
      <div id="ex-parse-chips" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:10px"></div>
    </div>
    <div id="ex-parse-msg" class="s-msg"></div>
    <button id="ex-start-parse-btn" class="s-btn" onclick="exStartParse()" style="width:100%;margin-top:12px">
      <i class="fa-solid fa-sparkles"></i> Phân tích tất cả Unit với AI
    </button>
  `;
  // Auto-load page 1
  exPreviewPage(0);
}

function exPreviewPage(delta) {
  const input  = document.getElementById('ex-preview-page');
  const textEl = document.getElementById('ex-preview-text');
  if (!input || !textEl) return;

  const max = parseInt(input.max) || 1;
  let   p   = parseInt(input.value) + delta;
  if (p < 1) p = 1;
  if (p > max) p = max;
  input.value = p;

  const raw = _ex.ocrTexts[p];
  if (raw) {
    textEl.value = raw;
  } else {
    // Load from DB if not in memory
    _adminDb.client.from('exam_ocr_pages')
      .select('raw_text').eq('book_id', _ex.book.id).eq('page_num', p).single()
      .then(({ data }) => {
        if (data) {
          _ex.ocrTexts[p] = data.raw_text;
          textEl.value = data.raw_text || '(Trang trống)';
        } else {
          textEl.value = '(Không có dữ liệu OCR cho trang này)';
        }
      });
    textEl.value = 'Đang tải…';
  }
}

function exCopyPage() {
  const textEl = document.getElementById('ex-preview-text');
  if (!textEl?.value) return;
  navigator.clipboard.writeText(textEl.value).then(() => {
    const btn = document.querySelector('[onclick="exCopyPage()"]');
    if (btn) { btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied'; setTimeout(() => { btn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy'; }, 1500); }
  });
}

async function exShowBoundaries() {
  const resultEl = document.getElementById('ex-boundary-result');
  if (!resultEl) return;

  // Toggle off
  if (resultEl.style.display !== 'none') { resultEl.style.display = 'none'; return; }

  resultEl.style.display = '';
  resultEl.innerHTML = '<span style="color:#9ca3af">Đang phân tích…</span>';

  // Load all OCR texts from DB if not in memory
  const missing = [];
  const totalPages = parseInt(document.getElementById('ex-preview-page')?.max) || 0;
  for (let p = 1; p <= totalPages; p++) {
    if (!_ex.ocrTexts[p]) missing.push(p);
  }
  if (missing.length) {
    const { data } = await _adminDb.client.from('exam_ocr_pages')
      .select('page_num,raw_text').eq('book_id', _ex.book.id).in('page_num', missing);
    (data || []).forEach(r => { _ex.ocrTexts[r.page_num] = r.raw_text; });
  }

  const bounds = exDetectUnitBoundaries(totalPages);
  if (!bounds.length) {
    resultEl.innerHTML = '<span style="color:#dc2626">Không tìm thấy "Unit X" ở đầu dòng nào. Thử xem một vài trang để kiểm tra format.</span>';
    return;
  }

  const rows = bounds.map((b, i) => {
    const endPage = i + 1 < bounds.length ? bounds[i + 1].startPage - 1 : totalPages;
    const pages   = endPage - b.startPage + 1;
    // Show first line of the unit page as context
    const preview = (_ex.ocrTexts[b.startPage] || '').split('\n').find(l => l.trim()) || '';
    return `<tr>
      <td style="padding:3px 8px;font-weight:700;color:#1a56db;white-space:nowrap">Unit ${b.unitNum}</td>
      <td style="padding:3px 8px;color:#6b7280;white-space:nowrap">trang ${b.startPage}–${endPage} (${pages} tr.)</td>
      <td style="padding:3px 8px;color:#374151;font-family:'JetBrains Mono',monospace;font-size:10.5px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(preview.slice(0, 80))}</td>
      <td style="padding:3px 8px"><button onclick="document.getElementById('ex-preview-page').value=${b.startPage};exPreviewPage(0)" style="font-size:10px;padding:2px 7px;border:1px solid #e5e7eb;border-radius:4px;cursor:pointer;background:#fff">Xem</button></td>
    </tr>`;
  }).join('');

  resultEl.innerHTML = `
    <div style="font-weight:600;margin-bottom:6px;color:#374151">Phát hiện ${bounds.length} Unit:</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">${rows}</table>
  `;
}

// ── Detect Unit boundaries ────────────────────────────────────────
function exDetectUnitBoundaries(totalPages) {
  const maxUnit = parseInt(document.getElementById('ex-total-units')?.value) || 50;
  const seen    = new Set();
  const bounds  = [];

  for (let p = 1; p <= totalPages; p++) {
    const text = _ex.ocrTexts[p] || '';
    // Require "Unit N" at start of a line (avoids matching mid-sentence numbers)
    // Only accept 1–2 digit numbers within the book's unit count
    const m = text.match(/(?:^|\n)\s*Unit\s*(\d{1,2})\b/i);
    if (m) {
      const n = parseInt(m[1]);
      if (n >= 1 && n <= maxUnit && !seen.has(n)) {
        seen.add(n);
        bounds.push({ unitNum: n, startPage: p });
      }
    }
  }
  return bounds.sort((a, b) => a.unitNum - b.unitNum);
}

// ── GPT-4o parse one unit ─────────────────────────────────────────
async function exCallAIParse(unitText, unitNum) {
  const key = localStorage.getItem('api_key_openai') || '';
  if (!key) throw new Error('Chưa có OpenAI key');

  const SYSTEM = `You are a TOCFL Chinese exam content extractor. Extract structured content for Unit ${unitNum} from OCR text of a scanned Chinese workbook.

Section A (測驗練習) has subsections:
1. 一、對話聽力 (listening MCQ — question text is empty "")
2. 二、完成句子 (sentence completion MCQ with blank ___)
3. 三、選詞填空 (passage with numbered blanks, sub-passages labeled (一)(二)...)
4. 四、材料閱讀 (reading material like 名片/表格 + MCQ questions)
5. 五、短文閱讀 (short reading passage + MCQ questions)

Section B (關鍵詞語) has:
- 一、主題相關詞語 (topic vocab table: source section → related words)
- 二、常用詞組 (phrase table: source → phrase → example sentence)

RULES:
- Extract ALL questions with all 4 choices A/B/C/D
- Correct answers are NOT visible in scan — always set "answer": null
- Use Traditional Chinese (繁體中文) exactly as OCR gives
- For Section 3 fill-blank: include the full passage text

Return ONLY valid JSON, no markdown:
{
  "unit_number": ${unitNum},
  "title_zh": "Chinese title",
  "sections": [
    {
      "section_number": 1,
      "type": "listening",
      "title": "一、對話聽力",
      "passages": [],
      "questions": [{"q_num":1,"text":"","passage_label":null,"choices":{"A":"...","B":"...","C":"...","D":"..."},"answer":null}]
    }
  ],
  "vocab": [{"source":"一、對話聽力1","word":"天堂","related":"付稅、流行"}],
  "phrases": [{"source":"一、對話聽力3","phrase":"付稅","example_zh":"進口貨的價錢..."}]
}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 4096,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `OCR text for Unit ${unitNum}:\n\n${unitText.slice(0, 14000)}` }
      ]
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return JSON.parse(data.choices[0].message.content);
}

// ── Save parsed unit to DB ────────────────────────────────────────
async function exSaveUnitData(parsed) {
  const { data: unit, error: uErr } = await _adminDb.client
    .from('exam_units')
    .upsert(
      { book_id: _ex.book.id, unit_number: parsed.unit_number, title_zh: parsed.title_zh, status: 'draft' },
      { onConflict: 'book_id,unit_number' }
    )
    .select().single();
  if (uErr) throw uErr;

  // Clear and re-insert sections (handles re-parse)
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
        .insert({
          section_id: section.id, passage_id: passId,
          question_number: q.q_num, question_text: q.text || '',
          correct_answer: q.answer || null
        })
        .select().single();

      const choiceRows = Object.entries(q.choices || {}).map(([label, text]) => ({
        question_id: question.id, label, text
      }));
      if (choiceRows.length) await _adminDb.client.from('exam_choices').insert(choiceRows);
    }
  }

  // Section B vocab
  await _adminDb.client.from('exam_vocab').delete().eq('unit_id', unit.id);
  if (parsed.vocab?.length) {
    await _adminDb.client.from('exam_vocab').insert(
      parsed.vocab.map(v => ({ unit_id: unit.id, source_section: v.source, word_zh: v.word, related_words: v.related }))
    );
  }

  // Section B phrases
  await _adminDb.client.from('exam_phrases').delete().eq('unit_id', unit.id);
  if (parsed.phrases?.length) {
    await _adminDb.client.from('exam_phrases').insert(
      parsed.phrases.map(p => ({ unit_id: unit.id, source_section: p.source, phrase_zh: p.phrase, example_zh: p.example_zh }))
    );
  }
}

// ── Start AI Parse ─────────────────────────────────────────────────
async function exStartParse() {
  const btn      = document.getElementById('ex-start-parse-btn');
  const progEl   = document.getElementById('ex-parse-progress');
  const barEl    = document.getElementById('ex-parse-bar');
  const labelEl  = document.getElementById('ex-parse-label');
  const pctEl    = document.getElementById('ex-parse-pct');
  const chipsEl  = document.getElementById('ex-parse-chips');
  const msgEl    = document.getElementById('ex-parse-msg');

  btn.disabled = true;
  progEl.style.display = '';

  try {
    // Load OCR texts if not in memory (e.g. page reload)
    if (Object.keys(_ex.ocrTexts).length === 0) {
      const { data: pages } = await _adminDb.client
        .from('exam_ocr_pages').select('page_num,raw_text').eq('book_id', _ex.book.id).order('page_num');
      (pages || []).forEach(r => { _ex.ocrTexts[r.page_num] = r.raw_text; });
    }

    const totalPages = Object.keys(_ex.ocrTexts).length;
    const bounds     = exDetectUnitBoundaries(totalPages);

    if (!bounds.length) {
      msgEl.textContent = 'Không tìm thấy header "Unit X" trong OCR text. Kiểm tra chất lượng scan và thử lại.';
      msgEl.className = 's-msg err';
      btn.disabled = false;
      return;
    }

    const unitChunks = bounds.map((b, i) => {
      const endPage = i + 1 < bounds.length ? bounds[i + 1].startPage - 1 : totalPages;
      const text = Array.from({ length: endPage - b.startPage + 1 }, (_, j) =>
        _ex.ocrTexts[b.startPage + j] || ''
      ).join('\n\n');
      return { unitNum: b.unitNum, text };
    });

    _ex.parseDone = 0;
    _ex.parseTotal = unitChunks.length;
    labelEl.textContent = `Tìm thấy ${unitChunks.length} Unit. Đang phân tích song song…`;

    chipsEl.innerHTML = unitChunks.map(u =>
      `<span id="ex-chip-${u.unitNum}" style="font-size:11px;padding:3px 10px;border-radius:999px;background:#e5e7eb;color:#6b7280">U${u.unitNum}</span>`
    ).join('');

    // Pool of 8 concurrent GPT-4o calls (avoids rate limit)
    const POOL = 8;
    const failedChunks = [];
    for (let i = 0; i < unitChunks.length; i += POOL) {
      const pool = unitChunks.slice(i, i + POOL);
      const poolRes = await Promise.allSettled(
        pool.map(async ({ unitNum, text }) => {
          const parsed = await exCallAIParse(text, unitNum);
          await exSaveUnitData(parsed);
          _ex.parseDone++;
          const pct = Math.round(_ex.parseDone / _ex.parseTotal * 100);
          barEl.style.width = pct + '%';
          pctEl.textContent = pct + '%';
          labelEl.textContent = `Phân tích: ${_ex.parseDone} / ${_ex.parseTotal} Unit…`;
          const chip = document.getElementById(`ex-chip-${unitNum}`);
          if (chip) { chip.style.background = '#dcfce7'; chip.style.color = '#15803d'; chip.textContent = `U${unitNum} ✓`; }
          return unitNum;
        })
      );
      poolRes.forEach((r, j) => {
        if (r.status === 'rejected') {
          const { unitNum, text } = pool[j];
          failedChunks.push({ unitNum, text, reason: r.reason?.message || 'Lỗi không xác định' });
          const chip = document.getElementById(`ex-chip-${unitNum}`);
          if (chip) { chip.style.background = '#fee2e2'; chip.style.color = '#dc2626'; chip.title = r.reason?.message || ''; chip.textContent = `U${unitNum} ✗`; }
        }
      });
    }

    if (failedChunks.length) {
      // Store for retry
      _ex._failedChunks = failedChunks;
      const errList = failedChunks.map(f => `U${f.unitNum}: ${escHtml(f.reason)}`).join('<br>');
      msgEl.innerHTML = `<strong>${_ex.parseDone}/${_ex.parseTotal} Unit thành công · ${failedChunks.length} Unit lỗi:</strong><br>
        <div style="margin-top:6px;font-size:11px;color:#dc2626">${errList}</div>`;
      msgEl.className = 's-msg err';
      // Show retry button
      const retryBtn = document.createElement('button');
      retryBtn.className = 's-btn';
      retryBtn.style.cssText = 'width:100%;margin-top:10px;background:#dc2626';
      retryBtn.innerHTML = `<i class="fa-solid fa-rotate-right"></i> Thử lại ${failedChunks.length} Unit lỗi`;
      retryBtn.onclick = () => exRetryFailed(failedChunks);
      msgEl.after(retryBtn);
      btn.disabled = false;
    } else {
      msgEl.textContent = `✓ Phân tích hoàn tất ${_ex.parseTotal} Unit.`;
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
// ── Retry failed units ────────────────────────────────────────────
async function exRetryFailed(chunks) {
  const msgEl = document.getElementById('ex-parse-msg');
  // Remove old retry button
  msgEl.nextElementSibling?.remove();
  msgEl.textContent = `Đang thử lại ${chunks.length} Unit…`;
  msgEl.className = 's-msg info';

  const stillFailed = [];
  const POOL = 4;
  for (let i = 0; i < chunks.length; i += POOL) {
    const pool = chunks.slice(i, i + POOL);
    const res = await Promise.allSettled(
      pool.map(async ({ unitNum, text }) => {
        const parsed = await exCallAIParse(text, unitNum);
        await exSaveUnitData(parsed);
        const chip = document.getElementById(`ex-chip-${unitNum}`);
        if (chip) { chip.style.background = '#dcfce7'; chip.style.color = '#15803d'; chip.textContent = `U${unitNum} ✓`; }
        return unitNum;
      })
    );
    res.forEach((r, j) => {
      if (r.status === 'rejected') stillFailed.push({ ...pool[j], reason: r.reason?.message || '?' });
    });
  }

  if (stillFailed.length) {
    msgEl.innerHTML = `Vẫn còn ${stillFailed.length} Unit lỗi: ${stillFailed.map(f => `U${f.unitNum}`).join(', ')}`;
    msgEl.className = 's-msg err';
    const retryBtn = document.createElement('button');
    retryBtn.className = 's-btn';
    retryBtn.style.cssText = 'width:100%;margin-top:10px;background:#dc2626';
    retryBtn.innerHTML = `<i class="fa-solid fa-rotate-right"></i> Thử lại lần nữa`;
    retryBtn.onclick = () => exRetryFailed(stillFailed);
    msgEl.after(retryBtn);
  } else {
    msgEl.textContent = '✓ Tất cả Unit đã phân tích xong.';
    msgEl.className = 's-msg ok';
    setTimeout(() => {
      exShowPanel('ex-panel-units');
      document.getElementById('ex-units-title').textContent = _ex.book.title;
      exLoadUnits(_ex.book.id);
    }, 1000);
  }
}

async function exLoadUnits(bookId) {
  const { data: units } = await _adminDb.client
    .from('exam_units').select('id,unit_number,title_zh,status')
    .eq('book_id', bookId).order('unit_number');

  const el = document.getElementById('ex-units-list');
  if (!units?.length) {
    el.innerHTML = '<p style="color:#9ca3af;font-size:13px;text-align:center;padding:24px">Chưa có Unit nào — chạy AI Parse trước.</p>';
    return;
  }

  const noAnswer = units.filter(u => u.status !== 'published').length;
  el.innerHTML = `
    ${noAnswer > 0 ? `<div style="background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:9px 14px;font-size:12px;color:#a16207;margin-bottom:12px">
      <i class="fa-solid fa-triangle-exclamation"></i>
      Nhớ nhập đáp án đúng (A/B/C/D) cho từng câu — AI không biết đáp án từ phía đề thi.
    </div>` : ''}
    ${units.map(u => `
    <div style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;background:#f9fafb"
           onclick="exToggleUnit(${u.id}, this)">
        <span style="font-family:'Noto Serif TC',serif;font-size:17px;font-weight:700;color:#1a56db;min-width:30px">U${u.unit_number}</span>
        <div style="flex:1">
          <div style="font-weight:600;font-size:13px">${escHtml(u.title_zh || '—')}</div>
        </div>
        <span style="font-size:11px;padding:2px 10px;border-radius:999px;
               background:${u.status === 'published' ? '#dcfce7' : '#fef9c3'};
               color:${u.status === 'published' ? '#15803d' : '#a16207'}">
          ${u.status === 'published' ? 'Đã xuất bản' : 'Bản nháp'}
        </span>
        <button onclick="event.stopPropagation();exPublishUnit(${u.id}, '${u.status}')"
                class="s-btn" style="padding:3px 10px;font-size:11px;background:${u.status === 'published' ? '#6b7280' : '#1a56db'}">
          ${u.status === 'published' ? 'Bỏ XB' : 'Xuất bản'}
        </button>
        <i class="fa-solid fa-chevron-down" id="ex-chev-${u.id}" style="font-size:10px;color:#9ca3af;transition:.2s;margin-left:4px"></i>
      </div>
      <div id="ex-unit-body-${u.id}" style="display:none"></div>
    </div>`).join('')}
  `;
}

async function exToggleUnit(unitId, headerEl) {
  const body  = document.getElementById(`ex-unit-body-${unitId}`);
  const chev  = document.getElementById(`ex-chev-${unitId}`);
  if (body.style.display !== 'none') {
    body.style.display = 'none';
    chev.style.transform = '';
    return;
  }
  chev.style.transform = 'rotate(180deg)';
  body.style.display = '';
  body.innerHTML = '<div style="padding:12px 14px;color:#9ca3af;font-size:13px">Đang tải…</div>';

  const { data: sections } = await _adminDb.client
    .from('exam_sections').select('id,section_number,section_type,title')
    .eq('unit_id', unitId).order('section_number');

  const sectionIds = (sections || []).map(s => s.id);
  const { data: questions } = await _adminDb.client
    .from('exam_questions').select('id,section_id,question_number,question_text,correct_answer')
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

  // Section A
  if (sections?.length) {
    html += '<div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.06em;margin:12px 0 8px;text-transform:uppercase">A · 測驗練習</div>';
    for (const sec of sections) {
      const qs = qsBySection[sec.id] || [];
      const unanswered = qs.filter(q => !q.correct_answer).length;
      html += `<div style="margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">
          ${escHtml(sec.title || sec.section_type)}
          <span style="font-weight:400;color:#9ca3af">${qs.length} câu</span>
          ${unanswered > 0 ? `<span style="font-size:11px;color:#dc2626;background:#fef2f2;padding:1px 8px;border-radius:999px">${unanswered} chưa có đáp án</span>` : ''}
        </div>
        ${qs.map(q => exQRow(q, choicesByQ[q.id] || {})).join('')}
      </div>`;
    }
  }

  // Section B
  if (vocab?.length || phrases?.length) {
    html += '<div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.06em;margin:16px 0 8px;text-transform:uppercase">B · 關鍵詞語</div>';
    if (vocab?.length) {
      html += `<div style="margin-bottom:12px">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px">一、主題相關詞語</div>
        <table style="width:100%;font-size:12px;border-collapse:collapse">
          <thead><tr style="background:#f3f4f6">
            <th style="padding:5px 10px;text-align:left;border:1px solid #e5e7eb;white-space:nowrap">Xuất xứ</th>
            <th style="padding:5px 10px;text-align:left;border:1px solid #e5e7eb">Từ</th>
            <th style="padding:5px 10px;text-align:left;border:1px solid #e5e7eb">Từ liên quan</th>
          </tr></thead>
          <tbody>${vocab.map(v => `<tr>
            <td style="padding:5px 10px;border:1px solid #e5e7eb;color:#6b7280;font-size:11px">${escHtml(v.source_section || '')}</td>
            <td style="padding:5px 10px;border:1px solid #e5e7eb;font-family:'Noto Serif TC',serif">${escHtml(v.word_zh || '')}</td>
            <td style="padding:5px 10px;border:1px solid #e5e7eb">${escHtml(v.related_words || '')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
    }
    if (phrases?.length) {
      html += `<div>
        <div style="font-size:13px;font-weight:600;margin-bottom:6px">二、常用詞組</div>
        <table style="width:100%;font-size:12px;border-collapse:collapse">
          <thead><tr style="background:#f3f4f6">
            <th style="padding:5px 10px;text-align:left;border:1px solid #e5e7eb;white-space:nowrap">Xuất xứ</th>
            <th style="padding:5px 10px;text-align:left;border:1px solid #e5e7eb">Cụm từ</th>
            <th style="padding:5px 10px;text-align:left;border:1px solid #e5e7eb">Ví dụ</th>
          </tr></thead>
          <tbody>${phrases.map(p => `<tr>
            <td style="padding:5px 10px;border:1px solid #e5e7eb;color:#6b7280;font-size:11px">${escHtml(p.source_section || '')}</td>
            <td style="padding:5px 10px;border:1px solid #e5e7eb;font-family:'Noto Serif TC',serif">${escHtml(p.phrase_zh || '')}</td>
            <td style="padding:5px 10px;border:1px solid #e5e7eb">${escHtml(p.example_zh || '')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
    }
  }

  html += '</div>';
  body.innerHTML = html;
}

// ── Question row ───────────────────────────────────────────────────
function exQRow(q, choices) {
  const ABCD = ['A', 'B', 'C', 'D'];
  return `<div id="ex-q-${q.id}" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:9px 12px;margin-bottom:5px;font-size:12px">
    <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px">
      <span style="font-weight:700;color:#1a56db;min-width:26px">Q${q.question_number}</span>
      <span style="color:#374151;flex:1">${escHtml(q.question_text || '(Nghe)')}</span>
      <span onclick="exEditQ(${q.id})" style="cursor:pointer;color:#6b7280;font-size:11px;white-space:nowrap"><i class="fa-solid fa-pen-to-square"></i> Sửa</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-bottom:7px">
      ${ABCD.map(l => {
        const c = choices[l];
        const ok = q.correct_answer === l;
        return `<div style="padding:3px 8px;border-radius:4px;background:${ok ? '#dcfce7' : '#fff'};border:1px solid ${ok ? '#16a34a' : '#e5e7eb'}">
          <span style="font-weight:700;color:${ok ? '#15803d' : '#9ca3af'};margin-right:5px">${l}</span>
          <span style="color:#374151">${escHtml(c?.text || '—')}</span>
        </div>`;
      }).join('')}
    </div>
    <div style="display:flex;align-items:center;gap:5px">
      <span style="font-size:11px;color:#6b7280;margin-right:2px">Đáp án:</span>
      ${ABCD.map(l => `<button onclick="exSetAnswer(${q.id},'${l}')"
        style="width:26px;height:26px;border-radius:5px;cursor:pointer;font-weight:700;font-size:11px;
               border:1.5px solid ${q.correct_answer === l ? '#1a56db' : '#e5e7eb'};
               background:${q.correct_answer === l ? '#1a56db' : '#fff'};
               color:${q.correct_answer === l ? '#fff' : '#374151'}">${l}</button>`).join('')}
    </div>
  </div>`;
}

// ── Set answer ─────────────────────────────────────────────────────
async function exSetAnswer(qId, answer) {
  await _adminDb.client.from('exam_questions').update({ correct_answer: answer }).eq('id', qId);
  const [{ data: q }, { data: choicesArr }] = await Promise.all([
    _adminDb.client.from('exam_questions').select('*').eq('id', qId).single(),
    _adminDb.client.from('exam_choices').select('*').eq('question_id', qId),
  ]);
  const choices = {};
  (choicesArr || []).forEach(c => { choices[c.label] = c; });
  const el = document.getElementById(`ex-q-${qId}`);
  if (el) el.outerHTML = exQRow(q, choices);
}

// ── Edit question inline ───────────────────────────────────────────
async function exEditQ(qId) {
  const [{ data: q }, { data: choicesArr }] = await Promise.all([
    _adminDb.client.from('exam_questions').select('*').eq('id', qId).single(),
    _adminDb.client.from('exam_choices').select('*').eq('question_id', qId).order('label'),
  ]);
  const choices = {};
  (choicesArr || []).forEach(c => { choices[c.label] = c; });

  const el = document.getElementById(`ex-q-${qId}`);
  if (!el) return;
  el.innerHTML = `
    <div style="font-weight:600;font-size:12px;margin-bottom:6px;color:#1a56db">Q${q.question_number} — Chỉnh sửa</div>
    <div style="font-size:11px;color:#6b7280;margin-bottom:3px">Nội dung câu hỏi</div>
    <textarea id="eq-text-${qId}" style="width:100%;height:44px;font-size:12px;border:1px solid #e5e7eb;border-radius:6px;padding:6px;resize:vertical;margin-bottom:8px">${escHtml(q.question_text || '')}</textarea>
    ${['A','B','C','D'].map(l => `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="font-weight:700;min-width:16px;color:#6b7280">${l}</span>
        <input id="eq-c-${qId}-${l}" class="s-input" value="${escHtml(choices[l]?.text || '')}" style="flex:1;padding:4px 8px;font-size:12px">
      </div>`).join('')}
    <div style="display:flex;gap:6px;margin-top:8px">
      <button class="s-btn" onclick="exSaveQ(${qId})" style="padding:4px 14px;font-size:12px">Lưu</button>
      <button class="s-btn" onclick="exCancelQ(${qId})" style="padding:4px 14px;font-size:12px;background:#6b7280">Hủy</button>
    </div>
  `;
}

async function exSaveQ(qId) {
  const text = document.getElementById(`eq-text-${qId}`)?.value.trim() || '';
  await _adminDb.client.from('exam_questions').update({ question_text: text }).eq('id', qId);
  for (const l of ['A','B','C','D']) {
    const val = document.getElementById(`eq-c-${qId}-${l}`)?.value.trim() || '';
    await _adminDb.client.from('exam_choices').update({ text: val }).match({ question_id: qId, label: l });
  }
  exCancelQ(qId);
}

async function exCancelQ(qId) {
  const [{ data: q }, { data: choicesArr }] = await Promise.all([
    _adminDb.client.from('exam_questions').select('*').eq('id', qId).single(),
    _adminDb.client.from('exam_choices').select('*').eq('question_id', qId),
  ]);
  const choices = {};
  (choicesArr || []).forEach(c => { choices[c.label] = c; });
  const el = document.getElementById(`ex-q-${qId}`);
  if (el) el.outerHTML = exQRow(q, choices);
}

// ── Publish ────────────────────────────────────────────────────────
async function exPublishUnit(unitId, currentStatus) {
  const next = currentStatus === 'published' ? 'draft' : 'published';
  await _adminDb.client.from('exam_units').update({ status: next }).eq('id', unitId);
  exLoadUnits(_ex.book.id);
}
