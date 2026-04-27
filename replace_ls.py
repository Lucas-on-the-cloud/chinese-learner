with open('public/admin/index.html', encoding='utf-8') as f:
    content = f.read()

start_marker = 'async function lsRenderRight(bookName) {'
end_marker = "function lsMsg(text, type) {"

si = content.find(start_marker)
ei = content.find(end_marker)

# Everything before the start + new code + everything from lsMsg onwards
before = content[:si]
after  = content[ei:]  # starts from "function lsMsg..."

new_code = '''async function lsRenderRight(bookName) {
  const meta    = (window._lsAllBooks||[]).find(b=>b.name===bookName)||{};
  const label   = meta.display_name || bookName;
  const lessons = (window._lsAllLessons||[]).filter(l=>l.book===bookName);
  const gcpKey  = lsGetGcpKey();
  const lessonOpts = lessons.map(l => '<option value="'+l.id+'">'+l.title+'</option>').join('');

  const { data: segs } = await DB.from('audio_segments')
    .select('*').eq('book_name', bookName).order('sort_order').order('id');

  // Group: lesson_id => item_label => segs[]
  const lessonMap = new Map();
  (segs||[]).forEach(s => {
    const lid = s.lesson_id;
    const lbl = s.item_label || 'Audio';
    if (!lessonMap.has(lid)) {
      const lesson = lessons.find(l=>l.id==lid)||{};
      lessonMap.set(lid, { title: lesson.title || s.lesson_title || 'Bai hoc', items: new Map() });
    }
    const items = lessonMap.get(lid).items;
    if (!items.has(lbl)) items.set(lbl, []);
    items.get(lbl).push(s);
  });

  const savedHTML = lessonMap.size ? [...lessonMap.entries()].map(([lid, grp]) => {
    const itemsHTML = [...grp.items.entries()].map(([lbl, ss]) => {
      const url = ss[0]&&ss[0].audio_url ? ss[0].audio_url : '';
      const segRows = ss.map(s => {
        const dur = s.end_sec > 0 ? s.start_sec.toFixed(1)+'s-'+s.end_sec.toFixed(1)+'s' : '';
        return '<div id="ls-seg-'+s.id+'" style="display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border:1px solid #f3f4f6;border-radius:7px;background:#fafafa;margin-bottom:6px">'
          +'<button onclick="lsPlaySegment(\''+url+'\','+s.start_sec+','+s.end_sec+')" style="width:28px;height:28px;border-radius:50%;background:#1a56db;color:#fff;border:none;cursor:pointer;flex-shrink:0;font-size:10px"><i class="fa-solid fa-play"></i></button>'
          +'<div style="flex:1;min-width:0">'
          +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:4px">'
          +'<input id="ls-tr-'+s.id+'" value="'+escHtml(s.transcript||'')+'" placeholder="Transcript" style="padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;font-family:Noto Serif TC,serif;font-size:13px">'
          +'<input id="ls-py-'+s.id+'" value="'+escHtml(s.pinyin||'')+'" placeholder="Pinyin" style="padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;font-family:inherit">'
          +'</div>'
          +'<input id="ls-vi-'+s.id+'" value="'+escHtml(s.meaning_vi||'')+'" placeholder="Nghia tieng Viet" style="width:100%;padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;font-family:inherit;box-sizing:border-box">'
          +'<div style="font-size:10px;color:#9ca3af;margin-top:3px">'+dur+'</div>'
          +'</div>'
          +'<div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">'
          +'<button onclick="lsSaveOneSeg('+s.id+')" style="background:#16a34a;color:#fff;border:none;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit">Save</button>'
          +'<button onclick="lsDeleteSeg('+s.id+')" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-family:inherit">Del</button>'
          +'</div>'
          +'</div>';
      }).join('');
      const safeId = lbl.replace(/[^a-zA-Z0-9]/g,'_');
      return '<div style="margin-bottom:10px;border:1px solid #e5e7eb;border-radius:9px;overflow:hidden">'
        +'<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f9fafb;border-bottom:1px solid #f3f4f6">'
        +'<div style="font-size:13px;font-weight:700;color:#374151;display:flex;align-items:center;gap:8px">'
        +'<i class="fa-solid fa-headphones" style="color:#7c3aed;font-size:11px"></i> '+lbl
        +' <span style="font-size:11px;font-weight:400;color:#9ca3af">'+ss.length+' doan</span>'
        +'</div>'
        +'<audio id="ls-aud-'+lid+'-'+safeId+'" src="'+url+'" style="display:none"></audio>'
        +'</div>'
        +'<div style="padding:10px">'+segRows+'</div>'
        +'</div>';
    }).join('');
    return '<div class="s-card" style="margin-bottom:14px">'
      +'<div class="s-title" style="font-size:14px;margin-bottom:12px">'
      +'<i class="fa-solid fa-book-open" style="color:#1a56db"></i> '+grp.title
      +'</div>'
      +itemsHTML
      +'</div>';
  }).join('')
  : '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:2rem;text-align:center;color:#9ca3af;font-size:13px">Chua co audio nao. Upload MP3 va transcribe de bat dau.</div>';

  document.getElementById('ls-right-area').innerHTML =
    '<div class="s-card" style="margin-bottom:16px">'
    +'<div class="s-title" style="margin-bottom:12px"><i class="fa-solid fa-headphones" style="color:#7c3aed"></i> '+label+' — Quản l\xfd audio</div>'

    +'<div style="background:#f8faff;border:1px solid #c7d7fd;border-radius:8px;padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:10px">'
    +'<i class="fa-solid fa-key" style="color:#1a56db;font-size:12px;flex-shrink:0"></i>'
    +'<input id="ls-gcp-key" type="password" placeholder="Google Cloud STT API Key" value="'+gcpKey+'" style="flex:1;border:none;background:transparent;outline:none;font-family:inherit;font-size:13px" onchange="lsSaveGcpKey(this.value)">'
    +'<span style="font-size:11px;color:#6b7280">GCP Key</span>'
    +'</div>'

    +'<div style="border:1px solid #e5e7eb;border-radius:9px;padding:16px;background:#fafafa">'
    +'<div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:12px"><i class="fa-solid fa-plus" style="color:#1a56db"></i> Th\xeam audio mới</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">'
    +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px">B\xe0i học *</label>'
    +'<select id="ls-lesson-sel" style="width:100%;padding:7px 10px;border:1px solid #e5e7eb;border-radius:7px;font-family:inherit;font-size:13px">'+lessonOpts+'</select></div>'
    +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px">T\xean audio *</label>'
    +'<input id="ls-item-label" placeholder="VD: Audio 1.1" value="Audio 1.1" style="width:100%;padding:7px 10px;border:1px solid #e5e7eb;border-radius:7px;font-family:inherit;font-size:13px;box-sizing:border-box"></div>'
    +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px">File MP3 *</label>'
    +'<input type="file" accept="audio/*" id="ls-file-input" onchange="lsPreviewAudio(this)" style="width:100%;font-size:12px;padding:6px"></div>'
    +'</div>'
    +'<div id="ls-audio-preview" style="display:none;margin-bottom:10px"><audio id="ls-audio-el" controls style="width:100%;height:38px"></audio></div>'
    +'<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">'
    +'<button id="ls-upload-btn" onclick="lsUploadAudio()" style="background:#1a56db;color:#fff;border:none;padding:8px 18px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:6px"><i class="fa-solid fa-upload"></i> Upload</button>'
    +'<button id="ls-stt-btn" onclick="lsTranscribe()" disabled style="background:#f3f4f6;color:#9ca3af;border:1px solid #e5e7eb;padding:8px 18px;border-radius:7px;font-size:13px;font-weight:600;cursor:not-allowed;font-family:inherit;display:flex;align-items:center;gap:6px"><i class="fa-solid fa-microphone"></i> Transcribe</button>'
    +'<div id="ls-upload-msg" style="font-size:12px"></div>'
    +'</div></div></div>'

    +'<div id="ls-pending-area" style="display:none"></div>'
    +'<div id="ls-saved-area">'+savedHTML+'</div>';
}

'''

with open('public/admin/index.html', 'w', encoding='utf-8') as f:
    f.write(before + new_code + after)

print('Done')
