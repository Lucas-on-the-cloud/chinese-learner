// ── State ──────────────────────────────────────────────────────────
const _ex = {
  book: null,   // selected exam_books row
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
    const pub    = b.status === 'published';
    return `<div onclick="exSelectBook(${b.id})"
      style="padding:10px 12px;border-radius:8px;cursor:pointer;margin-bottom:4px;
             border:1.5px solid ${active ? '#1a56db' : '#e5e7eb'};
             background:${active ? '#eff6ff' : '#fff'};position:relative">
      <button onclick="event.stopPropagation();exQuickDeleteBook(${b.id})"
        title="Xóa" style="position:absolute;top:6px;right:6px;background:none;border:none;
               cursor:pointer;color:#d1d5db;font-size:13px;line-height:1;padding:2px 4px;border-radius:4px"
        onmouseover="this.style.color='#dc2626'" onmouseout="this.style.color='#d1d5db'">✕</button>
      <div style="font-weight:600;font-size:13px;padding-right:18px">${escHtml(b.title)}</div>
      <div style="display:flex;gap:6px;margin-top:6px;align-items:center;flex-wrap:wrap">
        ${b.level ? `<span style="font-size:11px;background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:999px">${b.level}</span>` : ''}
        <span style="font-size:11px;color:#6b7280">${b.total_units || 30} units</span>
        ${!pub ? `<button onclick="event.stopPropagation();exPublishBook(${b.id})"
            style="font-size:10px;background:#1a56db;color:#fff;border:none;border-radius:5px;
                   padding:2px 9px;cursor:pointer;margin-left:auto">
            ▶ Xuất bản
          </button>` : `<span style="font-size:11px;padding:2px 8px;border-radius:999px;margin-left:auto;
               background:#f0fdf4;color:#15803d">✓ Đã xuất bản</span>`}
      </div>
    </div>`;
  }).join('');
}

async function exQuickDeleteBook(bookId) {
  if (!confirm('Xóa bộ đề này? Tất cả unit, câu hỏi, đoạn đọc sẽ bị xóa vĩnh viễn.')) return;

  // Delete child tables that may lack CASCADE (OCR-era records)
  await Promise.all([
    _adminDb.client.from('exam_jobs').delete().eq('book_id', bookId),
    _adminDb.client.from('exam_doc_ai_pages').delete().eq('book_id', bookId),
    _adminDb.client.from('exam_ocr_pages').delete().eq('book_id', bookId),
  ]);

  // Now delete the book itself (remaining children cascade)
  const { error } = await _adminDb.client.from('exam_books').delete().eq('id', bookId);
  if (error) {
    alert('Lỗi xóa: ' + error.message);
    return;
  }

  if (_ex.book?.id === bookId) { _ex.book = null; exShowPanel('ex-panel-create'); }
  await loadExams();
}

async function exPublishBook(bookId) {
  await Promise.all([
    _adminDb.client.from('exam_books').update({ status: 'published' }).eq('id', bookId),
    _adminDb.client.from('exam_units').update({ status: 'published' }).eq('book_id', bookId),
  ]);
  await loadExams();
}

// ── Panel helpers ──────────────────────────────────────────────────
function exShowPanel(id) {
  ['ex-panel-create', 'ex-panel-units', 'ex-panel-markdown']
    .forEach(p => { document.getElementById(p).style.display = p === id ? '' : 'none'; });
}

function exShowCreate() {
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
  exShowPanel('ex-panel-markdown');
}

async function exSelectBook(bookId) {
  const { data } = await _adminDb.client.from('exam_books').select('*').eq('id', bookId).single();
  _ex.book = data;
  await loadExams();

  const { count: unitCount } = await _adminDb.client
    .from('exam_units').select('*', { count: 'exact', head: true }).eq('book_id', bookId);

  if (unitCount > 0) {
    exShowPanel('ex-panel-units');
    document.getElementById('ex-units-title').textContent = data.title;
    exLoadUnits(bookId);
  } else {
    exShowPanel('ex-panel-markdown');
  }
}

async function exDeleteBook() {
  if (!_ex.book) return;
  if (!confirm(`Xóa "${_ex.book.title}"? Tất cả dữ liệu sẽ bị xóa vĩnh viễn.`)) return;
  await _adminDb.client.from('exam_books').delete().eq('id', _ex.book.id);
  _ex.book = null;
  await loadExams();
  exShowPanel('ex-panel-create');
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

async function exToggleUnit(unitId, forceReload) {
  const body = document.getElementById(`ex-unit-body-${unitId}`);
  const chev = document.getElementById(`ex-chev-${unitId}`);
  if (!forceReload && body.style.display !== 'none') {
    body.style.display = 'none'; chev.style.transform = ''; return;
  }
  chev.style.transform = 'rotate(180deg)';
  body.style.display = '';
  body.innerHTML = '<div style="padding:12px 14px;color:#9ca3af;font-size:13px">Đang tải…</div>';

  const { data: sections } = await _adminDb.client
    .from('exam_sections').select('id,section_number,section_type,title,audio_url')
    .eq('unit_id', unitId).order('section_number');

  const sectionIds = (sections || []).map(s => s.id);

  const [{ data: questions }, { data: passagesArr }] = await Promise.all([
    _adminDb.client.from('exam_questions')
      .select('id,section_id,passage_id,question_number,question_text,correct_answer,flag_warnings')
      .in('section_id', sectionIds).order('question_number'),
    sectionIds.length
      ? _adminDb.client.from('exam_passages')
          .select('id,section_id,label,content_text,sort_order,image_url')
          .in('section_id', sectionIds)
          .order('sort_order').order('id')
      : { data: [] },
  ]);

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
  const passagesBySection = {};
  (passagesArr || []).forEach(p => {
    if (!passagesBySection[p.section_id]) passagesBySection[p.section_id] = [];
    passagesBySection[p.section_id].push(p);
  });

  let html = '<div style="padding:0 14px 16px">';
  if (sections?.length) {
    html += '<div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.06em;margin:12px 0 8px;text-transform:uppercase">A · 測驗練習</div>';
    for (const sec of sections) {
      const qs           = qsBySection[sec.id] || [];
      const passes       = passagesBySection[sec.id] || [];
      const hasMultiPass = passes.length > 1;
      const unanswered   = qs.filter(q => !q.correct_answer).length;
      const flagged      = qs.filter(q => q.flag_warnings?.some(f => f.level === 'red')).length;

      // Group questions by passage_id
      const qsByPass = {};
      qs.forEach(q => {
        const k = q.passage_id != null ? String(q.passage_id) : '__none__';
        if (!qsByPass[k]) qsByPass[k] = [];
        qsByPass[k].push(q);
      });

      let secBody = '';
      passes.forEach((p, idx) => {
        secBody += exPassageBlock(p, hasMultiPass, idx, passes.length, sec.id);
        (qsByPass[String(p.id)] || []).forEach(q => {
          secBody += exQRow(q, choicesByQ[q.id] || {}, hasMultiPass);
        });
      });
      // Questions not linked to any passage
      (qsByPass['__none__'] || []).forEach(q => {
        secBody += exQRow(q, choicesByQ[q.id] || {}, hasMultiPass);
      });

      const audioRow = sec.section_type === 'listening'
        ? `<div id="ex-sec-audio-${sec.id}" style="margin-bottom:10px">${exSectionAudioBlock(sec.id, sec.audio_url)}</div>`
        : '';
      html += `<div style="margin-bottom:12px" id="ex-sec-${sec.id}">
        <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px">
          ${escHtml(sec.title || sec.section_type)}
          <span style="font-weight:400;color:#9ca3af">${qs.length} câu</span>
          ${passes.length ? `<span style="font-size:11px;color:#16a34a;background:#f0fdf4;padding:1px 8px;border-radius:999px">${passes.length} đoạn đọc</span>` : ''}
          ${unanswered ? `<span style="font-size:11px;color:#dc2626;background:#fef2f2;padding:1px 8px;border-radius:999px">${unanswered} chưa đáp án</span>` : ''}
          ${flagged ? `<span style="font-size:11px;color:#dc2626;background:#fef2f2;padding:1px 8px;border-radius:999px">⚠ ${flagged}</span>` : ''}
          <button onclick="exAddQuestionToSection(${sec.id})" style="margin-left:auto;background:#eff6ff;border:1px solid #bfdbfe;color:#1a56db;font-size:11px;padding:3px 10px;border-radius:6px;cursor:pointer">
            <i class="fa-solid fa-plus" style="font-size:9px"></i> Thêm câu hỏi
          </button>
          <button onclick="exAddPassage(${sec.id})" style="background:#f0fdf4;border:1px solid #bbf7d0;color:#16a34a;font-size:11px;padding:3px 10px;border-radius:6px;cursor:pointer">
            <i class="fa-solid fa-plus" style="font-size:9px"></i> Đoạn đọc
          </button>
          <button onclick="exDeleteSection(${sec.id},${qs.length},${passes.length})" title="Xóa cả section" style="background:#fef2f2;border:1px solid #fecaca;color:#dc2626;font-size:11px;padding:3px 10px;border-radius:6px;cursor:pointer">
            <i class="fa-solid fa-trash" style="font-size:9px"></i> Xóa
          </button>
        </div>
        ${audioRow}${secBody}
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
function exQRow(q, choices, draggable = false) {
  const ABCD  = ['A','B','C','D'];
  const flags = q.flag_warnings || [];
  const red   = flags.filter(f => f.level === 'red');
  const dragA = draggable
    ? `draggable="true"
       ondragstart="event.dataTransfer.setData('text/plain',String(${q.id}));this.style.opacity='.45'"
       ondragend="this.style.opacity=''"` : '';
  return `<div id="ex-q-${q.id}" data-draggable="${draggable}" ${dragA}
    style="background:#f9fafb;border:1px solid ${red.length?'#fca5a5':'#e5e7eb'};
    border-radius:6px;padding:9px 12px;margin-bottom:5px;font-size:12px;
    ${draggable?'cursor:grab':''}">
    ${red.length ? `<div style="font-size:11px;color:#dc2626;margin-bottom:5px">⚠ ${escHtml(red[0].message)}</div>` : ''}
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      ${draggable ? `<span style="color:#d1d5db;font-size:16px;line-height:1;cursor:grab;flex-shrink:0">⠿</span>` : ''}
      <span style="font-weight:700;color:#1a56db;min-width:26px;flex-shrink:0">Q${q.question_number}</span>
      <span style="color:#374151;flex:1;font-size:12px">${escHtml(q.question_text||'(Nghe)')}</span>
      <span onclick="exEditQ(${q.id})" style="cursor:pointer;color:#6b7280;font-size:11px;white-space:nowrap;flex-shrink:0">
        <i class="fa-solid fa-pen-to-square"></i></span>
      <span onclick="exDeleteQ(${q.id})" style="cursor:pointer;color:#dc2626;font-size:11px;white-space:nowrap;flex-shrink:0;margin-left:2px">
        <i class="fa-solid fa-trash"></i></span>
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
  if (el) el.outerHTML = exQRow(q, choices, el.dataset.draggable === 'true');
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

  const { error: qErr } = await _adminDb.client.from('exam_questions')
    .update({ question_text: text }).eq('id', qId);
  if (qErr) { alert('Lỗi câu hỏi: ' + qErr.message); return; }

  // Fetch existing choices to know which to UPDATE vs INSERT
  const { data: existing } = await _adminDb.client.from('exam_choices')
    .select('id,label').eq('question_id', qId);
  const labelToId = Object.fromEntries((existing || []).map(c => [c.label, c.id]));

  for (const l of ['A','B','C','D']) {
    const val = document.getElementById(`eq-c-${qId}-${l}`)?.value.trim()||'';
    if (labelToId[l]) {
      // UPDATE existing
      const { error } = await _adminDb.client.from('exam_choices')
        .update({ text: val }).eq('id', labelToId[l]);
      if (error) { alert(`Lỗi lựa chọn ${l}: ` + error.message); return; }
    } else if (val) {
      // INSERT new (only if user typed a value)
      const { error } = await _adminDb.client.from('exam_choices')
        .insert({ question_id: qId, label: l, text: val });
      if (error) { alert(`Lỗi tạo lựa chọn ${l}: ` + error.message); return; }
    }
  }

  await exCancelQ(qId);
}

async function exCancelQ(qId) {
  const el = document.getElementById(`ex-q-${qId}`);
  const draggable = el?.dataset.draggable === 'true';
  const [{ data: q }, { data: ca }] = await Promise.all([
    _adminDb.client.from('exam_questions').select('*').eq('id', qId).single(),
    _adminDb.client.from('exam_choices').select('*').eq('question_id', qId),
  ]);
  const choices = {}; (ca||[]).forEach(c => { choices[c.label] = c; });
  const el2 = document.getElementById(`ex-q-${qId}`);
  if (el2) el2.outerHTML = exQRow(q, choices, draggable);
}

// ── Section audio (一、對話聽力) ────────────────────────────────────
function exSectionAudioBlock(secId, audioUrl) {
  if (audioUrl) {
    return `
      <div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:8px;
                  padding:10px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <i class="fa-solid fa-headphones" style="color:#1a56db;font-size:14px;flex-shrink:0"></i>
        <audio controls src="${escHtml(audioUrl)}"
          style="flex:1;min-width:200px;height:32px;accent-color:#1a56db"></audio>
        <label style="cursor:pointer">
          <input type="file" accept="audio/*" style="display:none"
            onchange="exUploadSectionAudio(${secId},this)">
          <span class="s-btn" style="padding:4px 12px;font-size:11px;background:#1a56db;pointer-events:none">
            <i class="fa-solid fa-arrow-up-from-bracket"></i> Thay
          </span>
        </label>
        <button onclick="exDeleteSectionAudio(${secId})"
          style="background:none;border:1px solid #fca5a5;border-radius:5px;cursor:pointer;
                 font-size:11px;color:#dc2626;padding:4px 10px">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>`;
  }
  return `
    <label style="cursor:pointer;display:block">
      <input type="file" accept="audio/*" style="display:none"
        onchange="exUploadSectionAudio(${secId},this)">
      <div style="border:2px dashed #bfdbfe;border-radius:8px;padding:12px 16px;
                  display:flex;align-items:center;gap:10px;color:#1a56db;
                  background:#f0f9ff;transition:.15s"
           onmouseover="this.style.borderColor='#1a56db'"
           onmouseout="this.style.borderColor='#bfdbfe'">
        <i class="fa-solid fa-headphones" style="font-size:18px"></i>
        <div>
          <div style="font-size:12px;font-weight:600">Upload audio đoạn hội thoại</div>
          <div style="font-size:11px;color:#6b7280;margin-top:1px">MP3 · M4A · WAV · OGG</div>
        </div>
        <span class="s-btn" style="margin-left:auto;padding:4px 14px;font-size:11px;pointer-events:none">
          Chọn file
        </span>
      </div>
    </label>`;
}

async function exUploadSectionAudio(secId, input) {
  const file = input.files[0];
  if (!file) return;
  const container = document.getElementById(`ex-sec-audio-${secId}`);
  if (container) container.innerHTML =
    `<div style="font-size:12px;color:#6b7280;padding:8px 0">
       <i class="fa-solid fa-spinner fa-spin"></i> Đang upload…
     </div>`;

  const ext  = file.name.split('.').pop().toLowerCase();
  const path = `exams/${secId}_${Date.now()}.${ext}`;
  const { error: upErr } = await _adminDb.client.storage
    .from('audio').upload(path, file, { contentType: file.type, upsert: true });
  if (upErr) {
    if (container) container.innerHTML =
      `<div style="font-size:12px;color:#dc2626">Lỗi upload: ${escHtml(upErr.message)}</div>`;
    return;
  }
  const { data: pub } = _adminDb.client.storage.from('audio').getPublicUrl(path);
  const url = pub.publicUrl;
  await _adminDb.client.from('exam_sections').update({ audio_url: url }).eq('id', secId);
  if (container) container.innerHTML = exSectionAudioBlock(secId, url);
}

async function exDeleteSectionAudio(secId) {
  if (!confirm('Xóa audio này?')) return;
  await _adminDb.client.from('exam_sections').update({ audio_url: null }).eq('id', secId);
  const container = document.getElementById(`ex-sec-audio-${secId}`);
  if (container) container.innerHTML = exSectionAudioBlock(secId, null);
}

// ── Passage block renderer ─────────────────────────────────────────
function exPassageBlock(p, hasMultiPass, idx, total, sectionId) {
  const dropA = hasMultiPass
    ? `ondragover="exDragOverPass(event,this)"
       ondragleave="exDragLeavePass(event,this)"
       ondrop="exDropOnPass(event,${p.id},this)"`
    : '';
  const isFirst = idx === 0, isLast = idx === total - 1;
  const btnStyle = `background:none;border:1px solid #bbf7d0;border-radius:5px;cursor:pointer;font-size:11px;color:#16a34a;padding:2px 8px;line-height:1.6`;
  const dimStyle = `${btnStyle};opacity:.35;cursor:not-allowed`;
  return `<div id="ex-pass-${p.id}" data-pass-id="${p.id}"
    style="background:#f0fdf4;border:2px solid ${hasMultiPass?'#86efac':'#bbf7d0'};
           border-radius:8px;padding:10px 14px;margin-bottom:6px;transition:.15s" ${dropA}>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;gap:6px">
      <span style="font-size:11px;font-weight:700;color:#15803d;display:flex;align-items:center;gap:6px;flex:1;min-width:0">
        <i class="fa-solid fa-book-open-reader" style="font-size:10px"></i>
        ${p.label ? escHtml(p.label) : '📖 Đoạn đọc'} <span style="font-weight:400;color:#86efac">${idx + 1}/${total}</span>
        ${hasMultiPass ? `<span style="font-size:10px;font-weight:400;color:#86efac;
          background:#166534;padding:1px 7px;border-radius:999px">← thả câu hỏi vào đây</span>` : ''}
      </span>
      <div style="display:flex;gap:4px;flex-shrink:0">
        <button onclick="exMovePassage(${p.id},-1)" title="Lên" ${isFirst ? 'disabled' : ''}
          style="${isFirst ? dimStyle : btnStyle};padding:2px 7px"><i class="fa-solid fa-arrow-up" style="font-size:10px"></i></button>
        <button onclick="exMovePassage(${p.id},1)" title="Xuống" ${isLast ? 'disabled' : ''}
          style="${isLast ? dimStyle : btnStyle};padding:2px 7px"><i class="fa-solid fa-arrow-down" style="font-size:10px"></i></button>
        <button onclick="exAddQuestion(${p.id})" title="Thêm câu hỏi vào đoạn này"
          style="${btnStyle.replace('#bbf7d0','#bfdbfe').replace('#16a34a','#1a56db').replace('#f0fdf4','#eff6ff')}">
          <i class="fa-solid fa-plus" style="font-size:9px"></i> Câu hỏi
        </button>
        <button onclick="exEditPassage(${p.id})" title="Sửa nội dung" style="${btnStyle}">
          <i class="fa-solid fa-pen-to-square"></i> Sửa
        </button>
        <button onclick="exDeletePassage(${p.id})" title="Xóa đoạn đọc"
          style="${btnStyle.replace('#bbf7d0','#fecaca').replace('#16a34a','#dc2626')}">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
    <div id="ex-pass-text-${p.id}"
      style="white-space:pre-wrap;line-height:1.8;font-family:'Noto Serif TC',serif;
             font-size:13px;color:#166534">${escHtml(p.content_text||'')}</div>
    <div id="ex-pass-img-${p.id}" style="margin-top:8px">${exPassageImageBlock(p.id, p.image_url)}</div>
  </div>`;
}

function exPassageImageBlock(passId, imageUrl) {
  if (imageUrl) {
    return `
      <div style="background:#fff;border:1px solid #bbf7d0;border-radius:6px;padding:8px;display:flex;gap:10px;align-items:flex-start">
        <img src="${escHtml(imageUrl)}" style="max-width:240px;max-height:160px;border-radius:4px;object-fit:contain;background:#f9fafb">
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="cursor:pointer">
            <input type="file" accept="image/*" style="display:none"
              onchange="exUploadPassageImage(${passId},this)">
            <span style="background:#16a34a;color:#fff;font-size:11px;padding:3px 10px;border-radius:5px;display:inline-block">
              <i class="fa-solid fa-arrow-up-from-bracket"></i> Thay
            </span>
          </label>
          <button onclick="exDeletePassageImage(${passId})"
            style="background:none;border:1px solid #fca5a5;color:#dc2626;font-size:11px;padding:3px 10px;border-radius:5px;cursor:pointer">
            <i class="fa-solid fa-trash"></i> Xóa ảnh
          </button>
        </div>
      </div>`;
  }
  return `
    <label style="cursor:pointer;display:inline-block">
      <input type="file" accept="image/*" style="display:none"
        onchange="exUploadPassageImage(${passId},this)">
      <span style="background:#f0fdf4;border:1.5px dashed #86efac;color:#16a34a;font-size:11px;padding:5px 12px;border-radius:6px;display:inline-block">
        <i class="fa-solid fa-image"></i> + Thêm ảnh
      </span>
    </label>`;
}

async function exUploadPassageImage(passId, input) {
  const file = input.files[0];
  if (!file) return;
  const container = document.getElementById(`ex-pass-img-${passId}`);
  if (container) container.innerHTML =
    `<div style="font-size:12px;color:#6b7280;padding:6px 0">
       <i class="fa-solid fa-spinner fa-spin"></i> Đang upload…
     </div>`;

  const ext  = file.name.split('.').pop().toLowerCase();
  const path = `passages/${passId}_${Date.now()}.${ext}`;
  // Try 'images' bucket first; fall back to 'audio' if it doesn't exist.
  let bucket = 'images';
  let { error: upErr } = await _adminDb.client.storage
    .from(bucket).upload(path, file, { contentType: file.type, upsert: true });
  if (upErr && upErr.message?.toLowerCase().includes('not found')) {
    bucket = 'audio';
    ({ error: upErr } = await _adminDb.client.storage
      .from(bucket).upload(path, file, { contentType: file.type, upsert: true }));
  }
  if (upErr) {
    if (container) container.innerHTML =
      `<div style="font-size:12px;color:#dc2626">Lỗi upload: ${escHtml(upErr.message)}</div>`;
    return;
  }
  const { data: pub } = _adminDb.client.storage.from(bucket).getPublicUrl(path);
  const url = pub.publicUrl;
  const { error: uErr } = await _adminDb.client.from('exam_passages').update({ image_url: url }).eq('id', passId);
  if (uErr) {
    if (container) container.innerHTML =
      `<div style="font-size:12px;color:#dc2626">Lỗi DB: ${escHtml(uErr.message)} — chạy SQL migration 006 chưa?</div>`;
    return;
  }
  if (container) container.innerHTML = exPassageImageBlock(passId, url);
}

async function exDeletePassageImage(passId) {
  if (!confirm('Xóa ảnh đoạn đọc này?')) return;
  await _adminDb.client.from('exam_passages').update({ image_url: null }).eq('id', passId);
  const container = document.getElementById(`ex-pass-img-${passId}`);
  if (container) container.innerHTML = exPassageImageBlock(passId, null);
}

// ── Passage edit ───────────────────────────────────────────────────
async function exEditPassage(passId) {
  const container = document.getElementById(`ex-pass-${passId}`);
  const textEl    = document.getElementById(`ex-pass-text-${passId}`);
  if (!container || !textEl || container.querySelector('textarea')) return;

  const { data: p } = await _adminDb.client
    .from('exam_passages').select('content_text').eq('id', passId).single();
  const raw = p?.content_text || '';

  textEl.style.display = 'none';
  const wrap = document.createElement('div');
  wrap.id = `ex-pass-edit-${passId}`;
  wrap.innerHTML = `
    <textarea id="ex-pass-ta-${passId}"
      style="width:100%;min-height:140px;font-size:13px;line-height:1.8;
             font-family:'Noto Serif TC',serif;border:1.5px solid #86efac;
             border-radius:6px;padding:8px;resize:vertical;margin-bottom:8px;
             background:#f0fdf4;color:#166534">${escHtml(raw)}</textarea>
    <div style="display:flex;gap:6px">
      <button class="s-btn" onclick="exSavePassage(${passId})"
        style="padding:4px 16px;font-size:12px;background:#16a34a">Lưu</button>
      <button class="s-btn" onclick="exCancelPassage(${passId})"
        style="padding:4px 16px;font-size:12px;background:#6b7280">Hủy</button>
    </div>`;
  container.appendChild(wrap);
}

async function exSavePassage(passId) {
  const ta = document.getElementById(`ex-pass-ta-${passId}`);
  if (!ta) return;
  const text = ta.value;
  await _adminDb.client.from('exam_passages').update({ content_text: text }).eq('id', passId);
  const textEl = document.getElementById(`ex-pass-text-${passId}`);
  const wrap   = document.getElementById(`ex-pass-edit-${passId}`);
  if (textEl) { textEl.textContent = text; textEl.style.display = ''; }
  if (wrap)   wrap.remove();
}

function exCancelPassage(passId) {
  const textEl = document.getElementById(`ex-pass-text-${passId}`);
  const wrap   = document.getElementById(`ex-pass-edit-${passId}`);
  if (textEl) textEl.style.display = '';
  if (wrap)   wrap.remove();
}

// ── Move passage up/down within section (swap sort_order with neighbor) ────
async function exMovePassage(passId, dir) {
  // Look up this passage's section + sort_order
  const { data: cur } = await _adminDb.client.from('exam_passages')
    .select('id,section_id,sort_order').eq('id', passId).single();
  if (!cur) return;
  // Find sibling passage in same section to swap with
  const { data: siblings } = await _adminDb.client.from('exam_passages')
    .select('id,sort_order').eq('section_id', cur.section_id)
    .order('sort_order').order('id');
  const idx = siblings.findIndex(s => s.id === cur.id);
  const swap = siblings[idx + dir];
  if (!swap) return; // already at edge
  // Two-step swap (use temp value to avoid unique violations if any)
  await _adminDb.client.from('exam_passages').update({ sort_order: -1 }).eq('id', cur.id);
  await _adminDb.client.from('exam_passages').update({ sort_order: cur.sort_order }).eq('id', swap.id);
  await _adminDb.client.from('exam_passages').update({ sort_order: swap.sort_order }).eq('id', cur.id);
  // Reload current unit's panel
  if (typeof _ex?.openUnitId !== 'undefined' && _ex.openUnitId) exToggleUnit(_ex.openUnitId, true);
  else exReloadOpenUnitBody(cur.section_id);
}

// Reload the unit body containing this section (find via DOM)
async function exReloadOpenUnitBody(sectionId) {
  // Find which unit body is currently open by walking up from the section element
  const sec = document.getElementById(`ex-sec-${sectionId}`);
  if (!sec) return;
  const body = sec.closest('[id^="ex-unit-body-"]');
  if (!body) return;
  const unitId = parseInt(body.id.replace('ex-unit-body-', ''));
  if (unitId) exToggleUnit(unitId, true);
}

// ── Delete passage (and optionally its linked questions) ───────────────────
async function exDeletePassage(passId) {
  const { data: linkedQs } = await _adminDb.client.from('exam_questions')
    .select('id,question_number').eq('passage_id', passId);
  const qCount = linkedQs?.length || 0;

  let deleteQuestions = false;
  if (qCount > 0) {
    const choice = confirm(
      `Đoạn đọc này có ${qCount} câu hỏi liên kết.\n\n` +
      `OK = Xóa cả đoạn đọc + ${qCount} câu hỏi\n` +
      `Cancel = Chỉ xóa đoạn đọc, giữ câu hỏi (gỡ link)`
    );
    if (choice === null) return; // user closed dialog without choosing
    deleteQuestions = choice;
  } else {
    if (!confirm('Xóa đoạn đọc này? Không thể hoàn tác.')) return;
  }

  if (deleteQuestions && qCount > 0) {
    const qIds = linkedQs.map(q => q.id);
    await _adminDb.client.from('exam_choices').delete().in('question_id', qIds);
    await _adminDb.client.from('exam_questions').delete().in('id', qIds);
  } else if (qCount > 0) {
    // Unlink: set passage_id = null for each question
    await _adminDb.client.from('exam_questions').update({ passage_id: null }).eq('passage_id', passId);
  }
  await _adminDb.client.from('exam_passages').delete().eq('id', passId);

  // Reload unit panel
  const block = document.getElementById(`ex-pass-${passId}`);
  const body  = block?.closest('[id^="ex-unit-body-"]');
  if (body) {
    const unitId = parseInt(body.id.replace('ex-unit-body-', ''));
    if (unitId) exToggleUnit(unitId, true);
  }
}

// ── Add new sub-unit (with 5 empty sections) ──────────────────────────────
function exShowAddUnit() {
  const form = document.getElementById('ex-add-unit-form');
  if (form) form.style.display = '';
  document.getElementById('au-unit-num')?.focus();
}

function exHideAddUnit() {
  const form = document.getElementById('ex-add-unit-form');
  if (form) form.style.display = 'none';
  ['au-unit-num','au-sub-num','au-title-zh','au-subtitle-zh'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  showMsg('au-msg', '', '');
}

async function exSaveNewUnit() {
  if (!_ex.book) { showMsg('au-msg', 'Chưa chọn bộ đề.', 'err'); return; }
  const unitNum  = parseInt(document.getElementById('au-unit-num')?.value);
  const subNum   = parseInt(document.getElementById('au-sub-num')?.value);
  const titleZh  = document.getElementById('au-title-zh')?.value.trim() || '';
  const subTitle = document.getElementById('au-subtitle-zh')?.value.trim() || '';

  if (!unitNum || unitNum < 1) { showMsg('au-msg', 'Unit số không hợp lệ.', 'err'); return; }
  if (!subNum || subNum < 1)   { showMsg('au-msg', 'Sub số không hợp lệ.', 'err'); return; }
  if (!subTitle)               { showMsg('au-msg', 'Tiêu đề phụ không được trống.', 'err'); return; }

  // Check duplicate
  const { data: existing } = await _adminDb.client.from('exam_units')
    .select('id').eq('book_id', _ex.book.id)
    .eq('unit_number', unitNum).eq('sub_number', subNum).maybeSingle();
  if (existing) { showMsg('au-msg', `Unit ${unitNum}-${subNum} đã tồn tại.`, 'err'); return; }

  // Insert unit
  const { data: unit, error: uErr } = await _adminDb.client.from('exam_units').insert({
    book_id:      _ex.book.id,
    unit_number:  unitNum,
    sub_number:   subNum,
    title_zh:     titleZh || null,
    sub_title_zh: subTitle,
    status:       'published',
  }).select().single();
  if (uErr) { showMsg('au-msg', 'Lỗi tạo unit: ' + uErr.message, 'err'); return; }

  // Insert 5 default sections (一-五 matching B1/B2 format)
  const SECTIONS = [
    { section_number: 1, section_type: 'listening',  title: '一、對話聽力' },
    { section_number: 2, section_type: 'completion', title: '二、完成句子' },
    { section_number: 3, section_type: 'cloze',      title: '三、選詞填空' },
    { section_number: 4, section_type: 'reading',    title: '四、材料閱讀' },
    { section_number: 5, section_type: 'essay',      title: '五、短文閱讀' },
  ];
  await _adminDb.client.from('exam_sections').insert(
    SECTIONS.map(s => ({ ...s, unit_id: unit.id }))
  );

  showMsg('au-msg', `✓ Đã tạo Unit ${unitNum}-${subNum}.`, 'ok');
  exHideAddUnit();
  exLoadUnits(_ex.book.id);
}

// ── Add new question to a section (no passage — e.g. listening) ───────────
async function exAddQuestionToSection(sectionId) {
  const text = prompt('Nội dung câu hỏi:');
  if (text === null) return;
  if (!text.trim()) { alert('Câu hỏi không được trống.'); return; }

  const a = prompt('Lựa chọn A:', ''); if (a === null) return;
  const b = prompt('Lựa chọn B:', ''); if (b === null) return;
  const c = prompt('Lựa chọn C:', ''); if (c === null) return;
  const d = prompt('Lựa chọn D:', ''); if (d === null) return;

  const ans = prompt('Đáp án đúng (A/B/C/D):', 'A');
  if (ans === null) return;
  const answer = ans.trim().toUpperCase();
  if (!/^[A-D]$/.test(answer)) { alert('Đáp án phải là A, B, C hoặc D.'); return; }

  const { data: maxQ } = await _adminDb.client.from('exam_questions')
    .select('question_number').eq('section_id', sectionId)
    .order('question_number', { ascending: false }).limit(1);
  const nextNum = (maxQ?.[0]?.question_number || 0) + 1;

  const { data: q, error } = await _adminDb.client.from('exam_questions').insert({
    section_id:      sectionId,
    passage_id:      null,
    question_number: nextNum,
    question_text:   text.trim(),
    correct_answer:  answer,
  }).select().single();
  if (error) { alert('Lỗi: ' + error.message); return; }

  await _adminDb.client.from('exam_choices').insert([
    { question_id: q.id, label: 'A', text: a.trim() },
    { question_id: q.id, label: 'B', text: b.trim() },
    { question_id: q.id, label: 'C', text: c.trim() },
    { question_id: q.id, label: 'D', text: d.trim() },
  ]);

  // Reload unit panel
  const sec  = document.getElementById(`ex-sec-${sectionId}`);
  const body = sec?.closest('[id^="ex-unit-body-"]');
  if (body) {
    const unitId = parseInt(body.id.replace('ex-unit-body-', ''));
    if (unitId) exToggleUnit(unitId, true);
  }
}

// ── Add new question linked to a passage ──────────────────────────────────
async function exAddQuestion(passageId) {
  const { data: pass } = await _adminDb.client.from('exam_passages')
    .select('section_id').eq('id', passageId).single();
  if (!pass) return;

  const text = prompt('Nội dung câu hỏi:');
  if (text === null) return;
  if (!text.trim()) { alert('Câu hỏi không được trống.'); return; }

  const a = prompt('Lựa chọn A:', ''); if (a === null) return;
  const b = prompt('Lựa chọn B:', ''); if (b === null) return;
  const c = prompt('Lựa chọn C:', ''); if (c === null) return;
  const d = prompt('Lựa chọn D:', ''); if (d === null) return;

  const ans = prompt('Đáp án đúng (A/B/C/D):', 'A');
  if (ans === null) return;
  const answer = ans.trim().toUpperCase();
  if (!/^[A-D]$/.test(answer)) { alert('Đáp án phải là A, B, C hoặc D.'); return; }

  // Auto-increment question_number based on max in this section
  const { data: maxQ } = await _adminDb.client.from('exam_questions')
    .select('question_number').eq('section_id', pass.section_id)
    .order('question_number', { ascending: false }).limit(1);
  const nextNum = (maxQ?.[0]?.question_number || 0) + 1;

  const { data: q, error } = await _adminDb.client.from('exam_questions').insert({
    section_id:     pass.section_id,
    passage_id:     passageId,
    question_number: nextNum,
    question_text:  text.trim(),
    correct_answer: answer,
  }).select().single();
  if (error) { alert('Lỗi: ' + error.message); return; }

  await _adminDb.client.from('exam_choices').insert([
    { question_id: q.id, label: 'A', text: a.trim() },
    { question_id: q.id, label: 'B', text: b.trim() },
    { question_id: q.id, label: 'C', text: c.trim() },
    { question_id: q.id, label: 'D', text: d.trim() },
  ]);

  // Reload unit panel
  const sec  = document.getElementById(`ex-sec-${pass.section_id}`);
  const body = sec?.closest('[id^="ex-unit-body-"]');
  if (body) {
    const unitId = parseInt(body.id.replace('ex-unit-body-', ''));
    if (unitId) exToggleUnit(unitId, true);
  }
}

// ── Delete entire section (passages + questions + choices) ────────────────
async function exDeleteSection(sectionId, qCount, pCount) {
  const parts = [];
  if (pCount > 0) parts.push(`${pCount} đoạn đọc`);
  if (qCount > 0) parts.push(`${qCount} câu hỏi`);
  const summary = parts.length ? ` (gồm ${parts.join(' + ')})` : '';
  if (!confirm(`Xóa section này${summary}? Không thể hoàn tác.`)) return;

  // Cascade delete: choices → questions → passages → section
  const { data: qs } = await _adminDb.client.from('exam_questions').select('id').eq('section_id', sectionId);
  const qIds = (qs || []).map(q => q.id);
  if (qIds.length) await _adminDb.client.from('exam_choices').delete().in('question_id', qIds);
  if (qIds.length) await _adminDb.client.from('exam_questions').delete().in('id', qIds);
  await _adminDb.client.from('exam_passages').delete().eq('section_id', sectionId);
  const { error } = await _adminDb.client.from('exam_sections').delete().eq('id', sectionId);
  if (error) { alert('Lỗi: ' + error.message); return; }

  // Reload unit panel
  const sec = document.getElementById(`ex-sec-${sectionId}`);
  const body = sec?.closest('[id^="ex-unit-body-"]');
  if (body) {
    const unitId = parseInt(body.id.replace('ex-unit-body-', ''));
    if (unitId) exToggleUnit(unitId, true);
  }
}

// ── Add new passage to a section ───────────────────────────────────────────
async function exAddPassage(sectionId) {
  const label = prompt('Nhãn đoạn đọc (tuỳ chọn, ví dụ "(一)", "(二)"). Để trống nếu không cần:', '');
  if (label === null) return; // user cancelled
  const text = prompt('Nội dung đoạn đọc:');
  if (text === null) return;
  if (!text.trim() && !label.trim()) { alert('Cần ít nhất nhãn hoặc nội dung.'); return; }

  // Compute next sort_order
  const { data: existing } = await _adminDb.client.from('exam_passages')
    .select('sort_order').eq('section_id', sectionId)
    .order('sort_order', { ascending: false }).limit(1);
  const nextOrder = (existing?.[0]?.sort_order || 0) + 1;

  const { error } = await _adminDb.client.from('exam_passages').insert({
    section_id: sectionId, label: label.trim() || null,
    content_text: text.trim(), sort_order: nextOrder,
  });
  if (error) { alert('Lỗi: ' + error.message); return; }

  // Reload unit body
  const sec = document.getElementById(`ex-sec-${sectionId}`);
  const body = sec?.closest('[id^="ex-unit-body-"]');
  if (body) {
    const unitId = parseInt(body.id.replace('ex-unit-body-', ''));
    if (unitId) exToggleUnit(unitId, true);
  }
}

// ── Delete question ────────────────────────────────────────────────
async function exDeleteQ(qId) {
  if (!confirm('Xóa câu hỏi này? Không thể hoàn tác.')) return;
  await Promise.all([
    _adminDb.client.from('exam_choices').delete().eq('question_id', qId),
    _adminDb.client.from('exam_questions').delete().eq('id', qId),
  ]);
  const el = document.getElementById(`ex-q-${qId}`);
  if (el) el.remove();
}

// ── Drag-and-drop: reassign question → passage ─────────────────────
function exDragOverPass(e, el) {
  e.preventDefault();
  el.style.borderColor = '#1a56db';
  el.style.background  = '#eff6ff';
}

function exDragLeavePass(e, el) {
  el.style.borderColor = '#86efac';
  el.style.background  = '#f0fdf4';
}

async function exDropOnPass(e, passId, el) {
  e.preventDefault();
  el.style.borderColor = '#86efac';
  el.style.background  = '#f0fdf4';
  const qId = parseInt(e.dataTransfer.getData('text/plain'));
  if (!qId || isNaN(qId)) return;
  await _adminDb.client.from('exam_questions').update({ passage_id: passId }).eq('id', qId);
  const body   = el.closest('[id^="ex-unit-body-"]');
  const unitId = body ? parseInt(body.id.replace('ex-unit-body-', '')) : null;
  if (unitId) { body.style.display = 'none'; await exToggleUnit(unitId); }
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
    console.log('[MD] parsed', units.length, 'units');
    units.forEach(u => {
      (u.sections || []).forEach(s => {
        console.log(`[MD] ${u.unit_number}-${u.sub_number} §${s.section_number}(${s.type}): ${s.passages?.length||0} passages, ${s.questions?.length||0} qs`);
        (s.passages||[]).forEach((p,i) => console.log(`  passage[${i}] label="${p.label}" text="${p.text?.slice(0,60)}…"`));
      });
    });
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
      // Auto-publish book + all units so students can access immediately
      await Promise.all([
        _adminDb.client.from('exam_books').update({ status: 'published' }).eq('id', book.id),
        _adminDb.client.from('exam_units').update({ status: 'published' }).eq('book_id', book.id),
      ]);
      showMsg('md-msg', `✓ Import hoàn tất ${units.length} sub-unit — đã xuất bản.`, 'ok');
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
