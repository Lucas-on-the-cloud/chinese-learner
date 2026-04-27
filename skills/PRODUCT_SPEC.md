# TOCFL FAFA — Tài liệu sản phẩm và kiến trúc

> Tài liệu này mô tả mục đích, kiến trúc, mô hình dữ liệu, và lộ trình phát triển của ứng dụng TOCFL FAFA. Dùng cho cả developer (con người và AI) khi xây dựng tính năng mới, để mọi người hiểu cùng một bức tranh.

**Trạng thái:** Sống — cập nhật cùng mỗi commit lớn. Ngày cập nhật gần nhất: 2026-04-27.
**Ngôn ngữ:** Mã nguồn và tài liệu kỹ thuật bằng tiếng Anh; UI và nội dung sản phẩm bằng tiếng Việt.

---

## Mục lục

1. [Mục đích sản phẩm](#1-mục-đích-sản-phẩm)
2. [Người dùng và vai trò](#2-người-dùng-và-vai-trò)
3. [Kỹ năng đọc — luồng học](#3-kỹ-năng-đọc--luồng-học)
4. [Kỹ năng nghe — luồng học](#4-kỹ-năng-nghe--luồng-học)
5. [Cấu trúc khóa học](#5-cấu-trúc-khóa-học)
6. [Hệ thống flashcard](#6-hệ-thống-flashcard)
7. [Mô hình thanh toán và kích hoạt](#7-mô-hình-thanh-toán-và-kích-hoạt)
8. [Blog và nội dung miễn phí](#8-blog-và-nội-dung-miễn-phí)
9. [Quy trình admin nhập bài](#9-quy-trình-admin-nhập-bài)
10. [Mô hình dữ liệu (database schema)](#10-mô-hình-dữ-liệu-database-schema)
11. [Kiến trúc kỹ thuật](#11-kiến-trúc-kỹ-thuật)
12. [Khoảng trống hiện tại và lộ trình](#12-khoảng-trống-hiện-tại-và-lộ-trình)
13. [Phụ lục: từ điển thuật ngữ](#13-phụ-lục-từ-điển-thuật-ngữ)

---

## 1. Mục đích sản phẩm

TOCFL FAFA là ứng dụng học tiếng Trung phồn thể (繁體中文, dùng tại Đài Loan) dành cho người Việt, tập trung vào hai kỹ năng chính của kỳ thi TOCFL: **đọc** và **nghe**.

### 1.1. Triết lý sản phẩm
- **Học theo ngữ cảnh, không học từ rời rạc.** Mọi từ vựng phải gắn với một bài đọc/nghe cụ thể.
- **AI là trợ lý, không thay thế giáo trình.** AI tạo từ vựng, giải thích, trò chuyện — nhưng nguồn nội dung gốc luôn từ giáo trình thật.
- **Miễn phí trước, trả phí sau.** Người học phải cảm nhận được giá trị (qua các khóa "chim mồi") trước khi quyết định mua.
- **Hỗ trợ đa kênh xuất.** Học viên muốn dùng Anki, in ra giấy, hay học trên web — đều phải được.

### 1.2. Phạm vi (in scope)
- Đọc bài học: chữ Hán + Pinyin + tiếng Việt xen kẽ, highlight, AI từ vựng, chatbox, viết chữ.
- Nghe bài học: nghe chép chính tả, transcript đồng bộ, AI từ vựng, chatbox.
- Flashcard cá nhân với cấu trúc theo khóa/bài/đoạn.
- Xuất CSV cho Anki và in worksheet luyện viết.
- Blog kiến thức miễn phí.
- Admin nhập khóa học (hiện tại: file upload + AI parse; tương lai: OCR từ textbook ảnh).
- Hệ thống activation code thủ công cho khóa trả phí.

### 1.3. Ngoài phạm vi (out of scope, hiện tại)
- Kỹ năng nói và viết (TOCFL không thi 2 kỹ năng này như chính, nên không ưu tiên).
- Cộng đồng/diễn đàn người dùng.
- Mobile app native (web responsive là đủ cho giai đoạn này).
- Thanh toán online tự động (giai đoạn này admin xử lý thủ công qua activation code).

---

## 2. Người dùng và vai trò

### 2.1. Ba trạng thái auth
| Trạng thái | Đặc điểm | Truy cập được gì |
|---|---|---|
| **Anonymous** | Chưa đăng nhập, có session ẩn danh từ Supabase | Khóa miễn phí, blog, dùng AI nếu có API key của riêng họ |
| **Authenticated** | Đăng nhập qua Google OAuth (hoặc magic link sau này) | Tất cả khóa miễn phí + đồng bộ flashcard cross-device + tiến độ học |
| **Admin** | User thường được nâng quyền qua flag trong DB | Mọi quyền user + nhập khóa học + duyệt blog + cấp activation code |

### 2.2. User journey điển hình
1. Vào website lần đầu (anonymous), đọc blog, xem khóa miễn phí cấp 1.
2. Thấy hữu ích, tạo flashcard. Hệ thống nhắc đăng nhập để đồng bộ.
3. Đăng nhập Google. Flashcard và tiến độ ẩn danh được merge vào tài khoản thật.
4. Học hết khóa cấp 1-3 miễn phí.
5. Muốn mua khóa cấp 4. Liên hệ admin (qua chat widget, form, email).
6. Admin gửi activation code random.
7. User dán code vào trang "Kích hoạt khóa học". Khóa được mở.
8. Sử dụng khóa trả phí cho đến khi hết hạn (nếu có hạn) hoặc vĩnh viễn.

### 2.3. Quy tắc về vai trò
- Vai trò admin lưu trong cột `role` của bảng `profiles`, không phải ở client-side.
- Mọi check admin phải dùng RLS policy của Postgres, không tin client.
- Một người có thể vừa là admin vừa là user (admin cũng học).

---

## 3. Kỹ năng đọc — luồng học

### 3.1. Một bài đọc gồm những gì
- **Tiêu đề** (tiếng Việt mô tả nội dung, ví dụ "Thói quen sinh viên")
- **Đoạn chữ Hán** (phồn thể Đài Loan)
- **Pinyin** tương ứng từng dòng
- **Bản dịch tiếng Việt**
- **Mô tả ngắn** (description) cho trang danh sách

Format hiển thị hiện tại là HTML thuần. Nội dung lưu trong DB dạng plain text với newline để chia đoạn. **Trong tương lai chuyển sang Markdown** cho bài đọc — cho phép admin chèn ảnh minh họa, bảng, bold/italic.

### 3.2. Tính năng đang hoạt động
- Hiển thị xen kẽ chữ Hán và Pinyin (interleaved)
- Toggle giữa "chữ + pinyin", "chỉ tiếng Việt", và "cả hai cạnh nhau"
- Highlight đoạn được chọn (4 màu khác nhau để đánh dấu)
- AI tạo 15-25 từ vựng thiết yếu từ ngữ cảnh bài đọc
- Chatbox AI hỏi đáp về bài đọc (context-aware)
- Modal luyện viết chữ Hán với Hanzi Writer (xem animation, chấm điểm khi quiz)
- Add từ vào flashcard
- Xuất worksheet luyện viết (in/PDF) với ô vuông kẻ caro
- Xuất CSV để import Anki

### 3.3. Câu hỏi và đáp án sau bài đọc

Mỗi bài đọc có thể đính kèm bộ câu hỏi trắc nghiệm (giống format thi TOCFL thật). Đây là phần quan trọng để học viên kiểm tra hiểu bài.

**Cấu trúc một câu hỏi:**
- Đề bài (chữ Hán hoặc tiếng Việt)
- 4 đáp án A, B, C, D (chữ Hán)
- Đáp án đúng (1 trong 4)
- Giải thích chuẩn từ admin (optional, có thể bỏ qua)

**Flow trải nghiệm:**
1. User đọc bài xong, bấm "Làm bài tập"
2. Hệ thống hiện câu hỏi, user chọn đáp án
3. Sau khi submit: hiện đáp án đúng, đánh dấu đáp án user chọn
4. Nếu user chọn sai (hoặc bấm "Hỏi AI"): AI giải thích **tại sao đáp án đúng là đúng** dựa trên ngữ cảnh bài đọc, **tại sao đáp án user chọn là sai**
5. Lưu kết quả vào `quiz_attempts` để tracking

**Tích hợp AI giải thích:**
- AI nhận: bài đọc gốc + câu hỏi + đáp án đúng + đáp án user chọn
- AI trả về giải thích tiếng Việt: "Đáp án đúng là B vì trong đoạn 2, tác giả nói... Đáp án A của bạn sai vì..."
- Cache giải thích trong DB cho cặp (question_id + selected_answer) để lần sau user khác chọn cùng đáp án sai thì không cần gọi AI nữa — tiết kiệm token

**Lợi ích:**
- Học viên không chỉ biết đúng/sai mà hiểu **tại sao**
- Tận dụng ngữ cảnh bài đọc, AI có cơ sở để giải thích chính xác
- Cache giúp giảm chi phí AI khi nhiều user cùng làm sai một câu

### 3.4. Tính năng cần xây
- [ ] **Hệ thống câu hỏi và đáp án + AI giải thích** (xem 3.3)
- [ ] **TTS (text-to-speech) cho từ và câu** — click để nghe phát âm
- [ ] **Pinyin tone coloring** — màu hóa theo tone (1=đỏ, 2=cam, 3=xanh lá, 4=xanh dương)
- [ ] **Reading time tracker** — tính thời gian đọc, hiển thị streak
- [ ] **Cloze deletion quiz** — sinh tự động từ câu ví dụ, người dùng điền từ còn thiếu
- [ ] **Lưu highlight về DB** — hiện tại highlight mất khi reload trang

---

## 4. Kỹ năng nghe — luồng học

### 4.1. Hai phương pháp chính
**Phương pháp 1: Nghe chép chính tả (dictation)**
- User nghe audio segment ngắn (1-3 câu)
- Gõ lại những gì nghe được
- Hệ thống chấm điểm so với transcript gốc, hiển thị diff
- Lưu điểm vào `listening_progress`

**Phương pháp 2: Nghe có transcript đồng bộ**
- Audio chạy song song với transcript chữ Hán + Pinyin + Việt
- Highlight câu/từ đang phát ra (karaoke-style)
- User vừa nghe vừa đọc để hiểu

### 4.2. Tích hợp với AI (chia sẻ với phần đọc)
- Cùng AI generate vocab từ transcript bài nghe
- Cùng chatbox AI hỏi đáp về nội dung bài nghe
- Cùng add vocab vào flashcard

### 4.3. Audio segment là đơn vị nhỏ nhất
Một bài nghe (`lesson` trong khóa nghe) chia thành nhiều `audio_segments`. Mỗi segment có:
- File audio (lưu trên Supabase Storage)
- Transcript chữ Hán
- Pinyin
- Bản dịch Việt
- `start_sec`, `end_sec` — timestamp trong file audio gốc (cho karaoke sync)
- Sort order trong bài

**Cách tạo segment:** Admin upload file audio → gọi **Whisper API của OpenAI** (đã tích hợp sẵn) với `model=whisper-1`, `language=zh`, `prompt=繁體中文，臺灣用語，請使用繁體字`, `response_format=verbose_json`.

Whisper trả về danh sách segments với timestamp `start`/`end` chính xác đến phần trăm giây — đây là nền tảng để làm **karaoke sync** sau này (highlight chữ đang phát đồng bộ với audio).

Sau khi Whisper transcribe xong:
- Admin review/sửa lỗi phồn thể (Whisper đôi khi viết giản thể dù đã prompt phồn thể)
- Admin thêm pinyin và bản dịch Việt cho từng segment (có thể dùng AI assist)
- Save vào DB

### 4.4. Tính năng cần xây
- [ ] Karaoke highlight đồng bộ thời gian (cần lưu timestamp cho từng từ/câu)
- [ ] Tốc độ phát điều chỉnh được (0.5x — 1.5x)
- [ ] A-B loop để nghe đi nghe lại đoạn ngắn
- [ ] Lưu lịch sử dictation (lần này gõ sai từ nào)

---

## 5. Cấu trúc khóa học

### 5.1. Phân cấp 4 tầng
```
Course (khóa học lớn — ví dụ "TOCFL B1")
  └── SubCourse (khóa con — "B1 Đọc" hoặc "B1 Nghe")
       └── Lesson Group (bài học — "Bài 1", "Bài 2", "Bài 3")
            └── Lesson Section (bài đọc/nghe nhỏ — "Đoạn 1", "Đoạn 2")
```

**Ví dụ cụ thể:**
- Course: "TOCFL Band B"
  - SubCourse: "Band B - Đọc"
    - Lesson Group: "Bài 1: Cuộc sống đại học"
      - Section: "Thói quen sinh viên"
      - Section: "Đi làm hay đi học"
    - Lesson Group: "Bài 2: Học bổng"
      - Section: "Xin học bổng"
  - SubCourse: "Band B - Nghe"
    - Lesson Group: "Bài 1: Hội thoại sinh viên"
      - Section: với audio + transcript

### 5.2. Cách hiện tại đang lưu
- `courses` table — Course
- `course_books` table — link Course với Book (Book đóng vai trò SubCourse trong lúc này)
- `lessons` table — có cột `book` để biết thuộc SubCourse nào
- Các bài nhỏ trong cùng Lesson Group được nhóm bằng prefix trong title (` · ` separator)

**Vấn đề:** Cấu trúc hiện tại trộn 2 khái niệm "Lesson Group" và "Section" vào cùng bảng `lessons`, dùng convention naming để phân biệt. Khó query, khó scale. Cần refactor — xem section [Mô hình dữ liệu](#10-mô-hình-dữ-liệu-database-schema) bên dưới.

### 5.3. Trạng thái khóa học
Mỗi Course/SubCourse có:
- `published` (boolean) — admin có thể giấu bản nháp
- `is_free` (boolean) — khóa chim mồi miễn phí
- `price` (số nguyên hoặc null) — giá VND
- `level` (1-6) — cấp độ TOCFL tương ứng
- `cover_url`, `description`, `display_name`

### 5.4. Quy tắc truy cập
- Khóa `is_free = true`: ai cũng vào được (kể cả anonymous)
- Khóa `is_free = false`: chỉ user có entry trong `enrollments` mới vào được
- Admin luôn vào được mọi khóa

---

## 6. Hệ thống flashcard

### 6.1. Cấu trúc song song với khóa học
Khu vực flashcard mirror cấu trúc khóa học, chỉ khác:
```
Course → SubCourse → Lesson Group (vocab của bài 1, 2, 3) → Section (vocab của đoạn 1, 2, 3)
```

User mở flashcard ra thấy:
- Theo khóa lớn (toàn bộ vocab của TOCFL B)
- Theo SubCourse (vocab Band B - Đọc)
- Theo bài (vocab bài 1)
- Theo đoạn (vocab đoạn 1 của bài 1)
- Theo loại "user-added" (từ tự thêm)

### 6.2. Hai loại flashcard
**Flashcard từ bài đọc** (`from_reading = true`)
- Sinh từ AI khi user bấm "Phân tích & tạo từ vựng"
- Liên kết với `lesson_id` và `book_name`
- Có example sentence và pinyin/meaning của ví dụ

**Flashcard tự thêm** (`custom = true`)
- User tự thêm qua chatbox ("add 漢字") hoặc qua selection bar
- AI tự enrich với pinyin + meaning + example
- Vẫn có thể gắn với lesson nếu user thêm trong bài đọc

### 6.3. Tính năng SRS (chưa có, ưu tiên cao)
Hiện tại flashcard linear — show tất cả theo thứ tự. Cần thêm:
- 4 trường mới mỗi card: `ease`, `interval`, `reps`, `due_date`
- 4 nút rating: Again / Hard / Good / Easy
- Filter chỉ hiện cards `due_date <= today`
- Algorithm SM-2 (~25 dòng JS)
- Dashboard "X thẻ đến hạn ôn hôm nay"

### 6.4. Xuất dữ liệu
- CSV — đã có
- **Anki .apkg** — chưa có, cần thêm (dùng genanki-js)

---

## 7. Mô hình thanh toán và kích hoạt

### 7.1. Triết lý "freemium thủ công"
Giai đoạn hiện tại không tích hợp payment gateway tự động (Stripe/MoMo/...) vì:
- Chi phí tích hợp cao so với volume dự kiến ban đầu
- Việt Nam có nhiều phương thức thanh toán không chính thức (chuyển khoản, MoMo cá nhân, tiền mặt)
- Quan hệ admin-học viên còn cá nhân ở giai đoạn đầu

→ Giải pháp: **activation code thủ công**.

### 7.2. Flow thanh toán end-to-end
1. User thấy khóa trả phí, bấm "Mua khóa này"
2. UI hiện thông tin liên hệ admin (Zalo, Messenger, email) hoặc form gửi
3. User chuyển khoản theo hướng dẫn
4. Admin xác nhận → vào dashboard admin → tạo activation code random
5. Admin gửi code cho user
6. User vào trang "Kích hoạt", dán code
7. Hệ thống verify code → tạo entry trong `enrollments` → mở khóa

### 7.3. Quy tắc activation code
- Code random 12-16 ký tự (alphanumeric, không có ký tự dễ nhầm như `0`/`O`, `l`/`I`)
- Mỗi code gắn với một `course_id` cụ thể
- Mỗi code chỉ dùng được 1 lần (`used_at` timestamp)
- Mỗi code có hạn sử dụng (ví dụ 30 ngày kể từ tạo) — sau đó phải sinh code mới
- Code có optional `intended_user_email` — nếu set, chỉ user có email đó kích hoạt được
- Sau khi activate: ghi log để tracking ai-mua-khóa-nào-ngày-nào

### 7.4. Mở rộng tương lai
Khi volume đủ lớn, có thể thay activation code bằng:
- Stripe/Paddle cho user quốc tế
- VNPay/MoMo cho user Việt Nam
- Subscription tháng/năm thay vì mua đứt

Cấu trúc DB cần linh hoạt để hỗ trợ cả hai mô hình song song.

---

## 8. Blog và nội dung miễn phí

### 8.1. Mục đích
- Marketing content (SEO, kéo organic traffic)
- Cung cấp giá trị miễn phí (mẹo học, kinh nghiệm thi, văn hóa Đài Loan)
- Xây dựng uy tín admin/giảng viên

### 8.2. Cấu trúc đã có
Bảng `posts` với: `title`, `slug`, `excerpt`, `content`, `cover_url`, `category`, `author`, `published`, `sort_order`, `created_at`.

### 8.3. Tính năng cần thêm
- [ ] Markdown rendering cho content (hiện tại chắc đang dùng HTML)
- [ ] Comment hoặc reaction đơn giản
- [ ] Related posts (cùng category)
- [ ] RSS feed
- [ ] Open Graph tags để share Facebook/Zalo đẹp

---

## 9. Quy trình admin nhập bài

### 9.1. Hiện tại — File upload + AI parse
- Admin upload file text/markdown
- AI (Claude/GPT) parse ra structure: tách title, chữ Hán, pinyin, dịch
- Admin review/sửa, bấm Save → insert vào `lessons`

### 9.2. Tương lai — OCR từ textbook ảnh
**Đây là tính năng quan trọng để scale.** Giáo trình TOCFL phần lớn là sách giấy, scan ra ảnh.

Workflow đề xuất:
1. Admin upload nhiều ảnh trang sách
2. Service OCR (Google Vision API, Azure OCR, hoặc Claude vision) extract text
3. AI structure text thành lesson format
4. Admin review/sửa thủ công những chỗ OCR sai
5. Save vào DB

**Lưu ý:**
- OCR tiếng Trung phồn thể có độ chính xác thấp hơn giản thể, cần test kỹ provider
- Pinyin trong textbook thường nhỏ và có dấu thanh — dễ OCR sai
- Cần tool admin để sửa lỗi OCR nhanh (UI đặc biệt: ảnh gốc + text extracted, click để sửa)

### 9.3. Audio segment cho khóa nghe
- Admin upload file audio (mp3/m4a)
- **Gọi Whisper API của OpenAI** để transcribe tự động (✓ đã tích hợp tại `admin/index.html`, phần Listening)
  - Model: `whisper-1`, Language: `zh`, prompt: `繁體中文，臺灣用語，請使用繁體字`
  - Response format: `verbose_json` — trả về `segments[]` với `text`, `start`, `end` (không cần chunk, tối đa 25MB)
- Whisper trả về segment đã chia sẵn theo câu với timestamp chính xác
- Admin review từng segment, sửa lỗi phồn thể (Whisper đôi khi viết giản thể)
- Admin thêm pinyin và bản dịch Việt cho mỗi segment (có thể nhờ AI assist)
- Lưu file audio lên Supabase Storage bucket `audio`, lưu segments vào bảng `audio_segments`
- `audio_segments` có cột `item_label` (TEXT, default 'Audio 1') để nhóm nhiều audio trong cùng một bài học

**Lưu ý chất lượng:**
- Whisper với tiếng Trung phồn thể không hoàn hảo — phải có bước review thủ công
- Audio phải clear, ít noise — audio chất lượng kém làm timestamp không chính xác
- Một số tiếng địa phương Đài Loan (台語) Whisper transcribe rất kém — chỉ dùng audio chuẩn quan thoại

### 9.4. Quyền nhập bài
- Chỉ admin (`profile.role = 'admin'`) thấy được trang `/admin/`
- RLS policies trên `lessons`, `courses`, `audio_segments`, `flashcard_templates`: chỉ admin INSERT/UPDATE/DELETE được

---

## 10. Mô hình dữ liệu (database schema)

### 10.1. Schema đề xuất (refactor từ hiện tại)

```
-- Identity
profiles (id PK = auth.uid, email, full_name, avatar_url, locale, role, created_at)

-- Course hierarchy
courses (id PK, slug, display_name, description, cover_url, level, is_free, price, published, sort_order, created_at, updated_at)

subcourses (id PK, course_id FK, type ENUM[reading, listening], display_name, description, cover_url, sort_order, published)
  -- Replaces current "books" + "course_books" pattern
  -- Mỗi course có 0..N subcourse, mỗi subcourse là Đọc hoặc Nghe

lesson_groups (id PK, subcourse_id FK, title, description, sort_order, published)
  -- "Bài 1", "Bài 2"

lesson_sections (id PK, lesson_group_id FK, title, content_zh, content_py, content_vi, content_md, sort_order, published)
  -- "Đoạn 1", "Đoạn 2" — đơn vị thực sự được hiển thị
  -- content_md cho markdown trong tương lai

-- Audio
audio_segments (id PK, lesson_section_id FK, audio_url, transcript_zh, transcript_py, transcript_vi, sort_order, duration_seconds, published)

-- Vocab (cached AI output)
vocab_cache (id PK, lesson_section_id FK UNIQUE, items JSONB, generated_at, generated_by_provider)

-- Quizzes (câu hỏi sau bài đọc)
quiz_questions (id PK, lesson_section_id FK, question_text, question_type ENUM[multiple_choice], sort_order, created_at)
  -- Mỗi bài đọc có 0..N câu hỏi

quiz_choices (id PK, question_id FK, choice_label CHAR(1), choice_text, is_correct BOOLEAN, sort_order)
  -- 4 đáp án A/B/C/D cho mỗi câu hỏi

quiz_explanations (id PK, question_id FK, selected_choice_id FK, explanation_md, generated_at, UNIQUE question+choice)
  -- Cache giải thích AI cho cặp (câu hỏi, đáp án sai user chọn)
  -- Lần đầu user chọn sai: gọi AI sinh giải thích, lưu vào đây
  -- Lần sau user khác chọn cùng đáp án: lấy từ cache, không gọi AI

quiz_attempts (id PK, user_id FK, question_id FK, selected_choice_id FK, is_correct, attempted_at)
  -- Tracking từng lần user làm bài để analytics

-- User data
user_flashcards (id PK, user_id FK, char, pinyin, meaning, example_zh, example_pinyin, example_vi, lesson_section_id FK NULL, source ENUM[reading, custom], ease, interval, reps, due_date, created_at)

reading_progress (user_id, lesson_section_id, completed_at, time_spent_seconds, PRIMARY KEY user+section)

listening_progress (user_id, audio_segment_id, score_pct, attempts, last_attempted_at, PRIMARY KEY user+segment)

-- AI quota tracking
ai_usage (id PK, user_id FK, date, feature ENUM[vocab, chat, quiz_explain, transcribe], tokens_used, cost_usd, created_at)
  -- INSERT mỗi lần gọi AI thành công, dùng để tính quota theo ngày
  -- Index trên (user_id, date) để query nhanh

-- Enrollment & payment
enrollments (id PK, user_id FK, course_id FK, activated_at, expires_at NULL, source ENUM[free, code, payment], notes, UNIQUE user+course)

activation_codes (id PK, code UNIQUE, course_id FK, intended_email NULL, used_by_user_id FK NULL, used_at NULL, created_by_admin_id FK, created_at, expires_at)

-- Content
posts (id PK, slug, title, excerpt, content_md, cover_url, category, author_id FK, published, sort_order, created_at, updated_at)

-- Audit
audit_log (id PK, actor_id FK, action, entity_type, entity_id, metadata JSONB, created_at)
  -- Track admin actions: code generated, course created, enrollment granted
```

### 10.2. Quy tắc bắt buộc
- Mọi bảng có `id`, `created_at`, `updated_at` (trigger tự động set updated_at)
- Mọi bảng user-scoped có `user_id` reference `auth.users(id)`
- Mọi bảng có RLS policy được apply ngay khi tạo (không sau)
- Soft delete cho lessons, courses, posts (cột `deleted_at`)
- Foreign key có `ON DELETE` strategy rõ ràng (CASCADE / SET NULL / RESTRICT)

### 10.3. RLS policies tóm tắt
| Bảng | Anonymous | Authenticated | Admin |
|---|---|---|---|
| `profiles` | - | SELECT/UPDATE chỉ row của mình | All |
| `courses`, `subcourses`, `lesson_groups`, `lesson_sections` | SELECT nếu published và is_free | SELECT nếu published và (is_free hoặc có enrollment) | All |
| `audio_segments` | giống lessons | giống lessons | All |
| `user_flashcards`, `reading_progress`, `listening_progress`, `quiz_attempts`, `ai_usage` | - | All trên row của mình | SELECT all (để xem stats) |
| `quiz_questions`, `quiz_choices` | SELECT nếu lesson published | SELECT nếu lesson published và có quyền | All |
| `quiz_explanations` | - | SELECT all (cache chung); INSERT nếu chưa có | All |
| `enrollments` | - | SELECT chỉ row của mình | All |
| `activation_codes` | - | INSERT khi activate (special policy) | All |
| `posts` | SELECT nếu published | SELECT nếu published | All |
| `audit_log` | - | - | SELECT |

### 10.4. Migration từ schema hiện tại
Schema hiện tại có vài chỗ cần dọn dẹp:
- Bảng `lessons` đang vừa là Lesson Group vừa là Lesson Section (phân biệt qua title prefix). Cần tách ra.
- Bảng `books` đang đóng vai trò SubCourse nhưng không được gọi rõ ràng. Cần đổi tên.
- Cột `chinese`/`pinyin`/`vietnamese` (long form) và `zh`/`py`/`vi` (short form) đang trùng lặp. Pick một.
- Chưa có bảng `enrollments`, `activation_codes`, `profiles`. Cần tạo mới.

Migration thực hiện theo từng giai đoạn (xem [Lộ trình](#12-khoảng-trống-hiện-tại-và-lộ-trình)) chứ không nuốt một lần.

---

## 11. Kiến trúc kỹ thuật

### 11.1. Stack hiện tại
- **Frontend:** Vanilla JS, không build step, các class manager, HTML đa trang
- **Backend:** Supabase (Postgres + Auth + Storage)
- **AI text:** Vercel serverless proxy (`api/proxy.js`) → Anthropic Claude hoặc OpenAI GPT
- **AI audio:** Whisper API (`whisper-1`) gọi trực tiếp từ admin browser (file ≤ 25MB)
- **Deploy:** Vercel (frontend + proxy function)
- **Libraries:** Supabase JS v2, Hanzi Writer, Font Awesome 6

### 11.2. Layer pattern (đang chuyển dần sang)
```
View (HTML pages, manager classes render DOM)
  ↓ uses
Service (AuthService, AIService, future: SrsScheduler, OcrService)
  ↓ uses
Repository (generic Repository class wrapping Supabase tables)
  ↓ uses
Database client (one shared Supabase instance from db-config.js)
```

Chi tiết quy tắc OOP, dependency injection, event bus — xem `ENGINEERING_PRINCIPLES.md`.

### 11.3. Chuẩn font toàn site

Tất cả trang user-facing phải load đúng cặp font sau (thứ tự quan trọng):
```html
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@300;400;500;600;700&family=Noto+Serif+TC:wght@400;600;700&display=swap" rel="stylesheet">
```

- **Be Vietnam Pro** — body text, UI chung (`font-family: 'Be Vietnam Pro', sans-serif`)
- **Noto Serif TC** — brand name, heading, tiêu đề khóa học, chữ Hán trang trí

Admin pages có thể thêm JetBrains Mono cho code/monospace. Test/tool pages nội bộ không áp dụng.

### 11.4. Quy ước về trang HTML và routing

Mỗi trang là một entry point độc lập. Shared scripts import qua `<script src>`:
- `js/auth-service.js` — `AuthService` class: Google OAuth, session quản lý, profile, role check
- `js/user-session.js` — `UserSession` class: anonymous session + sync progress to Supabase

**URL routing của luồng học:**
```
/courses.html              ← danh sách Course (public, main entry point)
/course.html?id=X          ← detail 1 Course, liệt kê SubCourses chia Reading/Listening
/subcourse.html?b=BOOK     ← SubCourse Reading: danh sách Lesson Groups → Sections
/subcourse-listening.html?b=BOOK ← SubCourse Listening: groups by item_label
/reading.html?id=L&b=BOOK  ← đọc 1 Lesson Section
/listening.html?b=B&lesson=L&label=LBL ← dictation 1 Audio Label

/login.html                ← Google OAuth (redirect → dashboard sau login)
/dashboard.html            ← Interior layout sau login: sidebar + stats + continue learning
/flashcards.html           ← Flashcard học tập
/blog.html, /post.html     ← Blog
/admin/index.html          ← Admin panel (chỉ admin)
```

`library.html` đã bị xóa. `courses.html` là trang chính thay thế.

Tương lai có thể migrate sang Vite + ES modules (xem ENGINEERING_PRINCIPLES.md section 11).

### 11.4. Bảo mật

**Supabase publishable key:** Được phép public (RLS bảo vệ dữ liệu ở tầng database).

**API key của Anthropic và OpenAI — quy ước hiện tại:**
- **Một API key chung cho tất cả người dùng**, không phải user nhập key của riêng mình.
- Admin config key này ở **trang admin** (không phải trong code, không hardcode trong repo).
- Lưu trữ: hiện tại đang ở `localStorage` của admin browser → **đây là vấn đề** (xem 11.5).
- Mục đích: user không cần biết về AI provider, không cần đăng ký tài khoản OpenAI/Anthropic, mở app là dùng được.

**Hệ quả của thiết kế này:**
- App phải có proxy server để gọi AI (đã có tại `api/proxy.js`) — nếu để user gọi trực tiếp với key admin thì key sẽ leak ngay lập tức trong DevTools
- Phải có cơ chế **rate limit và quota** để tránh user lạm dụng (chi phí AI là chi phí của admin)
- Phải log usage để admin theo dõi token consumption

**AI proxy phải lock CORS** về domain production (hiện tại đang `*` — cần fix gấp).

**Không bao giờ tin client-side check;** mọi quyền truy cập dữ liệu enforce ở RLS policies của Postgres.

### 11.5. Migration path cho API key (quan trọng)

**Vấn đề hiện tại:**
Key đang ở localStorage admin → admin login từ máy khác là mất key, phải config lại. Nguy hiểm hơn: nếu admin xóa cache hoặc dùng máy public, key có thể rò rỉ.

**Giải pháp đúng (cần migrate sớm):**

```
Hiện tại:  Browser admin → localStorage → gửi key trong body request → proxy
Đề xuất:   Vercel env var → proxy đọc trực tiếp → user không bao giờ thấy key
```

**Bước migrate:**
1. Thêm key vào Vercel: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (Settings → Environment Variables)
2. Sửa `api/proxy.js`: lấy key từ `process.env` thay vì từ request body
3. Bỏ phần config key trong admin page (hoặc giữ lại như fallback override cho dev)
4. Bỏ trường `apiKey` trong request từ frontend tới proxy

**Lợi ích:**
- Key không bao giờ chạm browser → không thể leak
- Admin không phải config trên mỗi máy
- Rotate key chỉ cần update Vercel env var, không phải redeploy
- Mở đường cho rate-limit per-user vì proxy biết ai đang gọi

### 11.6. Quota và rate limiting (cần thiết kế)

Vì dùng key chung, **một user lạm dụng có thể đốt toàn bộ budget AI của admin**. Cần thiết kế:

**Tầng 1: Rate limit ở proxy (chống abuse máy móc)**
- Tối đa N request/phút per IP
- Tối đa M request/ngày per `user_id` (lấy từ Supabase JWT)
- Block IP đáng ngờ (hàng nghìn request/giờ)

**Tầng 2: Quota theo loại user (business logic)**
| Loại user | AI vocab/ngày | AI chat msg/ngày | AI giải thích quiz/ngày |
|---|---|---|---|
| Anonymous | 3 | 5 | 5 |
| Authenticated free | 10 | 30 | 20 |
| Paid (có enrollment) | 50 | 200 | 100 |
| Admin | Unlimited | Unlimited | Unlimited |

Lưu counter trong bảng `ai_usage` (user_id, date, feature, count) — reset hàng ngày qua cron job hoặc tính dựa trên `date = today`.

**Tầng 3: Soft cap với UX gracious**
- Khi user gần hết quota: hiện thông báo "Bạn còn 3 lượt AI hôm nay"
- Khi hết: gợi ý nâng cấp lên paid hoặc đợi mai
- Không block hardcore — vẫn cho user dùng các tính năng không cần AI (đọc bài, làm flashcard manual, làm quiz không cần giải thích)

---

## 12. Khoảng trống hiện tại và lộ trình

### 12.1. So sánh ý định vs thực tế *(cập nhật 2026-04-27)*

| Tính năng theo design | Trạng thái hiện tại | Khoảng trống |
|---|---|---|
| Đọc với chữ + pinyin + Việt | ✓ Đang hoạt động | Cần TTS, tone color |
| Câu hỏi và đáp án sau bài đọc | ✗ Chưa có | Cần bảng quiz + UI làm bài + AI giải thích |
| AI tạo vocab | ✓ Hoạt động | OK |
| Chatbox AI | ✓ Hoạt động | OK |
| Worksheet luyện viết | ✓ Hoạt động | OK |
| Flashcard cá nhân | ✓ Hoạt động | Thiếu SRS — gap lớn nhất |
| Xuất CSV/Anki | ⚠ Chỉ có CSV | Cần .apkg |
| Whisper transcription audio | ✓ Hoạt động ở admin | OK — gọi trực tiếp, không chunk |
| Khóa nghe dictation (listening.html) | ✓ UI hoàn chỉnh | Cần karaoke sync, A-B loop |
| `item_label` grouping cho audio | ✓ Hoạt động | OK |
| Cấu trúc 4 tầng course hierarchy | ⚠ 2 tầng dưới vẫn trộn trong `lessons` | Cần refactor schema (incremental) |
| courses.html — listing + filter | ✓ Redesigned (level + skill filter) | OK |
| course.html — Reading/Listening sections | ✓ Redesigned, tách 2 sections rõ | OK |
| Auth — Google OAuth + profiles | ✓ Hoạt động (AuthService, dashboard) | Cần RLS đầy đủ, profiles migration SQL |
| dashboard.html — interior layout | ✓ Đã build (sidebar + stats) | OK |
| is_free cho courses | ✓ Column đã add, admin UI updated | Cần SQL: `ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT false` |
| Khóa miễn phí vs trả phí (gating) | ✗ is_free hiển thị nhưng chưa gating | Cần `enrollments` table + gating logic |
| Activation code | ✗ Chưa có | Cần bảng + UI admin + UI user |
| API key dùng chung từ admin | ⚠ Có ở localStorage admin | Phải migrate sang Vercel env var |
| AI quota/rate limit | ✗ Chưa có | Critical — dùng key chung không rate limit là rủi ro |
| Blog | ✓ Hoạt động cơ bản | Cần Markdown, OG tags |
| Admin audio — Whisper transcribe | ✓ Hoạt động | OK |
| OCR từ textbook ảnh | ✗ Chưa có | Tính năng tương lai |

### 12.2. Lộ trình đề xuất *(cập nhật 2026-04-27)*

**✓ Đã hoàn thành:**
- `AuthService` class (`js/auth-service.js`) — Google OAuth, PKCE flow, profile sync, role check
- `profiles` table SQL + trigger (cần chạy trong Supabase SQL Editor)
- `dashboard.html` — interior layout với sidebar, stats, continue-learning
- `courses.html` redesign — level + skill filter, auth-aware CTA
- `course.html` redesign — Reading/Listening sections riêng biệt, progress bars
- `is_free` column trên courses table (cần SQL: `ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT false`)
- Whisper API thay thế Google STT — 1 request, không chunk, segments trả về trực tiếp
- `item_label` grouping cho audio segments
- Dictation UI redesign (listening.html) — player header, sound bars, result card

**Tiếp theo — ưu tiên cao:**

**Bước A: Security cơ bản**
- Migrate API key sang Vercel env var (xem 11.5) — hiện tại key vẫn ở localStorage admin
- Thêm rate limit ở proxy (per IP)
- Audit và apply RLS policies đầy đủ

**Bước B: Gating khóa trả phí**
- Bảng `enrollments` + `activation_codes`
- Admin UI tạo/gửi code
- User UI nhập code activate
- Gating: khóa `is_free = false` → cần enrollment để truy cập

**Bước C: SRS cho flashcard**
- Thêm 4 cột `ease`, `interval`, `reps`, `due_date`
- 4 nút rating + algorithm SM-2
- Dashboard "X thẻ đến hạn"

**Tuần 6: Mô hình thanh toán + AI quota**
- Bảng `enrollments`, `activation_codes`
- Trang admin tạo code random
- Trang user nhập code activate
- Gating cho khóa trả phí
- **Bảng `ai_usage` + quota theo loại user** (anonymous / free / paid / admin)
- Soft cap UX (thông báo gần hết quota, gợi ý nâng cấp)

**Tuần 7: Câu hỏi và đáp án**
- Bảng `quiz_questions`, `quiz_choices`, `quiz_explanations`, `quiz_attempts`
- UI làm bài cuối bài đọc
- AI giải thích đáp án sai (có cache trong `quiz_explanations`)
- Admin UI nhập câu hỏi (manual hoặc AI parse từ textbook)

**Tuần 8: Hoàn thiện kỹ năng nghe**
- Karaoke sync timestamp (dùng `start_sec`/`end_sec` từ Whisper đã có)
- Tốc độ phát điều chỉnh
- A-B loop
- Lưu lịch sử dictation

**Tuần 9: Quality of life**
- TTS audio cho từ và câu
- Tone coloring cho pinyin
- Anki .apkg export
- Reading streak counter

**Tuần 10: Tech debt và build step**
- Vite + ES modules
- Tách inline `<script>` ra file riêng
- Replace inline `onclick` bằng event delegation
- Add Playwright cho 5 critical user flows

### 12.3. Tính năng tương lai (sau MVP)
- OCR từ textbook ảnh (tuần 11+)
- AI conversation tutor (roleplay tiếng Trung)
- Cloze deletion auto-generation
- Handwriting OCR (user viết → AI đoán chữ)
- PWA / offline mode
- Mobile app (React Native hoặc PWA-as-app)
- Stripe/VNPay tích hợp tự động
- Subscription model (tháng/năm)

---

## 13. Phụ lục: từ điển thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| **TOCFL** | Test of Chinese as a Foreign Language — kỳ thi tiếng Trung phồn thể của Đài Loan |
| **Phồn thể** | 繁體 — chữ Hán truyền thống dùng tại Đài Loan, Hồng Kông |
| **Giản thể** | 简体 — chữ Hán đơn giản hóa dùng tại Trung Quốc đại lục (KHÔNG dùng trong app này) |
| **Pinyin** | Phiên âm Latin của tiếng Trung, có 4 thanh điệu |
| **SRS** | Spaced Repetition System — thuật toán xếp lịch ôn tập flashcard |
| **Course / SubCourse / Lesson Group / Section** | 4 tầng phân cấp của khóa học, từ lớn đến nhỏ |
| **Activation code** | Mã kích hoạt random do admin sinh, user dùng để mở khóa trả phí |
| **Enrollment** | Bản ghi user X đã có quyền truy cập course Y |
| **RLS** | Row Level Security — bảo mật ở tầng database, enforce ai đọc/ghi được dòng nào |
| **Anonymous session** | Session ẩn danh do Supabase tạo cho user chưa login, vẫn có user_id |
| **OCR** | Optical Character Recognition — nhận dạng chữ từ ảnh |
| **Dictation** | Nghe chép chính tả — phương pháp luyện nghe bằng cách viết lại |
| **Whisper** | API speech-to-text của OpenAI, dùng để transcribe audio thành text + timestamp |
| **Karaoke sync** | Highlight từ/câu đang phát đồng bộ với audio |
| **Quota** | Giới hạn số lần dùng AI mỗi ngày theo loại user, để kiểm soát chi phí |
| **Rate limit** | Giới hạn số request/đơn vị thời gian, chống abuse máy móc |

---

*Tài liệu này tiến hóa cùng dự án. Khi có thay đổi lớn về scope, schema, hoặc kiến trúc — sửa file này trong cùng commit. Đây là bản đồ chung cho mọi người đang xây dựng TOCFL FAFA.*
