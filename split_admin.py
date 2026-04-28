"""Split admin/index.html into separate pages + shared CSS."""
import os, re

BASE = 'public/admin'
src  = open(f'{BASE}/index.html', encoding='utf-8').read()
lines = src.split('\n')

# ── 1. Extract CSS ────────────────────────────────────────────────
css_start = next(i for i,l in enumerate(lines) if '<style>' in l)
css_end   = next(i for i,l in enumerate(lines) if '</style>' in l)
css_block = '\n'.join(lines[css_start+1:css_end])

os.makedirs(f'{BASE}/css', exist_ok=True)
open(f'{BASE}/css/admin.css', 'w', encoding='utf-8').write(css_block)
print(f'css/admin.css  — {len(css_block.splitlines())} lines')

# ── 2. Shared deps (head links) ───────────────────────────────────
HEAD_DEPS = '''\
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@300;400;500;600;700&family=Noto+Serif+TC:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <link rel="stylesheet" href="css/admin.css">
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>'''

JS_SHARED = '''\
<script src="../js/utils.js"></script>
<script src="../js/database.js"></script>
<script src="../js/config.js"></script>
<script src="../js/ai-service.js"></script>
<script src="js/core.js"></script>'''

# ── 3. Sidebar HTML (static, active class set per page) ───────────
def sidebar(active):
    items = [
        ('index',       'fa-gauge-high',    'Tổng quan',    'Dashboard'),
        ('courses',     'fa-graduation-cap','Khóa học',     'Courses'),
        ('subcourses',  'fa-book-bookmark', 'Khóa học con', 'Sub-courses'),
        ('listening',   'fa-headphones',    'Listening',    'Audio &amp; Dictation'),
        ('flashcards',  'fa-clone',         'Flashcard',    'Flashcard sets'),
        ('blog',        'fa-pen-nib',       'Blog',         'Blog posts'),
        ('settings',    'fa-key',           'Cài đặt',      'AI &amp; API'),
    ]
    nav_items = ''
    for page, icon, vi, en in items:
        href  = f'{page}.html'
        cls   = 'nav-item active' if page == active else 'nav-item'
        nav_items += f'''    <a class="{cls}" href="{href}">
      <i class="fa-solid {icon}"></i>
      <span class="nav-item-text"><span class="nav-item-vi">{vi}</span><span class="nav-item-en">{en}</span></span>
    </a>\n'''

    return f'''<aside id="sidebar">
  <div class="sb-brand">
    <div class="sb-brand-icon">學</div>
    <div>
      <div class="sb-brand-name">TOCFL <em>FAFA</em></div>
      <div class="sb-brand-sub">Admin · 管理面板</div>
    </div>
  </div>
  <nav>
    <div class="nav-label">Quản lý · Manage</div>
{nav_items}  </nav>
  <div class="sb-footer">
    <div class="user-chip">
      <div class="user-av">L</div>
      <div class="user-info">
        <div class="user-name">Lucas Hwang</div>
        <div class="user-role">Founder · Admin</div>
      </div>
    </div>
    <button class="collapse-btn" onclick="toggleSidebar()" title="Thu gọn">
      <i class="fa-solid fa-angles-left" id="collapse-icon"></i>
    </button>
  </div>
</aside>'''

# ── 4. Topbar HTML ────────────────────────────────────────────────
def topbar(crumb, title):
    return f'''  <header class="topbar">
    <div>
      <div class="crumbs">
        <span>Admin</span>
        <i class="fa-solid fa-chevron-right" style="font-size:9px;opacity:.5"></i>
        <span class="active">{crumb}</span>
      </div>
      <h1 class="page-title">{title}</h1>
    </div>
    <div class="topbar-right">
      <div class="search-box">
        <i class="fa-solid fa-magnifying-glass" style="color:#9ca3af;font-size:12px"></i>
        <input placeholder="Tìm kiếm…">
        <span class="kbd">⌘K</span>
      </div>
      <a href="/courses.html" class="primary-btn"><i class="fa-solid fa-arrow-left"></i> &nbsp;Về trang chủ</a>
    </div>
  </header>'''

# ── 5. Page template ─────────────────────────────────────────────
def page(active, title_tag, crumb, h1, content_html, extra_js='', extra_html=''):
    return f'''<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title_tag} — Admin · TOCFL FAFA</title>
{HEAD_DEPS}
</head>
<body>

{sidebar(active)}

<div id="main">
{topbar(crumb, h1)}
  <div class="content">
{content_html}
  </div>
</div>
{extra_html}
{JS_SHARED}
{extra_js}
<script>
let collapsed = false;
function toggleSidebar() {{
  collapsed = !collapsed;
  document.getElementById('sidebar').classList.toggle('collapsed', collapsed);
  document.getElementById('collapse-icon').className = collapsed
    ? 'fa-solid fa-angles-right' : 'fa-solid fa-angles-left';
}}
</script>
</body>
</html>'''

# ── 6. Extract each section from index.html ───────────────────────
def extract(id_):
    m = re.search(
        rf'<!--[^>]*{re.escape(id_).upper()}[^>]*-->\s*'
        rf'(<div id="section-{id_}".*?)'
        rf'(?=\n\s*<!--\s*──|</div><!--\s*/content)',
        src, re.DOTALL
    )
    if not m:
        # fallback: find by id
        s = src.find(f'id="section-{id_}"')
        if s < 0: return ''
        # find the closing tag by counting divs
        depth, i = 0, s
        while i < len(src):
            if src[i:i+4] == '<div': depth += 1
            elif src[i:i+6] == '</div': depth -= 1
            if depth == 0: return src[s - src[:s].rfind('<') - 1 : i + 6]
            i += 1
    return m.group(1)

# Simpler extract: between section markers
def extract2(section_id, next_marker):
    # find opening of section div
    start = src.find(f'id="section-{section_id}"')
    if start < 0: return ''
    # go back to find <div
    div_start = src.rfind('<div', 0, start)

    # find end by matching next marker
    if next_marker:
        end = src.find(next_marker, start)
    else:
        end = src.find('</div><!-- /content', start)
    if end < 0: end = len(src)
    # trim trailing whitespace but keep the closing </div>
    chunk = src[div_start:end].rstrip()
    # remove the last </div> if it belongs to the section
    return chunk

# ── Dashboard ─────────────────────────────────────────────────────
dashboard_start = src.find('id="section-dashboard"')
dashboard_end   = src.find('<!-- ── COURSES')
dashboard_html  = src[src.rfind('<div', 0, dashboard_start):dashboard_end].strip()
# remove trailing </div><!-- /section-dashboard -->
dashboard_html  = re.sub(r'\s*</div><!-- /section-dashboard -->\s*$', '', dashboard_html)

# ── Courses ───────────────────────────────────────────────────────
courses_start = src.find('<!-- ── COURSES')
courses_end   = src.find('<!-- ── SUB-COURSES')
courses_html  = src[src.find('<div id="section-courses"', courses_start):courses_end].strip()

# ── Subcourses ────────────────────────────────────────────────────
sub_start  = src.find('<!-- ── SUB-COURSES')
sub_end    = src.find('<!-- ── LISTENING')
sub_raw    = src[src.find('<div id="section-subcourses"', sub_start):sub_end].strip()
# Import overlay (needed by subcourses)
overlay_start = src.find('<!-- Import overlay')
overlay_end   = src.find('</div>\n\n<script src="../js/utils.js">')
import_overlay = src[overlay_start:overlay_end + 6] if overlay_start > -1 else ''

# ── Listening ─────────────────────────────────────────────────────
ls_start = src.find('<!-- ── LISTENING')
ls_end   = src.find('<!-- ── FLASHCARDS')
ls_html  = src[src.find('<div id="section-listening"', ls_start):ls_end].strip()

# ── Flashcards ────────────────────────────────────────────────────
fc_start = src.find('<!-- ── FLASHCARDS')
fc_end   = src.find('<!-- ── BLOG')
fc_html  = src[src.find('<div id="section-flashcards"', fc_start):fc_end].strip()

# ── Blog ─────────────────────────────────────────────────────────
bl_start = src.find('<!-- ── BLOG')
bl_end   = src.find('<!-- hidden import file')
bl_html  = src[src.find('<div id="section-blog"', bl_start):bl_end].strip()

# ── Settings / AI ─────────────────────────────────────────────────
ai_start = src.find('<!-- ── AI & API')
ai_end   = src.find('\n\n  </div><!-- /content', ai_start)
ai_html  = src[src.find('<div id="section-ai"', ai_start):ai_end].strip()

# ── 7. Remove section wrappers (strip outer div with display:none) -
def unwrap(html):
    # Remove first line (<div id="section-xxx" style="display:none;...">)
    lines = html.split('\n')
    # find and drop opening wrapper
    if lines and re.match(r'\s*<div id="section-', lines[0]):
        lines = lines[1:]
    # drop last </div> if it closes the wrapper
    while lines and lines[-1].strip() == '</div>':
        lines = lines[:-1]
        break
    # strip width:100% wrapper div if present
    result = '\n'.join(lines)
    return result

dashboard_inner = unwrap(dashboard_html)
courses_inner   = unwrap(courses_html)
sub_inner       = unwrap(sub_raw)
ls_inner        = unwrap(ls_html)
fc_inner        = unwrap(fc_html)
bl_inner        = unwrap(bl_html)
ai_inner        = unwrap(ai_html)

# ── 8. Write pages ────────────────────────────────────────────────
pages = [
    ('index', 'Dashboard', 'Tổng quan / Dashboard', 'Tổng quan',
     dashboard_inner, '',
     '<script src="js/core.js"></script>\n<script src="../js/lesson-manager.js"></script>\n<script src="../js/file-importer.js"></script>',
     ''),

    ('courses', 'Khóa học', 'Khóa học / Courses', 'Quản lý khóa học',
     courses_inner, '',
     '<script src="js/core.js"></script>\n<script src="js/courses.js"></script>',
     ''),

    ('subcourses', 'Khóa học con', 'Khóa học con / Sub-courses', 'Quản lý khóa học con',
     sub_inner, '',
     '<script src="js/core.js"></script>\n<script src="../js/lesson-manager.js"></script>\n<script src="../js/file-importer.js"></script>\n<script src="js/subcourses.js"></script>',
     import_overlay),

    ('listening', 'Listening', 'Listening / Audio & Dictation', 'Quản lý Audio',
     ls_inner, '',
     '<script src="js/core.js"></script>\n<script src="js/listening.js"></script>',
     ''),

    ('flashcards', 'Flashcard', 'Flashcard / Bộ thẻ', 'Quản lý Flashcard',
     fc_inner, '',
     '<script src="js/core.js"></script>\n<script src="js/flashcards.js"></script>',
     ''),

    ('blog', 'Blog', 'Blog / Bài viết', 'Quản lý Blog',
     bl_inner, '',
     '<script src="js/core.js"></script>\n<script src="js/blog.js"></script>',
     ''),

    ('settings', 'Cài đặt', 'AI & API / Cài đặt', 'Cài đặt AI & API',
     ai_inner, '',
     '<script src="js/core.js"></script>\n<script src="js/settings.js"></script>',
     ''),
]

for (active, title_tag, crumb, h1, content, _unused, extra_js, extra_html) in pages:
    out = page(active, title_tag, crumb, h1, content, extra_js, extra_html)
    fname = f'{BASE}/{active}.html'
    open(fname, 'w', encoding='utf-8').write(out)
    print(f'{active}.html  — {out.count(chr(10))+1} lines')

print('\nDone! Run: git add public/admin/ && git commit ...')
