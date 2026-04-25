const esc = s => (s || '').replace(/'/g, "&apos;").replace(/"/g, '&quot;');

function renderMarkdown(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
    .replace(/^[-•] /gm, '• ')
    .replace(/\n/g, '<br>');
}
