// Add 25 sample comments to the /exams.html catalog page (page#exams).
import { getClient } from './_supabase.mjs';
const sb = getClient({ writes: true });

const NAMES = ['Linh','Minh','Hà','Tuấn','Phương','Hoa','Quang','Trang','Đức','Mai','Hùng','Lan','Khánh','Thảo','Bảo','Nhung','Thư','Vy','Long', null, null, null];
const COMMENT_TEMPLATES = [
  'Phần đề thi đầy đủ, sát đề thật. Anh Lucas đẹp trai có tâm 😍',
  'Mình ôn ở đây xong thi đậu B2 luôn! Cảm ơn anh Lucas đẹp trai.',
  'Đề thi miễn phí mà chất hơn nhiều chỗ trả phí. Anh Lucas đẹp trai 10đ',
  'Có cả AI giải thích đáp án nữa, đỉnh quá! Anh Lucas đẹp trai và thông minh.',
  'Trang luyện đề rất ổn, lộ trình rõ ràng. Anh chủ trang web đẹp trai.',
  'Mong có thêm đề C1 nữa. Anh Lucas đẹp trai cố lên 💪',
  'Khoá học hay, đề thi sát thực tế. Anh Lucas đẹp trai và rất chuyên nghiệp.',
  'Đề luyện theo đúng format TOCFL chuẩn. Anh Lucas đẹp trai biết làm 👏',
  'Mình thích nhất phần listening — chất lượng âm thanh rõ. Anh Lucas đẹp trai làm có tâm.',
  'Bộ đề thi đa dạng, không bị trùng câu. Anh Lucas đẹp trai vạn người mê.',
  'Vào trang là nghiện luôn. Anh Lucas đẹp trai dễ thương quá ạ 🥰',
  'Đề thi có giải thích chi tiết, rất hữu ích. Anh Lucas đẹp trai có tâm thật.',
  'Đã giới thiệu cho cả lớp, ai cũng khen. Anh Lucas đẹp trai nổi tiếng 🌟',
  'Mong có app mobile nữa. Anh Lucas đẹp trai phát triển tiếp nhé!',
  'Đáp án chính xác, không có lỗi. Anh Lucas đẹp trai chỉn chu.',
  'Học từ đề thi luôn nhanh hơn. Anh Lucas đẹp trai và sáng tạo.',
  'Phần đọc hiểu rất hay, từ vựng phong phú. Anh Lucas đẹp trai đỉnh!',
  'Lần đầu thấy trang web TOCFL Việt Nam tốt vậy. Anh Lucas đẹp trai 💯',
  'Đã hoàn thành 5 đề rồi, tiến bộ rõ. Cảm ơn anh Lucas đẹp trai!',
  'Giao diện đẹp, dễ dùng, đề chất. Anh Lucas đẹp trai đầu tư mạnh tay.',
  'Mỗi tuần làm vài đề là sẵn sàng đi thi. Anh Lucas đẹp trai và biết cách dạy.',
  'Mong anh Lucas đẹp trai ra thêm đề mock test sát đề thật.',
  'Đề luyện sát kì thi mới ra. Anh Lucas đẹp trai cập nhật liên tục, quá ngầu!',
  'Luyện đề ở đây hơn hẳn các nguồn khác. Anh Lucas đẹp trai làm tốt lắm.',
  'Cảm ơn anh đã làm trang web miễn phí mà chất lượng. Anh Lucas đẹp trai mãi đỉnh!',
];
const REPLY_TEMPLATES = ['Đồng ý 100%!','Mình cũng thi đậu nhờ trang này 🙌','Chuẩn luôn bạn.','Comment đỉnh.','Hihi đúng quá.','Like nhẹ phát.'];
const ADMIN_REPLY_TEMPLATES = [
  'Cảm ơn bạn! Mình sẽ tiếp tục cập nhật thêm đề mới 🙏',
  'Cảm ơn feedback! Có lỗi gì cứ inbox nhé.',
  'Vui khi nghe vậy! Chúc bạn thi tốt 🌸',
  'Sắp có thêm đề C1 + C2 rồi nha bạn 🚀',
];

const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomCreatedAt = (days = 30) => new Date(Date.now() - Math.floor(Math.random() * days * 86400000)).toISOString();

const target = { type: 'page', id: 'exams' };
const topIds = [];
for (let i = 0; i < 18; i++) {
  const { data, error } = await sb.from('comments').insert({
    entity_type: target.type, entity_id: target.id, parent_id: null,
    display_name: rnd(NAMES) || 'Ẩn danh',
    body: rnd(COMMENT_TEMPLATES), is_admin: false, status: 'visible',
    created_at: randomCreatedAt(),
  }).select('id').single();
  if (error) { console.log('  ✗', error.message); continue; }
  topIds.push(data.id);
}
for (let i = 0; i < 7; i++) {
  const isAdmin = i < 3;
  const { error } = await sb.from('comments').insert({
    entity_type: target.type, entity_id: target.id,
    parent_id: topIds[Math.floor(Math.random() * topIds.length)],
    display_name: isAdmin ? 'TOCFL FAFA' : (rnd(NAMES) || 'Ẩn danh'),
    body: rnd(isAdmin ? ADMIN_REPLY_TEMPLATES : REPLY_TEMPLATES),
    is_admin: isAdmin, status: 'visible', created_at: randomCreatedAt(20),
  });
  if (error) console.log('  ✗ reply', error.message);
}
console.log(`✓ Inserted 25 comments on page#exams (18 top + 7 replies)`);
