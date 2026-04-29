# Phân tích vấn đề: Pipeline nhập đề thi TOCFL hiện tại

> **Context cho AI engineer:** Tài liệu này mô tả các vấn đề thực tế đã được phát hiện qua test pipeline trên sách `B1_華語文能力測驗 (進階篇)` của NTNU MTC. Mục tiêu là cung cấp đủ context để AI hiểu **tại sao** cần làm lại, không chỉ **làm gì**.

---

## 1. Tóm tắt sản phẩm & feature đang xét

**Sản phẩm:** TOCFL FAFA — webapp học tiếng Trung phồn thể (Đài Loan) cho người Việt, tập trung vào kỳ thi TOCFL 2 kỹ năng Đọc + Nghe.

**Tech stack hiện tại:**
- Frontend: Vanilla JS + HTML/CSS thuần (không build step, không React/bundler)
- Backend: Supabase (Postgres + Auth + Storage)
- Hosting: Vercel (static + 1 serverless proxy `/api/proxy.js` để bypass CORS gọi AI)
- AI: OpenAI / Anthropic Claude qua proxy
- Repo: `Lucas-on-the-cloud/chinese-learner`

**Feature đang phát triển:** Admin panel `/admin/exams.html` cho phép admin upload PDF sách đề thi → tự động OCR + parse cấu trúc → import vào DB → admin review → publish cho học viên làm bài.

**File thực thi chính:** `public/admin/js/exams.js` (~1085 dòng, 1 file gộp toàn bộ logic feature).

---

## 2. Pipeline hiện tại

```
[Admin upload PDF in browser]
        ↓
[pdf.js render mỗi trang → JPEG 1024px base64 trong browser]
        ↓
[gpt-4o-mini Vision: OCR 3 trang/call, sequential]
        ↓
[Lưu raw_text vào exam_ocr_pages (Supabase)]
        ↓
[Regex detect "Unit N" boundaries]
        ↓
[Chia text thành chunks theo Unit]
        ↓
[gpt-4o JSON mode: parse mỗi Unit → structured JSON]
        ↓
[Insert vào exam_units / exam_sections / exam_passages / exam_questions / exam_choices]
        ↓
[Admin review UI: edit câu hỏi, set đáp án thủ công, publish]
```

**Schema hiện tại** (`sql/exam_tables.sql`):
```
exam_books → exam_ocr_pages
           → exam_units → exam_sections → exam_passages → exam_questions → exam_choices
                       → exam_vocab
                       → exam_phrases
```

---

## 3. Cấu trúc thực tế của sách scan (sample đã test)

**Sách:** 華語文能力測驗關鍵詞彙 進階篇 (Band B Level 3) — NTNU MTC, 2017.

**Đặc điểm vật lý:**
- 322 trang, 71 MB
- Scan ảnh CCITT đen-trắng 400 DPI
- **Không có text layer** (pdftotext trả về rỗng)
- Metadata `Page rot: 180` (PDF.js tự handle)

**Cấu trúc nội dung thực tế:**
- **30 Unit lớn**, mỗi Unit chia thành **2-4 sub-unit** (1-1, 1-2, 1-3, 1-4...)
- **Sub-unit là đơn vị đề thi thật** (mỗi sub-unit = 1 đề mock test ~30 câu)
- Header trang (lặp ở mỗi trang): `Unit 9 購物 9-1 網路購物`
- Mỗi sub-unit gồm 2 phần lớn:
  - **A. 測驗練習** (Bài tập, ~6 trang): 5 sections
    - 一、對話聽力 (5 câu Listening MCQ — câu hỏi nằm trong audio, trang chỉ có 4 lựa chọn A/B/C/D)
    - 二、完成句子 (8 câu Sentence completion với chỗ trống `___`)
    - 三、選詞填空 (Cloze: 1-2 passages dài có blank đánh số 14-23, options ở dưới)
    - 四、材料閱讀 (Reading material **có hình ảnh**: tờ rơi, biểu đồ, danh thiếp + MCQ)
    - 五、短文閱讀 (Short essay + 3-5 MCQ)
  - **B. 關鍵詞語** (Key vocabulary, ~1-2 trang): bảng 2 cột vocab + bảng cụm từ với câu ví dụ
- **Cuối sách** (từ ~trang 219):
  - **B. 聽力對話** (Listening transcripts cho section 1 mỗi sub-unit)
  - **C. 解答說明** (Answer keys + giải thích từ vựng cho mỗi câu)

---

## 4. Các lỗi đã xác định qua test thực tế

### 🔴 P0 — Lỗi nghiêm trọng làm pipeline không thể đạt mục tiêu

#### **P0.1 — `gpt-4o-mini` HALLUCINATE options khi gặp text khó/ngắt trang**

Đây là vấn đề **không thể fix bằng prompt engineering**. Pattern lặp lại ở cả 2 sub-unit test:

**Sub-unit 9-1 (購物/網路購物), section 三、選詞填空:**
```
16. A 當年    B 當年    C 前面    D 傳遞   ← A và B trùng
17. A 這種    B 這種    C 這樣    D 這樣   ← A=B, C=D
18. A 總統    B 總統    C 歷史    D 總過   ← A và B trùng
21. A 需求    B 確定    C 修理    D 修理   ← C và D trùng
22. A 生產    B 廣告    C 廣告    D 推銷   ← B và C trùng
```

**Sub-unit 8-2 (旅行/離島旅行):**
```
13. A 離開    B 離開    C 離開    D 離開   ← cả 4 trùng nhau!
17. A 變化    B 變化    C 變化    D 變化   ← cả 4 trùng nhau!
23. A 難得    B 難得    C 難得    D 難得   ← cả 4 trùng nhau!
```

**Phân tích:** Khi vision model gặp vùng text mờ, page break, hoặc font lạ, nó **fill các options bằng từ vừa nhìn thấy** thay vì thừa nhận "không đọc được". Đây là behavior cố hữu của model nhỏ — không sửa được bằng prompt tốt hơn.

**Hậu quả:** Đề thi không thể publish — học viên chọn đáp án nào cũng sai/đúng vô nghĩa.

#### **P0.2 — Sub-unit (1-1, 1-2, 1-3, 1-4) bị gộp thành 1 Unit**

Schema hiện tại chỉ có `exam_units(unit_number)`, không có `sub_number`. Boundary detector regex:
```js
text.match(/(?:^|\n)\s*Unit\s*(\d{1,2})\b/i);
```

→ Chỉ bắt `Unit 1`, không phân biệt `1-1` vs `1-3`. Code gộp tất cả ~120 câu (4 sub-unit × ~30 câu) thành 1 chunk khổng lồ feed vào AI.

**Hậu quả:**
- AI bị truncate vì `max_tokens: 4096` không đủ
- Mất context, AI nhầm câu hỏi giữa các sub-unit
- Hardcoded `unitText.slice(0, 14000)` ở dòng 618 → nội dung bị cắt cụt

Header trang thực tế (lặp ở mỗi trang) **đã có sẵn sub-unit info**:
```
Unit 9 購物 9-1 網路購物
Unit 8 旅行 8-2 離島旅行
```
Nhưng code đang vứt đi.

#### **P0.3 — Section 4 「材料閱讀」 mất ảnh hoàn toàn**

Section 4 có các tờ rơi (`日租公寓`, `出租房間`), biểu đồ tròn (`圖1`, `圖2` về thống kê), bản đồ. Câu hỏi 24-28 hỏi trực tiếp về nội dung trong những hình này.

Code hiện tại:
- OCR chỉ extract text → text trong khung tờ rơi bị flatten, mất layout
- Biểu đồ tròn (vector image) không có text → không OCR được gì cả
- Schema có cột `exam_passages.content_image_url` **nhưng không có code path nào dùng**

**Hậu quả:** Học viên thấy câu hỏi "圖1 cho thấy 21-30 tuổi chiếm bao nhiêu %?" mà **không có biểu đồ nào** để nhìn → đề thi vô dụng.

#### **P0.4 — Đáp án phải nhập tay 100%**

Đáp án nằm ở phần `C. 解答說明` cuối sách (từ trang ~219). Code hiện set `answer: null` cho mọi câu, bắt admin click từng câu set A/B/C/D.

**Hậu quả:** Sách 30 sub-unit × 30 câu = ~900 câu → admin phải click ~900 lần. Không khả thi.

#### **P0.5 — Listening transcripts không có chỗ chứa**

Section 1 「對話聽力」 chỉ có A/B/C/D, **câu hỏi nằm trong audio**. Sách có phần `B. 聽力對話` cuối sách chứa transcript đầy đủ.

Schema hiện không có cột nào cho transcript → dù có OCR ra cũng vứt đi.

**Hậu quả:** Học viên không thể làm được section 1 vì không có audio cũng không có transcript.

#### **P0.6 — Bảng vocab section B mất dữ liệu**

Section B 「關鍵詞語」 là bảng 2 cột với 30+ từ vựng, là **giá trị cốt lõi** của sách (tên sách: "關鍵詞彙").

Test thực tế trên sub-unit 9-1: OCR ra **rỗng** — chỉ có headers `一、主題相關詞語`, `二、常用詞組`, không có bất kỳ từ vựng nào.

Test trên sub-unit 8-2: ra được vài từ nhưng **format flat, mất cấu trúc bảng**, có lỗi OCR (`對話能力` vs đúng là `對話聽力`).

**Phân tích:** OCR text-only không giữ được spatial layout của bảng. AI parse text-after không thể recover columns.

### 🟠 P1 — Lỗi chất lượng cao

#### **P1.1 — Render PDF chỉ 1024px là quá thấp cho chữ Hán phồn thể**

`exRenderPage(maxW = 1024)` rồi JPEG quality 0.80. Sách scan 400 DPI gốc bị downscale mạnh.

Chữ Hán phồn thể nhiều nét (鬱、變、響、學、體) ở mật độ này dễ nhầm. Đặc biệt câu 6-13 (sentence completion) có options ngắn 1-2 ký tự (`簽約 / 預約 / 約好 / 約會`) — sai 1 nét là sai cả nghĩa.

#### **P1.2 — `gpt-4o-mini` nhầm phồn thể → giản thể**

Prompt nhấn mạnh "Preserve Traditional Chinese" nhưng model vẫn có xu hướng output 简体: 學↔学, 體↔体, 國↔国, 關↔关, 對↔对, 寫↔写.

Học viên TOCFL (Đài Loan) thấy giản thể là biết sai ngay → mất uy tín sản phẩm.

#### **P1.3 — Multi-page passage bị fragment**

Section 三、選詞填空 (cloze) có passage dài, blank số 14-23 trải qua 2-3 trang. Test thực tế:

```
Passage (一) trang 23: blank 14-18
Passage (二) trang 23-24: blank 19-23
```

OCR khi cross page break thường:
- Mất label `(一)`/`(二)` (nhận thành `(-)`, `(-}`, `()`)
- Tách 1 passage thành 2 passage riêng
- Nhầm question MCQ độc lập với cloze blank

Test 8-2 cho thấy passage 2 của section 3 bị OCR ra như list MCQ rời:
```
19. 很想出國走，但又不想______太多天的假...
21. 跟著 68 旅行社...
```

#### **P1.4 — Câu hỏi bị MẤT ở chỗ ngắt trang**

Test 9-1: OCR thiếu hẳn câu 24 (nhảy từ 23 → 25). Câu 24 có thể đã bị merge vào passage text hoặc nằm đúng dòng cuối trang bị crop.

Hiện tại không có cơ chế detect "thiếu câu" — pipeline cứ thế save và publish.

#### **P1.5 — Boundary detection regex quá chặt và fragile**

```js
text.match(/(?:^|\n)\s*Unit\s*(\d{1,2})\b/i);
```

- OCR có thể nhận `Unit` thành `unit`, `Unrt`, `U n i t` (do giãn chữ in)
- Chỉ match `^|\n` (đầu dòng) → nếu OCR không có newline đúng chỗ → miss
- Không có fallback nếu trang đầu unit OCR lỗi → mất cả sub-unit

#### **P1.6 — Không có validation count câu hỏi**

Sách có pattern cố định: section 1 = 5, section 2 = 8, section 3 = 10, section 4 = 5-7, section 5 = 3-5, tổng ≈ 30+ câu/sub-unit. Nếu AI parse ra 12 câu → biết là sai. Code không check.

### 🟡 P2 — Vấn đề kiến trúc / scaling

#### **P2.1 — Browser của admin bị ép chạy 30+ phút**

Toàn bộ pipeline chạy trong browser admin:
- `pdf.js` parse 71MB PDF trong RAM
- Render 322 trang × ~5MB JPEG
- Gọi 110 lần API OCR (3 trang/call)
- Parse 8 unit/lần concurrent

**Hậu quả:**
- Đóng tab = mất tất cả progress
- Mobile/laptop yếu → OOM, crash
- Không retry được nếu mạng đứt giữa chừng
- Admin không thể làm việc khác trong 30 phút

#### **P2.2 — Không có job queue**

Logic `Promise.all` với pool 8 — nếu fail giữa chừng, retry chỉ có ở mức rate-limit, không có persistence. Không recover được nếu reload trang.

#### **P2.3 — Schema không có audit trail**

Không có cột:
- `verified` (admin đã review câu này chưa)
- `flag_warnings` (validation rules đã flag gì)
- `created_by`, `updated_by`, `version`
- Log AI calls (tokens, cost, latency)

→ Khi có lỗi không trace được "câu này AI nào parse, prompt version nào, cost bao nhiêu".

#### **P2.4 — JSON output loose schema**

Code dùng `response_format: { type: 'json_object' }` — chỉ ép phải là JSON valid, không ép structure. Model có thể bỏ field, sai type, lồng nested khác — không catch được.

OpenAI có `json_schema` strict mode, Anthropic có tool use với schema → đang không được dùng.

### 🔵 P3 — Gap về tính năng cuối

Pipeline xong cũng chưa thể launch vì:

#### **P3.1 — Không có frontend làm bài**
Không có file nào cho student làm exam. Cần `exam.html` với logic load → render → submit → save vào `exam_results`.

#### **P3.2 — Không có audio cho listening**
Section 1 không thể làm nếu không có audio. Sách giấy đi kèm CD/MP3, file đó user phải có riêng. Cần upload audio kèm sách hoặc dùng TTS.

#### **P3.3 — Không có giải thích đáp án**
Phần `C. 解答說明` chứa giải thích vì sao A đúng/B sai (so sánh nghĩa từ). Đây là **giá trị cốt lõi** của sách. Schema không có cột `explanation`.

---

## 5. Vấn đề gốc rễ (root cause)

Tất cả lỗi P0 và P1 đều quy về **2 root cause**:

### Root cause 1: **Sai lựa chọn công cụ OCR**

`gpt-4o-mini` là **general-purpose LLM**, không phải OCR engine chuyên dụng. Hậu quả:
- Hallucinate khi gặp ảnh khó (vs discriminative OCR model trả về confidence score)
- Không có bounding box pixel-level (vs Document AI có)
- Không native handle bảng (vs Document AI có `tables[]` với rows/cols)
- Không native handle hình (vs có `visual_element` type)
- Tokens đắt cho công việc đáng lý chỉ cần specialized model

**Pipeline hiện tại đặt trên giả định "OCR ra text rồi parse text".** Giả định này SAI với loại sách scan đầy bảng + hình + multi-column này. Bước OCR text-only đã **vứt đi không thể khôi phục** các thông tin: layout bảng, ảnh tờ rơi/biểu đồ, page boundary, vị trí blank.

### Root cause 2: **Thiếu validation và human-in-the-loop**

Kể cả OCR tốt, không tool nào đạt 100% accuracy. Pipeline không có:
- Strict schema validation
- Business rules validation (count, format, consistency)
- Cross-validation với answer keys (validation tự động mạnh nhất)
- Mandatory review UI với image side-by-side
- Verified flag trên từng câu hỏi

→ Sai im lặng (silent corruption), admin không biết chỗ nào sai để fix.

---

## 6. Tham chiếu file & dòng code

| Vấn đề | File | Dòng |
|---|---|---|
| OCR call gpt-4o-mini | `public/admin/js/exams.js` | 286-319 |
| Render 1024px | `public/admin/js/exams.js` | 272-283 |
| Boundary regex | `public/admin/js/exams.js` | 552-571 |
| Slice 14000 | `public/admin/js/exams.js` | 618 |
| max_tokens 4096 | `public/admin/js/exams.js` | 613 |
| Save to DB | `public/admin/js/exams.js` | 625-687 |
| Schema | `sql/exam_tables.sql` | toàn file |
| Admin UI | `public/admin/exams.html` | toàn file |
| Browser-side execution | `public/admin/js/exams.js` | toàn file (không có server-side) |

---

## 7. Kết luận: Cần làm lại pipeline, không patch từng phần

Tổng kết các vấn đề:
- **P0.1 (hallucination)**: gốc ở model lựa chọn → đổi tool
- **P0.2 (sub-unit)**: schema + boundary logic → refactor
- **P0.3 (image section 4)**: pipeline OCR-text-only → đổi pipeline
- **P0.4-P0.6 (đáp án/transcript/vocab table)**: missing features + pipeline limitation → bổ sung + đổi pipeline
- **P1.1-P1.6**: chất lượng OCR + missing validation → đổi tool + thêm rules
- **P2.1-P2.4**: browser-side execution + loose schema → server-side job queue + strict schema
- **P3.x**: features riêng (làm sau)

Patch từng phần sẽ tạo Frankenstein code không bền vững. **Phải refactor toàn bộ pipeline với specialized OCR engine + server-side job queue + strict validation + mandatory review UI**.

→ Xem `02_PIPELINE_GOOGLE_DOCUMENT_AI.md` cho thiết kế giải pháp.
