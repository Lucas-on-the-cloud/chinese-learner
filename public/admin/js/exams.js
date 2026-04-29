// ── State ──────────────────────────────────────────────────────────
const _ex = {
  book:        null,   // selected exam_books row
  jobChannel:  null,   // Supabase Realtime channel
  selectedFile: null,  // File object pending upload
};

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
  ['ex-panel-create', 'ex-panel-upload', 'ex-panel-monitor', 'ex-panel-units']
    .forEach(p => { document.getElementById(p).style.display = p === id ? '' : 'none'; });
}

function exShowCreate() {
  exUnsubscribeJob();
  _ex.book = null;
  loadExams();
  exShowPanel('ex-panel-create');
}

// ── Book CRUD ──────────────────────────────────────────────────────
async function exSaveBook() {
  const title      = document.getElementById('ex-title').value.trim();
  const level      = document.getElementById('ex-level').value;
  const totalUnits = parseInt(document.getElementById('ex-total-units').value) || 30;
  if (!title) { showMsg('ex-create-msg', 'Nhập tên bộ đề.', 'err'); return; }

  // Store book info, move to upload step (book row created after PDF path is known)
  _ex.pendingBook = { title, level: level || null, total_units: totalUnits };
  exShowPanel('ex-panel-upload');
  exRenderUploadPanel();
}

async function exSelectBook(bookId) {
  exUnsubscribeJob();
  const { data } = await _adminDb.client
    .from('exam_books').select('*').eq('id', bookId).single();
  _ex.book = data;
  await loadExams();

  // Check for active or recent job
  const { data: job } = await _adminDb.client
    .from('exam_jobs')
    .select('*')
    .eq('book_id', bookId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (job && job.status !== 'done' && job.status !== 'failed') {
    exShowPanel('ex-panel-monitor');
    exRenderMonitorPanel(job);
    if (job.status === 'awaiting_review') {
      exShowPanel('ex-panel-units');
      document.getElementById('ex-units-title').textContent = data.title;
      exLoadUnits(bookId);
    } else {
      exSubscribeJob(job.id);
    }
  } else if (job?.status === 'awaiting_review') {
    exShowPanel('ex-panel-units');
    document.getElementById('ex-units-title').textContent = data.title;
    exLoadUnits(bookId);
  } else {
    exShowPanel('ex-panel-upload');
    exRenderUploadPanel();
  }
}

async function exDeleteBook() {
  if (!_ex.book) return;
  if (!confirm(`Xóa "${_ex.book.title}"? Tất cả Unit, câu hỏi và job data sẽ bị xóa.`)) return;
  exUnsubscribeJob();
  await _adminDb.client.from('exam_books').delete().eq('id', _ex.book.id);
  _ex.book = null;
  await loadExams();
  exShowPanel('ex-panel-create');
}

// ── Upload Panel ───────────────────────────────────────────────────
function exRenderUploadPanel() {
  const label = document.getElementById('ex-upload-book-label');
  if (label) label.textContent = _ex.book?.title || _ex.pendingBook?.title || '';

  document.getElementById('ex-upload-content').innerHTML = `
    <div class="s-label">File PDF (ảnh scan)</div>
    <input type="file" id="ex-pdf-input" accept=".pdf" style="display:none" onchange="exFileChange(this)">
    <div id="ex-drop-zone"
         onclick="document.getElementById('ex-pdf-input').click()"
         ondragover="event.preventDefault();this.style.borderColor='#1a56db'"
         ondragleave="this.style.borderColor='#d1d5db'"
         ondrop="exFileDrop(event)"
         style="border:2px dashed #d1d5db;border-radius:10px;padding:36px;text-align:center;cursor:pointer;
                background:#f9fafb;transition:border-color .15s">
      <i class="fa-solid fa-file-pdf" style="font-size:32px;color:#dc2626;display:block;margin-bottom:10px"></i>
      <div style="font-size:14px;font-weight:600;color:#374151">Kéo thả PDF vào đây</div>
      <div style="font-size:12px;color:#9ca3af;margin-top:4px">hoặc click để chọn · tối đa 200MB</div>
    </div>
    <div id="ex-file-info" style="display:none;margin-top:10px;background:#eff6ff;border-radius:8px;padding:10px 14px;font-size:13px"></div>
    <div id="ex-upload-progress" style="display:none;margin-top:12px">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px">
        <span id="ex-upload-label">Đang upload…</span>
        <span id="ex-upload-pct" style="font-weight:700;color:#1a56db">0%</span>
      </div>
      <div style="background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden">
        <div id="ex-upload-bar" style="height:100%;background:linear-gradient(90deg,#1a56db,#60a5fa);
             border-radius:999px;width:0%;transition:width .3s"></div>
      </div>
    </div>
    <div id="ex-upload-msg" class="s-msg" style="margin-top:10px"></div>
    <button id="ex-upload-btn" class="s-btn" onclick="exUploadPDF()"
            style="display:none;margin-top:12px;width:100%">
      <i class="fa-solid fa-cloud-arrow-up"></i> Upload &amp; bắt đầu xử lý
    </button>
  `;
}

function exFileChange(input) {
  const file = input.files[0];
  if (file) exSetFile(file);
}
function exFileDrop(e) {
  e.preventDefault();
  document.getElementById('ex-drop-zone').style.borderColor = '#d1d5db';
  const file = e.dataTransfer.files[0];
  if (file) exSetFile(file);
}
function exSetFile(file) {
  if (file.type !== 'application/pdf') {
    showMsg('ex-upload-msg', 'Chỉ chấp nhận file PDF.', 'err');
    return;
  }
  _ex.selectedFile = file;
  const sizeMB = (file.size / 1024 / 1024).toFixed(1);
  document.getElementById('ex-file-info').style.display = '';
  document.getElementById('ex-file-info').innerHTML = `
    <div style="display:flex;gap:12px;align-items:center">
      <i class="fa-solid fa-file-pdf" style="color:#dc2626;font-size:20px"></i>
      <div>
        <div style="font-weight:600">${escHtml(file.name)}</div>
        <div style="color:#6b7280;margin-top:2px">${sizeMB} MB</div>
      </div>
    </div>`;
  document.getElementById('ex-upload-btn').style.display = '';
}

async function exUploadPDF() {
  if (!_ex.selectedFile) return;
  const btn    = document.getElementById('ex-upload-btn');
  const progEl = document.getElementById('ex-upload-progress');
  const barEl  = document.getElementById('ex-upload-bar');
  const pctEl  = document.getElementById('ex-upload-pct');
  const labelEl = document.getElementById('ex-upload-label');
  const msgEl  = document.getElementById('ex-upload-msg');

  btn.disabled = true;
  progEl.style.display = '';

  try {
    // Build storage path
    const ts   = Date.now();
    const safe = _ex.selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${ts}_${safe}`;

    labelEl.textContent = 'Đang upload lên Supabase Storage…';

    // Upload to Supabase Storage with progress tracking
    const { data: uploadData, error: uploadErr } = await _adminDb.client.storage
      .from('exam-books')
      .upload(path, _ex.selectedFile, {
        cacheControl: '3600',
        upsert: false,
        onUploadProgress: (e) => {
          const pct = Math.round((e.loaded / e.total) * 100);
          barEl.style.width = pct + '%';
          pctEl.textContent = pct + '%';
        },
      });

    if (uploadErr) throw new Error(uploadErr.message);

    barEl.style.width = '100%';
    pctEl.textContent = '100%';
    labelEl.textContent = 'Upload xong. Đang tạo job xử lý…';

    // Call API to create book + trigger Inngest
    const bookInfo = _ex.pendingBook || { title: _ex.book?.title, level: _ex.book?.level, total_units: 30 };
    const res = await fetch('/api/admin/exam-books/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:           bookInfo.title,
        level:           bookInfo.level,
        total_units:     bookInfo.total_units,
        source_pdf_path: uploadData.path,
      }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'API error');

    _ex.pendingBook = null;
    _ex.selectedFile = null;

    // Reload book list and show monitor
    const { data: book } = await _adminDb.client
      .from('exam_books').select('*').eq('id', result.book_id).single();
    _ex.book = book;
    await loadExams();

    exShowPanel('ex-panel-monitor');
    const { data: job } = await _adminDb.client
      .from('exam_jobs').select('*').eq('id', result.job_id).single();
    exRenderMonitorPanel(job);
    exSubscribeJob(result.job_id);

  } catch (e) {
    msgEl.textContent = 'Lỗi: ' + e.message;
    msgEl.className = 's-msg err';
    btn.disabled = false;
  }
}

// ── Job Monitor ─────────────────────────────────────────────────────
function exRenderMonitorPanel(job) {
  const statusColor = {
    queued:          '#6b7280',
    running:         '#1a56db',
    awaiting_review: '#16a34a',
    failed:          '#dc2626',
    done:            '#16a34a',
  };
  const statusLabel = {
    queued:          'Đang chờ…',
    running:         'Đang xử lý…',
    awaiting_review: '✓ Sẵn sàng review',
    failed:          '✗ Lỗi',
    done:            '✓ Hoàn tất',
  };

  const color = statusColor[job.status] || '#6b7280';
  const pct   = job.progress_pct || 0;

  document.getElementById('ex-monitor-content').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:600;color:${color}">${statusLabel[job.status] || job.status}</div>
      <div style="font-size:12px;color:#6b7280;flex:1">${escHtml(job.progress_label || '')}</div>
      <div style="font-size:13px;font-weight:700;color:${color}">${pct}%</div>
    </div>
    <div style="background:#e5e7eb;border-radius:999px;height:10px;overflow:hidden;margin-bottom:16px">
      <div style="height:100%;background:${color === '#dc2626' ? '#dc2626' : 'linear-gradient(90deg,#1a56db,#7c3aed)'};
           border-radius:999px;width:${pct}%;transition:width .4s"></div>
    </div>

    <!-- Step timeline -->
    <div style="font-size:12px;color:#6b7280">
      ${exRenderJobSteps(job.current_step)}
    </div>

    ${job.status === 'failed' ? `
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;font-size:12px;color:#dc2626;margin-top:12px">
        <strong>Lỗi:</strong> ${escHtml(job.error_message || 'Không rõ')}
      </div>
      <button class="s-btn" onclick="exRetriggerJob(${job.id})"
              style="width:100%;margin-top:10px;background:#dc2626">
        <i class="fa-solid fa-rotate-right"></i> Chạy lại job
      </button>` : ''}

    ${job.status === 'awaiting_review' ? `
      <button class="s-btn" onclick="exGoReview()"
              style="width:100%;margin-top:12px">
        <i class="fa-solid fa-list-check"></i> Vào Review →
      </button>` : ''}
  `;
}

function exRenderJobSteps(currentStep) {
  const steps = [
    { key: 'upload_gcs',        label: 'Copy PDF → GCS' },
    { key: 'doc_ai',            label: 'Document AI OCR' },
    { key: 'detect_structure',  label: 'Phát hiện cấu trúc' },
    { key: 'extract',           label: 'Trích xuất câu hỏi (LLM)' },
    { key: 'answer_keys',       label: 'Ghép đáp án & transcript' },
    { key: 'validate',          label: 'Kiểm tra chất lượng' },
    { key: 'done',              label: 'Hoàn tất' },
  ];
  const order = steps.map(s => s.key);
  const cur   = order.indexOf(currentStep);

  return steps.map((s, i) => {
    const done    = i < cur;
    const active  = i === cur;
    const pending = i > cur;
    const icon = done ? '✓' : active ? '→' : '○';
    const color = done ? '#16a34a' : active ? '#1a56db' : '#9ca3af';
    return `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;color:${color}">
      <span style="min-width:16px;font-weight:700">${icon}</span>
      <span>${s.label}</span>
      ${active ? '<span style="font-size:10px;background:#eff6ff;color:#1a56db;padding:1px 6px;border-radius:999px;margin-left:auto">Đang chạy</span>' : ''}
    </div>`;
  }).join('');
}

function exGoReview() {
  if (!_ex.book) return;
  exShowPanel('ex-panel-units');
  document.getElementById('ex-units-title').textContent = _ex.book.title;
  exLoadUnits(_ex.book.id);
}

// ── Realtime job subscription ─────────────────────────────────────
function exSubscribeJob(jobId) {
  exUnsubscribeJob();
  _ex.jobChannel = _adminDb.client
    .channel(`job-${jobId}`)
    .on('postgres_changes', {
      event:  'UPDATE',
      schema: 'public',
      table:  'exam_jobs',
      filter: `id=eq.${jobId}`,
    }, ({ new: job }) => {
      exRenderMonitorPanel(job);
      if (job.status === 'awaiting_review') {
        exUnsubscribeJob();
      }
    })
    .subscribe();
}

function exUnsubscribeJob() {
  if (_ex.jobChannel) {
    _adminDb.client.removeChannel(_ex.jobChannel);
    _ex.jobChannel = null;
  }
}

async function exRetriggerJob(jobId) {
  const res = await fetch('/api/admin/exam-books/retrigger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId }),
  });
  if (res.ok) {
    await _adminDb.client.from('exam_jobs')
      .update({ status: 'queued', error_message: null, progress_pct: 0 })
      .eq('id', jobId);
    const { data: job } = await _adminDb.client.from('exam_jobs').select('*').eq('id', jobId).single();
    exRenderMonitorPanel(job);
    exSubscribeJob(jobId);
  }
}

// ── Unit list ──────────────────────────────────────────────────────
async function exLoadUnits(bookId) {
  const { data: units } = await _adminDb.client
    .from('exam_units').select('id,unit_number,sub_number,title_zh,sub_title_zh,status')
    .eq('book_id', bookId).order('unit_number').order('sub_number');

  const el = document.getElementById('ex-units-list');
  if (!units?.length) {
    el.innerHTML = '<p style="color:#9ca3af;font-size:13px;text-align:center;padding:24px">Chưa có Unit nào — pipeline chưa xử lý xong.</p>';
    return;
  }

  el.innerHTML = units.map(u => {
    const label = u.sub_number > 0
      ? `${u.unit_number}-${u.sub_number} ${u.sub_title_zh || u.title_zh || '—'}`
      : `U${u.unit_number} ${u.title_zh || '—'}`;
    return `
    <div style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;background:#f9fafb"
           onclick="exToggleUnit(${u.id})">
        <span style="font-family:'Noto Serif TC',serif;font-size:14px;font-weight:700;color:#1a56db;min-width:40px">
          ${u.unit_number}${u.sub_number > 0 ? '-' + u.sub_number : ''}
        </span>
        <div style="flex:1;font-weight:600;font-size:13px">${escHtml(u.sub_title_zh || u.title_zh || '—')}</div>
        <span style="font-size:11px;padding:2px 10px;border-radius:999px;
               background:${u.status === 'published' ? '#dcfce7' : '#fef9c3'};
               color:${u.status === 'published' ? '#15803d' : '#a16207'}">
          ${u.status === 'published' ? 'Đã xuất bản' : 'Bản nháp'}
        </span>
        <button onclick="event.stopPropagation();exPublishUnit(${u.id}, '${u.status}')"
                class="s-btn" style="padding:3px 10px;font-size:11px;
                background:${u.status === 'published' ? '#6b7280' : '#1a56db'}">
          ${u.status === 'published' ? 'Bỏ XB' : 'Xuất bản'}
        </button>
        <i class="fa-solid fa-chevron-down" id="ex-chev-${u.id}"
           style="font-size:10px;color:#9ca3af;transition:.2s;margin-left:4px"></i>
      </div>
      <div id="ex-unit-body-${u.id}" style="display:none"></div>
    </div>`;
  }).join('');
}

async function exToggleUnit(unitId) {
  const body = document.getElementById(`ex-unit-body-${unitId}`);
  const chev = document.getElementById(`ex-chev-${unitId}`);
  if (body.style.display !== 'none') {
    body.style.display = 'none'; chev.style.transform = ''; return;
  }
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
      const qs = qsBySection[sec.id] || [];
      const unanswered = qs.filter(q => !q.correct_answer).length;
      const flagged    = qs.filter(q => q.flag_warnings?.some(w => w.level === 'red')).length;
      html += `<div style="margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">
          ${escHtml(sec.title || sec.section_type)}
          <span style="font-weight:400;color:#9ca3af">${qs.length} câu</span>
          ${unanswered > 0 ? `<span style="font-size:11px;color:#dc2626;background:#fef2f2;padding:1px 8px;border-radius:999px">${unanswered} chưa có đáp án</span>` : ''}
          ${flagged > 0 ? `<span style="font-size:11px;color:#dc2626;background:#fef2f2;padding:1px 8px;border-radius:999px">⚠ ${flagged} lỗi</span>` : ''}
        </div>
        ${qs.map(q => exQRow(q, choicesByQ[q.id] || {})).join('')}
      </div>`;
    }
  }

  if (vocab?.length || phrases?.length) {
    html += '<div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.06em;margin:16px 0 8px;text-transform:uppercase">B · 關鍵詞語</div>';
    if (vocab?.length) {
      html += `<div style="margin-bottom:12px">
        <div style="font-size:13px;font-weight:600;margin-bottom:6px">一、主題相關詞語</div>
        <table style="width:100%;font-size:12px;border-collapse:collapse">
          <thead><tr style="background:#f3f4f6">
            <th style="padding:5px 10px;text-align:left;border:1px solid #e5e7eb">Xuất xứ</th>
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
            <th style="padding:5px 10px;text-align:left;border:1px solid #e5e7eb">Xuất xứ</th>
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
  const ABCD  = ['A', 'B', 'C', 'D'];
  const flags = q.flag_warnings || [];
  const redFlags = flags.filter(f => f.level === 'red');
  return `<div id="ex-q-${q.id}" style="background:#f9fafb;border:1px solid ${redFlags.length ? '#fca5a5' : '#e5e7eb'};
    border-radius:6px;padding:9px 12px;margin-bottom:5px;font-size:12px">
    ${redFlags.length ? `<div style="font-size:11px;color:#dc2626;margin-bottom:5px">⚠ ${escHtml(redFlags[0].message)}</div>` : ''}
    <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px">
      <span style="font-weight:700;color:#1a56db;min-width:26px">Q${q.question_number}</span>
      <span style="color:#374151;flex:1">${escHtml(q.question_text || '(Nghe)')}</span>
      <span onclick="exEditQ(${q.id})" style="cursor:pointer;color:#6b7280;font-size:11px;white-space:nowrap">
        <i class="fa-solid fa-pen-to-square"></i> Sửa</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-bottom:7px">
      ${ABCD.map(l => {
        const c = choices[l];
        const ok = q.correct_answer === l;
        return `<div style="padding:3px 8px;border-radius:4px;
          background:${ok ? '#dcfce7' : '#fff'};border:1px solid ${ok ? '#16a34a' : '#e5e7eb'}">
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
    <textarea id="eq-text-${qId}" style="width:100%;height:44px;font-size:12px;border:1px solid #e5e7eb;
      border-radius:6px;padding:6px;resize:vertical;margin-bottom:8px">${escHtml(q.question_text || '')}</textarea>
    ${['A','B','C','D'].map(l => `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="font-weight:700;min-width:16px;color:#6b7280">${l}</span>
        <input id="eq-c-${qId}-${l}" class="s-input" value="${escHtml(choices[l]?.text || '')}"
               style="flex:1;padding:4px 8px;font-size:12px">
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
