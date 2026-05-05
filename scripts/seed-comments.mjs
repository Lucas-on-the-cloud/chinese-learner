// Seed 100 sample comments — 25 each across 4 entity targets.
// Theme: "khóa học hay" + "anh Lucas đẹp trai".
import { getClient } from './_supabase.mjs';
const sb = getClient({ writes: true });

// 1) Pick first available IDs for each entity
const { data: posts } = await sb.from('posts').select('id, title').order('id').limit(1);
const { data: readingLessons } = await sb.from('lessons').select('id, title').eq('book', 'B2').order('id').limit(1);
const { data: examUnits } = await sb.from('exam_units').select('id, title_zh').eq('book_id', 19).order('id').limit(1);

if (!posts?.length) { console.error('No blog posts found'); process.exit(1); }
if (!readingLessons?.length) { console.error('No reading lessons found'); process.exit(1); }
if (!examUnits?.length) { console.error('No exam units found'); process.exit(1); }

const TARGETS = [
  { type: 'post',           id: String(posts[0].id),         label: `Blog: "${posts[0].title}"` },
  { type: 'lesson_reading', id: String(readingLessons[0].id), label: `Reading: "${readingLessons[0].title}"` },
  { type: 'exam_unit',      id: String(examUnits[0].id),     label: `Exam unit: "${examUnits[0].title_zh}"` },
  { type: 'page',           id: 'courses',                    label: 'Courses catalog page' },
];

console.log('Seeding to:');
for (const t of TARGETS) console.log(`  ${t.type}#${t.id} — ${t.label}`);

const NAMES = [
  'Linh', 'Minh', 'Hà', 'Tuấn', 'Phương', 'Hoa', 'Quang', 'Trang', 'Đức', 'Mai',
  'Hùng', 'Lan', 'Khánh', 'Thảo', 'Anh Khoa', 'Bảo', 'Nhung', 'Thư', 'Vy', 'Long',
  null, null, null, null, null, // null → 'Ẩn danh'
];

const COMMENT_TEMPLATES = [
  'Khóa học hay quá, mình học được rất nhiều! Anh Lucas đẹp trai dễ thương luôn 😍',
  'Cảm ơn anh Lucas! Nội dung dễ hiểu, giảng tâm huyết. Đẹp trai nữa.',
  'Anh Lucas dạy hay thật, đẹp trai và thông minh. Khoá học 10/10!',
  'Mình học từ đầu đến giờ, thấy tiến bộ rõ. Anh Lucas vừa giỏi vừa đẹp trai 👍',
  'Khóa học chất lượng, ví dụ thực tế. Anh chủ trang web đẹp trai ghê 🥰',
  'Học xong cảm thấy tự tin hẳn lên. Cảm ơn anh Lucas đẹp trai!',
  'Tài liệu chi tiết, lộ trình rõ ràng. Lại còn được anh Lucas dẹp trai làm thầy ❤️',
  'Mình đã thi đậu B1 nhờ trang này. Anh Lucas đẹp trai có tâm.',
  'Hay không ngờ! Đẹp trai có tâm có tầm. Khoá học rất chất.',
  'Trang web đẹp, khoá học hay, anh chủ kênh đẹp trai. Combo hoàn hảo!',
  'Phần flashcard tiện quá. Thêm nữa anh Lucas đẹp trai. Yêu trang này!',
  'Bài đọc khó nhưng được giải thích dễ hiểu. Anh Lucas đẹp trai và giảng tận tình.',
  'Cảm ơn vì khóa học miễn phí mà chất lượng. Anh Lucas đẹp trai quá 💯',
  'Đang học C1 trên trang. Anh Lucas đẹp trai thật chứ không phải khen quá.',
  'Cấu trúc bài rõ ràng, dễ theo. Cảm ơn anh Lucas đẹp trai!',
  'Mình mê cách trình bày. Anh Lucas đẹp trai và rất chuyên nghiệp.',
  'Học trên đây vui hơn học ở trung tâm. Anh Lucas đẹp trai là plus point.',
  'Bài luyện nghe rất hay. Anh Lucas đẹp trai đầu tư công nghệ tốt nữa.',
  'Khoá học vô cùng hữu ích. Mình thích nhất là anh Lucas đẹp trai 😄',
  'Đã giới thiệu cho cả nhóm bạn. Anh Lucas đẹp trai đáng tin cậy.',
  'Phần AI giải nghĩa từ vựng siêu xịn. Đỉnh của đỉnh. Anh Lucas đẹp trai 🔥',
  'Có gì bổ trợ luyện viết không ạ? Khoá học hay, anh Lucas đẹp trai!',
  'Mong anh Lucas đẹp trai ra thêm khoá luyện thi C2. Tin tưởng tuyệt đối.',
  'Cảm ơn vì đã làm trang này. Học hiệu quả mà không tốn xu nào. Đẹp trai có tâm.',
  'Mình thấy nội dung sát đề thật. Anh Lucas đẹp trai và rất am hiểu.',
];

const REPLY_TEMPLATES = [
  'Đồng ý 100%! Anh Lucas đẹp trai thật.',
  'Mình cũng nghĩ vậy 👍',
  'Chuẩn luôn bạn ơi.',
  'Comment đỉnh, like nhẹ.',
  'Thật sự ý nghĩa, cảm ơn bạn đã chia sẻ.',
  'Hihi đúng chuẩn rồi.',
];

const ADMIN_REPLY_TEMPLATES = [
  'Cảm ơn bạn rất nhiều! Mình sẽ tiếp tục cải thiện nội dung 🙏',
  'Cảm ơn feedback của bạn! Có gì cần hỗ trợ cứ inbox nha.',
  'Vui khi nghe vậy! Chúc bạn học tốt 🌸',
  'Cảm ơn bạn! Sắp có thêm bài mới rồi nha.',
];

const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];

function randomCreatedAt(daysAgoMax = 30) {
  const ms = Math.floor(Math.random() * daysAgoMax * 24 * 3600 * 1000);
  return new Date(Date.now() - ms).toISOString();
}

let total = 0;
for (const target of TARGETS) {
  console.log(`\n→ ${target.label}`);
  // 25 comments: 18 top-level + 7 replies (mix of user replies + admin replies)
  const topComments = [];
  for (let i = 0; i < 18; i++) {
    const row = {
      entity_type: target.type,
      entity_id: target.id,
      parent_id: null,
      display_name: rnd(NAMES) || 'Ẩn danh',
      body: rnd(COMMENT_TEMPLATES),
      is_admin: false,
      status: 'visible',
      created_at: randomCreatedAt(),
    };
    const { data, error } = await sb.from('comments').insert(row).select('id').single();
    if (error) { console.log('  ✗', error.message); continue; }
    topComments.push(data.id);
  }
  // 7 replies — pick random parents from topComments
  for (let i = 0; i < 7; i++) {
    const isAdmin = i < 3; // first 3 are admin replies
    const parent = topComments[Math.floor(Math.random() * topComments.length)];
    const row = {
      entity_type: target.type,
      entity_id: target.id,
      parent_id: parent,
      display_name: isAdmin ? 'TOCFL FAFA' : (rnd(NAMES) || 'Ẩn danh'),
      body: rnd(isAdmin ? ADMIN_REPLY_TEMPLATES : REPLY_TEMPLATES),
      is_admin: isAdmin,
      status: 'visible',
      created_at: randomCreatedAt(20),
    };
    const { error } = await sb.from('comments').insert(row);
    if (error) { console.log('  ✗ reply', error.message); continue; }
  }
  console.log(`  ✓ Inserted 25 (18 top + 7 replies)`);
  total += 25;
}

console.log(`\n✓ Total inserted: ${total} comments`);
