class WorksheetManager {
  open() {
    const vocab = app.vocab.items;
    if (!vocab.length) { alert('Hãy tạo từ vựng trước.'); return; }
    document.getElementById('ws-list').innerHTML = vocab.map((w, i) => `
      <label class="ws-row">
        <input type="checkbox" class="ws-cb" data-i="${i}" checked>
        <span class="ws-zh">${w.char}</span>
        <span class="ws-py">${w.pinyin || ''}</span>
        <span class="ws-vn">${w.meaning || ''}</span>
      </label>
    `).join('');
    document.getElementById('ws-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  close() {
    document.getElementById('ws-overlay').classList.remove('open');
    document.body.style.overflow = '';
  }

  selectAll()  { document.querySelectorAll('.ws-cb').forEach(cb => cb.checked = true); }
  selectNone() { document.querySelectorAll('.ws-cb').forEach(cb => cb.checked = false); }

  generate() {
    const selected = [...document.querySelectorAll('.ws-cb:checked')]
      .map(cb => app.vocab.items[+cb.dataset.i])
      .filter(Boolean);
    if (!selected.length) { alert('Chọn ít nhất 1 từ.'); return; }
    this.close();
    const lessonTitle = app.currentLesson ? app.currentLesson.title : '';
    const win = window.open('', '_blank');
    win.document.write(this._buildHTML(selected, lessonTitle));
    win.document.close();
  }

  _buildHTML(vocab, lessonTitle) {
    const SZ = 58;  // box size in px
    const N  = 10;  // practice columns

    let rowsHTML = '';
    let initJS   = '';

    vocab.forEach((w, wi) => {
      // filter out spaces / punctuation so only hanzi get rows
      const chars = [...w.char].filter(c => /\S/.test(c));

      rowsHTML += `<div class="word-hd">
        ${w.char}
        <span class="py">${w.pinyin || ''}</span>
        <span class="vn">${w.meaning || ''}</span>
      </div>`;

      chars.forEach((ch, ci) => {
        const eId  = `e-${wi}-${ci}`;
        const pIds = Array.from({ length: N }, (_, k) => `p-${wi}-${ci}-${k}`);
        const grid = `<div class="gl"></div><div class="gv"></div>`;

        rowsHTML += `<div class="row">
          <div class="box ex" id="${eId}">${grid}</div>
          ${pIds.map(id => `<div class="box pr" id="${id}">${grid}</div>`).join('')}
        </div>`;

        // bold filled example
        initJS += `HanziWriter.create('${eId}','${ch}',{width:${SZ},height:${SZ},padding:4,showOutline:false,showCharacter:true,strokeColor:'#111'});\n`;
        // faint outline-only practice boxes
        pIds.forEach(id => {
          initJS += `HanziWriter.create('${id}','${ch}',{width:${SZ},height:${SZ},padding:4,showOutline:true,showCharacter:false,outlineColor:'#bbb'});\n`;
        });
      });
    });

    return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>漢字練習</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;600&family=Be+Vietnam+Pro:wght@400;500&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/hanzi-writer@3.5/dist/hanzi-writer.min.js"><\/script>
<style>
@page { size: A4 portrait; margin: 12mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Be Vietnam Pro', sans-serif; background: #fff; padding: 10px; }
.print-bar { display: flex; align-items: center; gap: 10px; padding-bottom: 12px; margin-bottom: 10px; border-bottom: 1px solid #e0d8cc; }
.print-btn { background: #1a1208; color: #fff; border: none; padding: 7px 20px; border-radius: 6px; cursor: pointer; font-size: 13px; font-family: inherit; }
.print-hint { font-size: 11px; color: #999; }
h1 { font-family: 'Noto Serif TC', serif; font-size: 15px; color: #333; margin-bottom: 12px; }
.word-hd { font-family: 'Noto Serif TC', serif; font-size: 13px; font-weight: 600; color: #444; margin: 12px 0 4px; }
.word-hd .py { color: #888; font-style: italic; font-weight: 400; margin-left: 8px; font-family: 'Be Vietnam Pro', sans-serif; }
.word-hd .vn { color: #888; font-weight: 400; margin-left: 6px; font-family: 'Be Vietnam Pro', sans-serif; }
.row { display: flex; gap: 3px; margin-bottom: 3px; page-break-inside: avoid; }
.box { width: ${SZ}px; height: ${SZ}px; border: 1px solid #bbb; position: relative; flex-shrink: 0; background: #fff; }
.ex  { border: 2px solid #333; }
.gl  { position: absolute; top: 50%; left: 0; width: 100%; height: 1px; background: #e5ddd2; }
.gv  { position: absolute; left: 50%; top: 0; height: 100%; width: 1px; background: #e5ddd2; }
@media print {
  .print-bar { display: none; }
  body { padding: 0; }
}
</style>
</head>
<body>
<div class="print-bar">
  <button class="print-btn" onclick="window.print()">🖨 In / Lưu PDF</button>
  <span class="print-hint">Chọn "Save as PDF" trong hộp thoại in để lưu file</span>
</div>
<h1>${lessonTitle ? lessonTitle + ' · ' : ''}漢字練習</h1>
${rowsHTML}
<script>
window.onload = function() {
  try {
${initJS}
  } catch (e) { console.error(e); }
};
<\/script>
</body>
</html>`;
  }
}
