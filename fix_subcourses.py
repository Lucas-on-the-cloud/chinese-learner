import re

path = 'public/admin/js/subcourses.js'
old = open(path, encoding='utf-8').read()

start = old.find('// ── LISTENING: lesson list')
end   = old.find('\n// ── Shared lesson add toggle')

assert start > 0, "start marker not found"
assert end > 0,   "end marker not found"

new_section = '''// ── LISTENING: lesson list ────────────────────────
async function subLoadListeningLessons(bookName) {
  document.getElementById('sub-lesson-header-actions').innerHTML = `
    <button class="s-btn" onclick="subToggleAddLesson()" style="font-size:12px;padding:7px 14px">+ Th\xeam b\xe0i học</button>`;

  document.getElementById('sub-add-form-content').innerHTML = `
    <div class="s-label" style="margin-bottom:8px">Th\xeam b\xe0i học mới (Listening)</div>
    <div style="display:grid;grid-template-columns:100px 1fr;gap:10px;align-items:end">
      <div>
        <div class="s-label">B\xe0i số</div>
        <input type="number" id="sub-ls-new-num" class="s-input" placeholder="1" min="1" style="text-align:center">
      </div>
      <div>
        <div class="s-label">T\xean / Chủ đề b\xe0i học</div>
        <input type="text" id="sub-new-title" class="s-input" placeholder="VD: Giới thiệu bản th\xe2n, Mua sắm…">
      </div>
    </div>
    <div style="font-size:11px;color:#9ca3af;margin-top:6px">V\xed dụ: B\xe0i 1 — Giới thiệu bản th\xe2n</div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="s-btn" onclick="subSaveNewListeningLesson()" style="flex:1">💾 Tạo b\xe0i học</button>
      <button class="s-btn" onclick="subToggleAddLesson()" style="background:#6b7280">Hủy</button>
    </div>`;

  const el = document.getElementById('sub-lesson-list');
  el.innerHTML = '<p style="color:#9ca3af;padding:1rem;font-size:13px">Đang tải…</p>';

  const [{ data: lessons }, { data: segs }] = await Promise.all([
    _adminDb.client.from('lessons').select('id,title,book').eq('book', bookName).order('id'),
    _adminDb.client.from('audio_segments').select('*').eq('book_name', bookName).order('sort_order').order('id'),
  ]);

  if (!lessons?.length) {
    el.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:2rem;font-size:13px">Chưa c\xf3 b\xe0i học n\xe0o. Bấm "+ Th\xeam b\xe0i học" để tạo.</p>';
    return;
  }

  const segsByLesson = {};
  (segs || []).forEach(s => {
    if (!segsByLesson[s.lesson_id]) segsByLesson[s.lesson_id] = {};
    const lbl = s.item_label || 'Audio';
    if (!segsByLesson[s.lesson_id][lbl]) segsByLesson[s.lesson_id][lbl] = [];
    segsByLesson[s.lesson_id][lbl].push(s);
  });

  el.innerHTML = lessons.map((l, i) =>
    subListeningLessonRow(l, i + 1, segsByLesson[l.id] || {})
  ).join('');
}

function subListeningLessonRow(lesson, lessonNum, segsByLabel) {
  const totalSegs = Object.values(segsByLabel).flat().length;
  const labels    = Object.keys(segsByLabel).sort();
  const labelPills = labels.map(lbl => {
    const cnt = segsByLabel[lbl].length;
    return `<span style="font-size:10px;font-weight:600;color:#0d1b4b;background:#dbeafe;padding:2px 9px;border-radius:6px;cursor:pointer"
      onclick="subToggleAudioLabel(${lesson.id},'${lbl.replace(/'/g,"\\\\'")}')">
      ${escHtml(lbl)} (${cnt})</span>`;
  }).join('');
  const nextAudioNum = labels.length + 1;

  return `<div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:10px" id="sub-ls-lesson-${lesson.id}">
    <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:#f9fafb">
      <div style="width:28px;height:28px;border-radius:7px;background:#0d1b4b;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">${lessonNum}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:#1f2937">${escHtml(lesson.title || '(chưa c\xf3 ti\xeau đề)')}</div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:3px">
          ${totalSegs > 0
            ? `<span style="font-size:11px;color:#15803d;font-weight:600">${totalSegs} đoạn \xb7 ${labels.length} audio</span>`
            : `<span style="font-size:11px;color:#9ca3af">Chưa c\xf3 audio</span>`}
          ${labelPills}
        </div>
      </div>
      <div style="display:flex;gap:5px;flex-shrink:0">
        <button class="s-btn" onclick="subToggleAudioPanel(${lesson.id},${lessonNum},${nextAudioNum})"
          style="font-size:11px;padding:5px 12px;background:#0d1b4b">+ Th\xeam audio</button>
        <button class="table-btn" onclick="subDeleteLesson(${lesson.id})" title="X\xf3a b\xe0i học">
          <i class="fa-solid fa-trash" style="color:#c0392b"></i>
        </button>
      </div>
    </div>
    <div id="sub-ls-labels-${lesson.id}" style="display:none"></div>
    <div id="sub-ls-panel-${lesson.id}" style="display:none;padding:14px;border-top:1px solid #e5e7eb;background:#fff"></div>
  </div>`;
}

async function subToggleAudioLabel(lessonId, label) {
  const el = document.getElementById(`sub-ls-labels-${lessonId}`);
  if (!el) return;
  if (el.style.display !== 'none') { el.style.display = 'none'; return; }
  const { data: segs } = await _adminDb.client.from('audio_segments')
    .select('*').eq('lesson_id', lessonId).eq('item_label', label).order('sort_order').order('id');
  el.style.display = '';
  el.innerHTML = `<div style="padding:10px 14px;border-top:1px solid #f3f4f6">
    <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">${escHtml(label)}</div>
    ${(segs||[]).map(s => subSavedSegRow(s)).join('')}
  </div>`;
}

function subSavedSegRow(s) {
  const dur = s.end_sec > 0 ? `${s.start_sec.toFixed(1)}s–${s.end_sec.toFixed(1)}s` : '';
  return `<div id="sub-seg-${s.id}" style="display:flex;gap:8px;align-items:flex-start;padding:8px;border:1px solid #f3f4f6;border-radius:7px;background:#fafafa;margin-bottom:6px">
    <button onclick="subPlaySeg('${s.audio_url}',${s.start_sec},${s.end_sec})"
      style="width:30px;height:30px;border-radius:50%;background:#0d1b4b;color:#fff;border:none;cursor:pointer;flex-shrink:0;font-size:11px">
      <i class="fa-solid fa-play"></i>
    </button>
    <div style="flex:1;min-width:0">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:4px">
        <input id="sub-seg-tr-${s.id}" value="${escHtml(s.transcript||'')}" placeholder="Transcript"
          style="padding:5px 8px;border:1px solid #e5e7eb;border-radius:5px;font-family:'Noto Serif TC',serif;font-size:13px">
        <input id="sub-seg-py-${s.id}" value="${escHtml(s.pinyin||'')}" placeholder="Pinyin"
          style="padding:5px 8px;border:1px solid #e5e7eb;border-radius:5px;font-size:12px;font-family:inherit">
      </div>
      <input id="sub-seg-vi-${s.id}" value="${escHtml(s.meaning_vi||'')}" placeholder="Nghĩa tiếng Việt"
        style="width:100%;padding:5px 8px;border:1px solid #e5e7eb;border-radius:5px;font-size:12px;font-family:inherit;box-sizing:border-box">
      <div style="font-size:10px;color:#9ca3af;margin-top:3px">${dur}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
      <button onclick="subSaveSeg(${s.id})" style="background:#16a34a;color:#fff;border:none;padding:4px 10px;border-radius:5px;cursor:pointer;font-size:11px;font-weight:600">💾</button>
      <button onclick="subDeleteSeg(${s.id})" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;padding:4px 10px;border-radius:5px;cursor:pointer;font-size:11px">🗑</button>
    </div>
  </div>`;
}

// ── Inline Audio Upload Panel ─────────────────
function subToggleAudioPanel(lessonId, lessonNum, defaultAudioNum) {
  const panel = document.getElementById(`sub-ls-panel-${lessonId}`);
  if (!panel) return;
  if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
  const st = _saGet(lessonId);
  st.lessonNum = lessonNum; st.audioNum = defaultAudioNum;
  panel.style.display = '';
  panel.innerHTML = subAudioPanelHTML(lessonId, lessonNum, defaultAudioNum);
}

function subAudioPanelHTML(lessonId, lessonNum, audioNum) {
  return `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:12px;font-weight:600;color:#374151">B\xe0i</span>
        <input id="sub-la-lesson-${lessonId}" type="number" min="1" value="${lessonNum}"
          style="width:54px;padding:6px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;font-weight:700;text-align:center"
          oninput="subUpdateLabel(${lessonId})">
        <span style="font-size:12px;font-weight:600;color:#374151">Audio</span>
        <input id="sub-la-audio-${lessonId}" type="number" min="1" value="${audioNum}"
          style="width:54px;padding:6px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;font-weight:700;text-align:center"
          oninput="subUpdateLabel(${lessonId})">
      </div>
      <div style="background:#eff6ff;border:1px solid #c7d7fd;padding:5px 14px;border-radius:8px;display:flex;align-items:center;gap:6px">
        <i class="fa-solid fa-tag" style="color:#1a56db;font-size:11px"></i>
        <span id="sub-la-label-${lessonId}" style="font-size:13px;font-weight:700;color:#0d1b4b">Audio ${lessonNum}.${audioNum}</span>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <input type="file" accept="audio/*" id="sub-la-file-${lessonId}"
        onchange="subLaPreview(${lessonId},this)" style="font-size:12px;flex:1;min-width:160px">
      <button id="sub-la-upload-btn-${lessonId}" onclick="subLaUpload(${lessonId})"
        style="background:#1a56db;color:#fff;border:none;padding:8px 16px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">
        <i class="fa-solid fa-upload"></i> Upload
      </button>
      <button id="sub-la-stt-btn-${lessonId}" onclick="subLaTranscribe(${lessonId})" disabled
        style="background:#f3f4f6;color:#9ca3af;border:1px solid #e5e7eb;padding:8px 16px;border-radius:7px;font-size:12px;font-weight:600;cursor:not-allowed;font-family:inherit;white-space:nowrap">
        <i class="fa-solid fa-microphone"></i> Whisper STT
      </button>
    </div>
    <audio id="sub-la-audio-${lessonId}" controls style="display:none;width:100%;height:38px;margin-bottom:10px"></audio>
    <div id="sub-la-msg-${lessonId}" style="font-size:12px;min-height:18px;margin-bottom:8px"></div>
    <div id="sub-la-pending-${lessonId}"></div>`;
}

function subUpdateLabel(lessonId) {
  const ln = document.getElementById(`sub-la-lesson-${lessonId}`)?.value || 1;
  const an = document.getElementById(`sub-la-audio-${lessonId}`)?.value || 1;
  const lEl = document.getElementById(`sub-la-label-${lessonId}`);
  if (lEl) lEl.textContent = `Audio ${ln}.${an}`;
  _saGet(lessonId).lessonNum = parseInt(ln);
  _saGet(lessonId).audioNum  = parseInt(an);
}

function subLaPreview(lessonId, input) {
  const file = input.files[0]; if (!file) return;
  const audio = document.getElementById(`sub-la-audio-${lessonId}`);
  if (audio) { audio.src = URL.createObjectURL(file); audio.style.display = ''; }
  _saGet(lessonId).file = file;
}

async function subLaUpload(lessonId) {
  const st   = _saGet(lessonId);
  const file = st.file || document.getElementById(`sub-la-file-${lessonId}`)?.files[0];
  if (!file) { subLaMsg(lessonId, 'Chưa chọn file.', 'err'); return; }
  const btn = document.getElementById(`sub-la-upload-btn-${lessonId}`);
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading…';
  subLaMsg(lessonId, 'Đang upload…', 'info');
  const { url, error } = await _adminDb.uploadAudio(file, _subCurrentBook, lessonId);
  btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-upload"></i> Upload';
  if (error) { subLaMsg(lessonId, 'Lỗi upload: ' + error.message, 'err'); return; }
  st.url = url; st.file = file;
  subLaMsg(lessonId, '✓ Upload xong!', 'ok');
  const sttBtn = document.getElementById(`sub-la-stt-btn-${lessonId}`);
  if (sttBtn) { sttBtn.disabled = false; sttBtn.style.background = '#0d1b4b'; sttBtn.style.color = '#fff'; sttBtn.style.borderColor = '#0d1b4b'; sttBtn.style.cursor = 'pointer'; }
}

async function subLaTranscribe(lessonId) {
  const st   = _saGet(lessonId);
  const key  = localStorage.getItem('api_key_openai') || '';
  const file = st.file || document.getElementById(`sub-la-file-${lessonId}`)?.files[0];
  if (!file) { subLaMsg(lessonId, 'Cần file MP3.', 'err'); return; }
  if (!key)  { subLaMsg(lessonId, 'Chưa c\xf3 OpenAI key.', 'err'); return; }
  const btn = document.getElementById(`sub-la-stt-btn-${lessonId}`);
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Transcribing…';
  subLaMsg(lessonId, 'Đang gửi Whisper…', 'info');
  try {
    const form = new FormData();
    form.append('file', file); form.append('model', 'whisper-1');
    form.append('language', 'zh'); form.append('response_format', 'verbose_json');
    form.append('prompt', '繁體中文，臺灣用語，請使用繁體字');
    const res  = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    st.pending = (data.segments || []).map(s => ({
      text: s.text.trim(), start_sec: parseFloat(s.start.toFixed(2)), end_sec: parseFloat(s.end.toFixed(2)),
    })).filter(s => s.text);
    subLaRenderPending(lessonId);
    subLaMsg(lessonId, `✓ ${st.pending.length} đoạn — xem lại rồi lưu.`, 'ok');
  } catch(e) {
    subLaMsg(lessonId, 'Lỗi Whisper: ' + e.message, 'err');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-microphone"></i> Whisper STT';
  }
}

function subLaRenderPending(lessonId) {
  const st   = _saGet(lessonId);
  const area = document.getElementById(`sub-la-pending-${lessonId}`);
  if (!area) return;
  const rows = st.pending.map((s, i) => `
    <div style="display:flex;gap:8px;align-items:flex-start;padding:8px;border:1px solid #f3f4f6;border-radius:7px;background:#fafafa;margin-bottom:6px">
      <button onclick="subLaPlayLocal(${lessonId},${s.start_sec},${s.end_sec})"
        style="width:28px;height:28px;border-radius:50%;background:#0d1b4b;color:#fff;border:none;cursor:pointer;flex-shrink:0;font-size:10px">
        <i class="fa-solid fa-play"></i>
      </button>
      <div style="flex:1;min-width:0">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:4px">
          <input id="sub-pt-${lessonId}-${i}" value="${escHtml(s.text)}" placeholder="Transcript 繁體"
            style="padding:5px 8px;border:1px solid #e5e7eb;border-radius:5px;font-family:'Noto Serif TC',serif;font-size:13px">
          <input id="sub-pp-${lessonId}-${i}" placeholder="Pinyin"
            style="padding:5px 8px;border:1px solid #e5e7eb;border-radius:5px;font-size:12px;font-family:inherit">
        </div>
        <input id="sub-pv-${lessonId}-${i}" placeholder="Nghĩa tiếng Việt"
          style="width:100%;padding:5px 8px;border:1px solid #e5e7eb;border-radius:5px;font-size:12px;font-family:inherit;box-sizing:border-box">
        <div style="font-size:10px;color:#9ca3af;margin-top:2px">${s.start_sec.toFixed(1)}s–${s.end_sec.toFixed(1)}s</div>
      </div>
      <button onclick="subLaRemovePending(${lessonId},${i})"
        style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;width:26px;height:26px;border-radius:5px;cursor:pointer;font-size:11px;flex-shrink:0">✕</button>
    </div>`).join('');
  area.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:6px">
      <span style="font-size:12px;font-weight:700;color:#374151">${st.pending.length} đoạn chưa lưu</span>
      <div style="display:flex;gap:6px">
        <button id="sub-la-ai-btn-${lessonId}" onclick="subLaAIFill(${lessonId})"
          style="background:#f47b20;color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">
          <i class="fa-solid fa-sparkles"></i> AI Pinyin & Nghĩa
        </button>
        <button onclick="subLaSaveAll(${lessonId})"
          style="background:#16a34a;color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">
          💾 Lưu tất cả
        </button>
      </div>
    </div>
    ${rows}`;
}

function subLaPlayLocal(lessonId, startSec, endSec) {
  const el = document.getElementById(`sub-la-audio-${lessonId}`);
  if (!el?.src) return;
  el.currentTime = startSec; el.play();
  el.ontimeupdate = () => { if (el.currentTime >= endSec) { el.pause(); el.ontimeupdate = null; } };
}

function subLaRemovePending(lessonId, i) {
  _saGet(lessonId).pending.splice(i, 1);
  subLaRenderPending(lessonId);
}

async function subLaAIFill(lessonId) {
  const st  = _saGet(lessonId);
  const key = localStorage.getItem('api_key_openai') || '';
  if (!key) { subLaMsg(lessonId, 'Chưa c\xf3 OpenAI key.', 'err'); return; }
  const texts = st.pending.map((_, i) => document.getElementById(`sub-pt-${lessonId}-${i}`)?.value.trim()).filter(Boolean);
  if (!texts.length) return;
  const btn = document.getElementById(`sub-la-ai-btn-${lessonId}`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> AI…'; }
  const SYSTEM = `Bạn l\xe0 chuy\xean gia tiếng Trung phồn thể Đ\xe0i Loan. Với mỗi c\xe2u, cung cấp Pinyin c\xf3 dấu thanh v\xe0 nghĩa tiếng Việt tự nhi\xean. Trả về JSON thuần: [{"pinyin":"...","vi":"..."}]`;
  try {
    const raw = await window.app.ai.call(SYSTEM, texts.map((t,i)=>`${i+1}. ${t}`).join('\\n'), 1500);
    const match = (raw||'').match(/\\[\\s\\S]*\\]/);
    if (!match) throw new Error('Kh\xf4ng c\xf3 JSON');
    JSON.parse(match[0]).forEach((r, i) => {
      const pyEl = document.getElementById(`sub-pp-${lessonId}-${i}`);
      const viEl = document.getElementById(`sub-pv-${lessonId}-${i}`);
      if (pyEl && r.pinyin) pyEl.value = r.pinyin;
      if (viEl && r.vi)     viEl.value = r.vi;
    });
    subLaMsg(lessonId, '✓ AI đ\xe3 điền xong.', 'ok');
  } catch(e) {
    subLaMsg(lessonId, 'Lỗi AI: ' + e.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-sparkles"></i> AI Pinyin & Nghĩa'; }
  }
}

async function subLaSaveAll(lessonId) {
  const st = _saGet(lessonId);
  if (!st.url) { subLaMsg(lessonId, 'Chưa upload audio.', 'err'); return; }
  const ln    = parseInt(document.getElementById(`sub-la-lesson-${lessonId}`)?.value) || st.lessonNum;
  const an    = parseInt(document.getElementById(`sub-la-audio-${lessonId}`)?.value) || st.audioNum;
  const label = `Audio ${ln}.${an}`;
  const { data: lessonData } = await _adminDb.client.from('lessons').select('title').eq('id', lessonId).single();
  const rows = st.pending.map((s, i) => ({
    book_name: _subCurrentBook, lesson_id: lessonId, lesson_title: lessonData?.title || '',
    audio_url: st.url, item_label: label, start_sec: s.start_sec, end_sec: s.end_sec,
    transcript:  document.getElementById(`sub-pt-${lessonId}-${i}`)?.value.trim() || s.text,
    pinyin:      document.getElementById(`sub-pp-${lessonId}-${i}`)?.value.trim() || '',
    meaning_vi:  document.getElementById(`sub-pv-${lessonId}-${i}`)?.value.trim() || '',
    sort_order: i, published: true,
  }));
  const { error } = await _adminDb.bulkInsertAudioSegments(rows);
  if (error) { subLaMsg(lessonId, 'Lỗi lưu: ' + error.message, 'err'); return; }
  subLaMsg(lessonId, `✓ Đ\xe3 lưu ${rows.length} đoạn — ${label}.`, 'ok');
  st.pending = []; st.audioNum = an + 1;
  subLoadListeningLessons(_subCurrentBook);
}

function subPlaySeg(url, startSec, endSec) {
  let el = document.getElementById('sub-shared-audio');
  if (!el) { el = document.createElement('audio'); el.id = 'sub-shared-audio'; document.body.appendChild(el); }
  if (el.src !== url) el.src = url;
  el.currentTime = startSec; el.play();
  el.ontimeupdate = () => { if (el.currentTime >= endSec) { el.pause(); el.ontimeupdate = null; } };
}

async function subSaveSeg(id) {
  const tr = document.getElementById(`sub-seg-tr-${id}`)?.value.trim();
  const py = document.getElementById(`sub-seg-py-${id}`)?.value.trim();
  const vi = document.getElementById(`sub-seg-vi-${id}`)?.value.trim();
  const { error } = await _adminDb.saveAudioSegment({ id, transcript: tr, pinyin: py, meaning_vi: vi });
  if (error) { alert('Lỗi: ' + error.message); return; }
  const btn = event.target; btn.textContent = '✓';
  setTimeout(() => btn.textContent = '💾', 1500);
}

async function subDeleteSeg(id) {
  if (!confirm('X\xf3a đoạn n\xe0y?')) return;
  await _adminDb.deleteAudioSegment(id);
  document.getElementById(`sub-seg-${id}`)?.remove();
}

function subLaMsg(lessonId, text, type) {
  const el = document.getElementById(`sub-la-msg-${lessonId}`);
  if (!el) return;
  el.textContent = text;
  el.style.color = type === 'err' ? '#dc2626' : type === 'ok' ? '#16a34a' : '#1a56db';
}'''

new_content = old[:start] + new_section + old[end:]
open(path, 'w', encoding='utf-8').write(new_content)
print(f"Done. File: {new_content.count(chr(10))+1} lines")
