// ── LISTENING ADMIN (v2) ───────────────────────
let lsSelectedBook   = null;
let lsSelectedLesson = null;
let lsAudioUrl       = null;
let lsPendingSegs    = [];
let lsItemLabel      = '';       // e.g. "Audio 1.1"

function lsGetOpenAIKey() { return localStorage.getItem('api_key_openai') || ''; }

async function loadListeningAdmin() {
  const [{ data: lessons }, { data: books }, summary] = await Promise.all([
    DB.from('lessons').select('id,title,book').order('id'),
    DB.from('books').select('*').order('name'),
    _adminDb.getAudioSegmentSummary(),
  ]);
  const countByBook = {};
  (summary||[]).forEach(r => { countByBook[r.book_name] = (countByBook[r.book_name]||0)+1; });
  const total = Object.values(countByBook).reduce((a,b)=>a+b,0);
  const sbEl = document.getElementById('sb-ls-count');
  if (sbEl) sbEl.textContent = total;

  window._lsAllLessons = lessons || [];
  window._lsAllBooks   = books   || [];

  const bookNames = [...new Set([
    ...(books||[]).map(b=>b.name),
    ...(lessons||[]).map(l=>l.book),
  ])].sort();

  document.getElementById('ls-book-list').innerHTML = bookNames.map(name => {
    const meta  = (books||[]).find(b=>b.name===name)||{};
    const label = meta.display_name || name;
    const cnt   = countByBook[name] || 0;
    return `<button onclick="lsSelectBook('${name}')" id="lsb-${name}"
      style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;cursor:pointer;font-family:inherit;font-size:13px;width:100%;text-align:left;transition:all .15s">
      <div>
        <div style="font-weight:600;color:#1f2937;font-size:13px">${label}</div>
        <div style="font-size:10px;color:#9ca3af">${name}</div>
      </div>
      <span style="font-size:11px;font-weight:600;color:#6b7280;background:#f3f4f6;padding:2px 8px;border-radius:8px;flex-shrink:0">${cnt} đoạn</span>
    </button>`;
  }).join('');
}

function lsSelectBook(bookName) {
  lsSelectedBook   = bookName;
  lsSelectedLesson = null;
  lsAudioUrl       = null;
  lsPendingSegs    = [];
  document.querySelectorAll('[id^="lsb-"]').forEach(b => {
    const active = b.id === 'lsb-' + bookName;
    b.style.background   = active ? '#eff6ff' : '#fff';
    b.style.borderColor  = active ? '#1a56db' : '#e5e7eb';
    b.style.color        = active ? '#1a56db' : '';
  });
  lsRenderRight(bookName);
}

async function lsRenderRight(bookName) {
  const meta    = (window._lsAllBooks||[]).find(b=>b.name===bookName)||{};
  const label   = meta.display_name || bookName;
  const lessons = (window._lsAllLessons||[]).filter(l=>l.book===bookName);

  // Load existing segments for this book
  const { data: segs } = await DB.from('audio_segments')
    .select('*').eq('book_name', bookName).order('sort_order').order('id');

  // Group segments by lesson_id
  const segsByLesson = {};
  (segs||[]).forEach(s => {
    if (!segsByLesson[s.lesson_id]) segsByLesson[s.lesson_id] = [];
    segsByLesson[s.lesson_id].push(s);
  });

  const openaiKey = lsGetOpenAIKey();
  const keyOk = !!openaiKey;
  const lessonOpts = lessons.map(l => `<option value="${l.id}">${l.title}</option>`).join('');

  document.getElementById('ls-right-area').innerHTML = `
    <div class="s-card" style="margin-bottom:16px">
      <div class="s-title" style="margin-bottom:16px"><i class="fa-solid fa-headphones" style="color:#1a56db"></i> ${label}</div>

      <!-- Whisper key status -->
      <div style="background:${keyOk?'#f0fdf4':'#fef2f2'};border:1px solid ${keyOk?'#bbf7d0':'#fecaca'};border-radius:8px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
        <i class="fa-solid fa-microphone" style="color:${keyOk?'#16a34a':'#dc2626'};font-size:13px;flex-shrink:0"></i>
        <span style="flex:1;font-size:13px;color:${keyOk?'#15803d':'#b91c1c'}">
          ${keyOk ? '✓ OpenAI key đã cấu hình — dùng Whisper để transcribe' : 'Chưa có OpenAI key — vào Settings → AI &amp; API để thêm key'}
        </span>
        ${!keyOk ? `<a href="#" onclick="document.querySelector('[data-tab=settings]')?.click()" style="font-size:11px;color:#1a56db;white-space:nowrap">Thêm key →</a>` : ''}
      </div>

      <!-- Upload area -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
        <div>
          <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Bài học *</label>
          <select id="ls-lesson-sel" style="width:100%;padding:8px 10px;border:1px solid #e5e7eb;border-radius:7px;font-family:inherit;font-size:13px">
            ${lessonOpts||'<option>Không có bài học</option>'}
          </select>
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Tên audio *</label>
          <input id="ls-item-label" placeholder="VD: Audio 1.1" value="Audio 1.1"
            style="width:100%;padding:8px 10px;border:1px solid #e5e7eb;border-radius:7px;font-family:inherit;font-size:13px;box-sizing:border-box">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px">File MP3 *</label>
          <input type="file" accept="audio/*" id="ls-file-input" onchange="lsPreviewAudio(this)"
            style="width:100%;font-size:12px;padding:6px">
        </div>
      </div>

      <!-- Audio preview -->
      <div id="ls-audio-preview" style="display:none;margin-bottom:14px">
        <audio id="ls-audio-el" controls style="width:100%;height:40px"></audio>
      </div>

      <!-- Upload + Transcribe buttons -->
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button id="ls-upload-btn" onclick="lsUploadAudio()"
          style="background:#1a56db;color:#fff;border:none;padding:9px 20px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:7px">
          <i class="fa-solid fa-upload"></i> Upload MP3
        </button>
        <button id="ls-stt-btn" onclick="lsTranscribe()" disabled
          style="background:#f3f4f6;color:#9ca3af;border:1px solid #e5e7eb;padding:9px 20px;border-radius:7px;font-size:13px;font-weight:600;cursor:not-allowed;font-family:inherit;display:flex;align-items:center;gap:7px">
          <i class="fa-solid fa-microphone"></i> Transcribe với STT
        </button>
      </div>
      <div id="ls-upload-msg" style="margin-top:8px;font-size:12px"></div>
    </div>

    <!-- Pending segments (from transcription, not saved) -->
    <div id="ls-pending-area" style="display:none" class="s-card" style="margin-bottom:16px"></div>

    <!-- Saved segments grouped by lesson -->
    <div id="ls-saved-area">
      ${lsRenderSavedSegs(segsByLesson, lessons)}
    </div>`;
}

function lsRenderSavedSegs(segsByLesson, lessons) {
  const entries = Object.entries(segsByLesson);
  if (!entries.length) return `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:2rem;text-align:center;color:#9ca3af;font-size:13px">Chưa có audio nào. Upload MP3 và transcribe để bắt đầu.</div>`;

  return entries.map(([lessonId, segs]) => {
    const lesson = lessons.find(l=>l.id==lessonId)||{};

    // Group within lesson by item_label
    const byLabel = new Map();
    segs.forEach(s => {
      const lbl = s.item_label || 'Audio';
      if (!byLabel.has(lbl)) byLabel.set(lbl, []);
      byLabel.get(lbl).push(s);
    });

    const itemsHTML = [...byLabel.entries()].map(([lbl, ss]) => {
      const url = ss[0]?.audio_url || '';
      const safeId = lbl.replace(/[^a-zA-Z0-9]/g,'_');
      const segRows = ss.map(s => lsSegRow(s)).join('');
      return `<div style="margin-bottom:10px;border:1px solid #e5e7eb;border-radius:9px;overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 14px;background:#f9fafb;border-bottom:1px solid #f3f4f6">
          <div style="font-size:13px;font-weight:700;color:#374151;display:flex;align-items:center;gap:8px">
            <i class="fa-solid fa-headphones" style="color:#7c3aed;font-size:11px"></i> ${lbl}
            <span style="font-size:11px;font-weight:400;color:#9ca3af">${ss.length} đoạn</span>
          </div>
          <audio id="ls-aud-${lessonId}-${safeId}" src="${url}" style="display:none"></audio>
        </div>
        <div style="padding:10px">${segRows}</div>
      </div>`;
    }).join('');

    return `<div class="s-card" style="margin-bottom:14px">
      <div class="s-title" style="font-size:14px;margin-bottom:12px"><i class="fa-solid fa-book-open" style="color:#1a56db"></i> ${lesson.title||'Bài học'}</div>
      ${itemsHTML}
    </div>`;
  }).join('');
}

function lsSegRow(s) {
  const dur = s.end_sec > 0 ? `${s.start_sec.toFixed(1)}s – ${s.end_sec.toFixed(1)}s` : '';
  return `<div id="ls-seg-${s.id}" style="display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid #f3f4f6;border-radius:8px;background:#fafafa;margin-bottom:7px">
    <button onclick="lsPlaySegment('${s.audio_url}',${s.start_sec},${s.end_sec})"
      style="width:34px;height:34px;border-radius:50%;background:#1a56db;color:#fff;border:none;cursor:pointer;flex-shrink:0;font-size:12px">
      <i class="fa-solid fa-play"></i>
    </button>
    <div style="flex:1;min-width:0">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:5px">
        <input id="ls-tr-${s.id}" value="${escHtml(s.transcript)}" placeholder="Transcript 繁體"
          style="padding:6px 9px;border:1px solid #e5e7eb;border-radius:6px;font-family:'Noto Serif TC',serif;font-size:14px">
        <input id="ls-py-${s.id}" value="${escHtml(s.pinyin||'')}" placeholder="Pinyin"
          style="padding:6px 9px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;font-family:inherit">
      </div>
      <input id="ls-vi-${s.id}" value="${escHtml(s.meaning_vi||'')}" placeholder="Nghĩa tiếng Việt"
        style="width:100%;padding:6px 9px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;font-family:inherit;box-sizing:border-box">
      <div style="font-size:10px;color:#9ca3af;margin-top:4px">${dur}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0">
      <button onclick="lsSaveOneSeg(${s.id})"
        style="background:#16a34a;color:#fff;border:none;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit">💾</button>
      <button onclick="lsDeleteSeg(${s.id})"
        style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:11px;font-family:inherit">🗑</button>
    </div>
  </div>`;
}

function lsPreviewAudio(input) {
  const file = input.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const prev = document.getElementById('ls-audio-preview');
  document.getElementById('ls-audio-el').src = url;
  prev.style.display = '';
}

async function lsUploadAudio() {
  const fileInput = document.getElementById('ls-file-input');
  const lessonId  = document.getElementById('ls-lesson-sel')?.value;
  const file      = fileInput?.files[0];
  if (!file)     { lsMsg('Chưa chọn file.', 'err'); return; }
  if (!lessonId) { lsMsg('Chưa chọn bài học.', 'err'); return; }

  const btn = document.getElementById('ls-upload-btn');
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang upload…';
  lsMsg('Đang upload lên Supabase Storage…', 'info');

  const { url, error } = await _adminDb.uploadAudio(file, lsSelectedBook, lessonId);
  btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-upload"></i> Upload MP3';

  if (error) { lsMsg('Lỗi upload: ' + error.message, 'err'); return; }

  lsAudioUrl = url;
  lsMsg(`✓ Upload xong! URL: ${url.slice(0,60)}…`, 'ok');

  // Enable STT button
  const sttBtn = document.getElementById('ls-stt-btn');
  sttBtn.disabled = false;
  sttBtn.style.background = '#4c1d95'; sttBtn.style.color = '#fff';
  sttBtn.style.borderColor = '#4c1d95'; sttBtn.style.cursor = 'pointer';
}

async function lsTranscribe() {
  const fileInput = document.getElementById('ls-file-input');
  const file      = fileInput?.files[0];
  const key       = lsGetOpenAIKey();
  if (!file) { lsMsg('Cần chọn file MP3.', 'err'); return; }
  if (!key)  { lsMsg('Chưa có OpenAI key — vào Settings → AI & API để thêm.', 'err'); return; }

  const MB25 = 25 * 1024 * 1024;
  if (file.size > MB25) { lsMsg(`File quá lớn (${(file.size/1024/1024).toFixed(1)}MB > 25MB giới hạn Whisper).`, 'err'); return; }

  const btn = document.getElementById('ls-stt-btn');
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang transcribe…';
  lsMsg('Đang gửi audio lên Whisper…', 'info');

  try {
    const segments = await lsRunWhisper(file, key);
    lsPendingSegs = segments;
    lsRenderPendingSegs(segments);
    lsMsg(`✓ Transcribe xong — ${segments.length} đoạn. Xem lại rồi lưu.`, 'ok');
  } catch(e) {
    lsMsg('Lỗi Whisper: ' + e.message, 'err');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-microphone"></i> Transcribe với Whisper';
  }
}

async function lsRunWhisper(file, key) {
  const form = new FormData();
  form.append('file', file);
  form.append('model', 'whisper-1');
  form.append('language', 'zh');
  form.append('response_format', 'verbose_json');
  form.append('prompt', '繁體中文，臺灣用語，請使用繁體字');

  const res  = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}` },
    body: form,
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  return (data.segments || []).map(s => ({
    text:      s.text.trim(),
    start_sec: parseFloat(s.start.toFixed(2)),
    end_sec:   parseFloat(s.end.toFixed(2)),
  })).filter(s => s.text);
}

function lsRenderPendingSegs(segs) {
  const area = document.getElementById('ls-pending-area');
  area.style.display = '';

  const rows = segs.map((s, i) => `
    <div id="ls-pend-${i}" style="display:flex;gap:10px;align-items:flex-start;padding:10px;border:1px solid #f3f4f6;border-radius:8px;background:#fafafa;margin-bottom:7px">
      <button onclick="lsPlaySegmentLocal(${s.start_sec},${s.end_sec})"
        style="width:32px;height:32px;border-radius:50%;background:#7c3aed;color:#fff;border:none;cursor:pointer;flex-shrink:0;font-size:11px">
        <i class="fa-solid fa-play"></i>
      </button>
      <div style="flex:1;min-width:0">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:5px">
          <input id="ls-pt-${i}" value="${escHtml(s.text)}" placeholder="Transcript 繁體"
            style="padding:6px 9px;border:1px solid #e5e7eb;border-radius:6px;font-family:'Noto Serif TC',serif;font-size:14px">
          <input id="ls-pp-${i}" placeholder="Pinyin (tuỳ chọn)"
            style="padding:6px 9px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;font-family:inherit">
        </div>
        <input id="ls-pv-${i}" placeholder="Nghĩa tiếng Việt (tuỳ chọn)"
          style="width:100%;padding:6px 9px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;font-family:inherit;box-sizing:border-box">
        <div style="font-size:10px;color:#9ca3af;margin-top:4px">${s.start_sec.toFixed(1)}s – ${s.end_sec.toFixed(1)}s</div>
      </div>
      <button onclick="lsRemovePending(${i})"
        style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:11px;flex-shrink:0">✕</button>
    </div>`).join('');

  area.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div class="s-title"><i class="fa-solid fa-wand-magic-sparkles" style="color:#7c3aed"></i> Kết quả STT — ${segs.length} đoạn (chưa lưu)</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="ls-ai-fill-btn" onclick="lsAIFillPending()"
          style="background:#f47b20;color:#fff;border:none;padding:8px 16px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:6px">
          <i class="fa-solid fa-sparkles"></i> Tạo Pinyin & Nghĩa với AI
        </button>
        <button onclick="lsSaveAllPending()"
          style="background:#16a34a;color:#fff;border:none;padding:8px 18px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">
          💾 Lưu tất cả
        </button>
        <button onclick="lsClearPending()"
          style="background:transparent;border:1px solid #e5e7eb;padding:8px 12px;border-radius:7px;font-size:13px;cursor:pointer;font-family:inherit;color:#6b7280">
          Huỷ
        </button>
      </div>
    </div>
    ${rows}`;
}

async function lsAIFillPending() {
  const key = lsGetOpenAIKey();
  if (!key) { lsMsg('Chưa có OpenAI key — vào Settings → AI & API để thêm.', 'err'); return; }

  // Collect texts from pending rows
  const texts = lsPendingSegs.map((_, i) => document.getElementById('ls-pt-' + i)?.value.trim()).filter(Boolean);
  if (!texts.length) { lsMsg('Không có transcript nào để xử lý.', 'err'); return; }

  const btn = document.getElementById('ls-ai-fill-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> AI đang xử lý…'; }
  lsMsg('Đang gửi cho AI tạo Pinyin & Nghĩa tiếng Việt…', 'info');

  const SYSTEM = `Bạn là chuyên gia tiếng Trung phồn thể Đài Loan (繁體中文). Với mỗi câu được đánh số, hãy cung cấp:
1. Pinyin có dấu thanh (tone marks, không dùng số)
2. Nghĩa tiếng Việt tự nhiên

Trả về JSON thuần (KHÔNG markdown, KHÔNG giải thích):
[{"pinyin":"...","vi":"..."}, ...]

Đúng số phần tử, đúng thứ tự.`;

  const userMsg = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');

  try {
    const raw = await window.app.ai.call(SYSTEM, userMsg, 2000);
    if (!raw) throw new Error('AI không trả về kết quả');

    const cleaned = raw.trim().replace(/^```json\s*/,'').replace(/\s*```$/,'');
    const match   = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Không tìm thấy JSON array trong phản hồi');
    const results = JSON.parse(match[0]);

    // Fill inputs
    let filled = 0;
    lsPendingSegs.forEach((_, i) => {
      const r = results[i];
      if (!r) return;
      const pyEl = document.getElementById('ls-pp-' + i);
      const viEl = document.getElementById('ls-pv-' + i);
      if (pyEl && r.pinyin) { pyEl.value = r.pinyin; filled++; }
      if (viEl && r.vi)     { viEl.value = r.vi; }
    });

    lsMsg(`✓ AI đã điền Pinyin & Nghĩa cho ${filled} đoạn. Xem lại rồi lưu.`, 'ok');
  } catch(e) {
    lsMsg('Lỗi AI: ' + e.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-sparkles"></i> Tạo Pinyin & Nghĩa với AI'; }
  }
}

function lsPlaySegmentLocal(startSec, endSec) {
  const el = document.getElementById('ls-audio-el');
  if (!el?.src) return;
  el.currentTime = startSec;
  el.play();
  el.ontimeupdate = () => { if (el.currentTime >= endSec) { el.pause(); el.ontimeupdate = null; } };
}

function lsPlaySegment(url, startSec, endSec) {
  let el = document.getElementById('ls-shared-audio');
  if (!el) { el = document.createElement('audio'); el.id = 'ls-shared-audio'; document.body.appendChild(el); }
  if (el.src !== url) el.src = url;
  el.currentTime = startSec;
  el.play();
  el.ontimeupdate = () => { if (el.currentTime >= endSec) { el.pause(); el.ontimeupdate = null; } };
}

function lsRemovePending(i) {
  lsPendingSegs.splice(i, 1);
  lsRenderPendingSegs(lsPendingSegs);
}

function lsClearPending() {
  lsPendingSegs = [];
  const area = document.getElementById('ls-pending-area');
  if (area) area.style.display = 'none';
}

async function lsSaveAllPending() {
  const lessonId  = document.getElementById('ls-lesson-sel')?.value;
  const lesson    = (window._lsAllLessons||[]).find(l=>l.id==lessonId)||{};
  if (!lsAudioUrl) { lsMsg('Chưa upload audio URL.','err'); return; }

  const itemLabel = document.getElementById('ls-item-label')?.value.trim() || 'Audio 1';
  const rows = lsPendingSegs.map((s, i) => ({
    book_name:    lsSelectedBook,
    lesson_id:    parseInt(lessonId),
    lesson_title: lesson.title || '',
    audio_url:    lsAudioUrl,
    item_label:   itemLabel,
    start_sec:    s.start_sec,
    end_sec:      s.end_sec,
    transcript:   document.getElementById('ls-pt-' + i)?.value.trim() || s.text,
    pinyin:       document.getElementById('ls-pp-' + i)?.value.trim() || '',
    meaning_vi:   document.getElementById('ls-pv-' + i)?.value.trim() || '',
    sort_order:   i,
    published:    true,
  }));

  const { error } = await _adminDb.bulkInsertAudioSegments(rows);
  if (error) { lsMsg('Lỗi lưu: ' + error.message, 'err'); return; }
  lsMsg(`✓ Đã lưu ${rows.length} đoạn!`, 'ok');
  lsPendingSegs = [];
  lsRenderRight(lsSelectedBook);
}

async function lsSaveOneSeg(id) {
  const tr = document.getElementById('ls-tr-' + id)?.value.trim();
  const py = document.getElementById('ls-py-' + id)?.value.trim();
  const vi = document.getElementById('ls-vi-' + id)?.value.trim();
  const { error } = await _adminDb.saveAudioSegment({ id, transcript: tr, pinyin: py, meaning_vi: vi });
  if (error) { alert('Lỗi: ' + error.message); return; }
  const btn = event.target; btn.textContent = '✓';
  setTimeout(() => btn.textContent = '💾', 1500);
}

async function lsDeleteSeg(id) {
  if (!confirm('Xóa đoạn này?')) return;
  const { error } = await _adminDb.deleteAudioSegment(id);
  if (error) { alert('Lỗi: ' + error.message); return; }
  document.getElementById('ls-seg-' + id)?.remove();
}

function lsMsg(text, type) {
  const el = document.getElementById('ls-upload-msg'); if (!el) return;
  el.textContent = text;
  el.style.color = type === 'err' ? '#dc2626' : type === 'ok' ? '#16a34a' : '#1a56db';
}
