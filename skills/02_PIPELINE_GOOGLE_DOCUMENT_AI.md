# Pipeline Enterprise: Nhập đề thi TOCFL với Google Document AI

> **Context cho AI engineer:** Tài liệu này là spec triển khai cho pipeline thay thế hoàn toàn pipeline OCR cũ (xem `01_PROBLEMS.md`). Mục tiêu là build pipeline production-grade dùng Google Document AI làm OCR engine chính, đạt accuracy ≥98%, với validation tự động và admin review bắt buộc.

---

## 1. Mục tiêu & nguyên tắc thiết kế

### 1.1. Mục tiêu cụ thể (đo được)

- **Accuracy:** ≥98% câu hỏi parsed đúng (verified bằng gold dataset 5 sub-unit)
- **Coverage:** 100% câu hỏi được parse (không mất câu), 100% hình ảnh section 4 được crop & lưu
- **Auto-fill:** ≥95% đáp án và transcript được tự động ghép (không cần admin nhập tay)
- **Throughput:** Sách 322 trang xử lý xong trong ≤15 phút (pipeline) + ≤2 giờ admin review
- **Cost:** ≤$15/sách (toàn bộ AI + storage)
- **Reliability:** Job có thể resume nếu fail giữa chừng, không mất progress

### 1.2. Nguyên tắc kiến trúc

1. **Right tool for right job:** Document AI cho OCR, LLM cho structuring & verification, rule-based code cho structure detection
2. **Server-side execution:** Browser chỉ upload + monitor + review. Heavy work chạy ở server với job queue
3. **Strict schema:** Mọi LLM output bị enforce bởi JSON schema, không có loose JSON
4. **Validation as code:** Business rules chạy tự động sau mỗi stage, flag warnings vào DB
5. **Mandatory review:** Admin phải verify trước khi publish, UI hiển thị image gốc cạnh JSON
6. **Idempotent re-run:** Re-process unit/section bất kỳ lúc nào không corrupt data
7. **Audit everything:** Log mọi AI call (tokens, cost, latency, model version) cho debugging và cost analysis

---

## 2. Kiến trúc tổng thể

```
┌────────────────────────────────────────────────────────────────────┐
│  ADMIN BROWSER                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ Upload PDF   │  │ Job monitor  │  │ Review UI                │ │
│  │              │  │ (Realtime)   │  │ (image + JSON side-by-   │ │
│  │              │  │              │  │  side, inline edit)      │ │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────────┘ │
└─────────┼─────────────────┼─────────────────────┼──────────────────┘
          │                 │                     │
          ▼                 │                     │ API: edit/verify/publish
┌──────────────────┐        │                     │
│ Supabase Storage │        │                     │
│ exam-books/      │        │                     │
│   {id}/source.pdf│        │                     │
└────────┬─────────┘        │                     │
         │                  │                     │
         ▼                  │                     │
┌──────────────────────────────────────────────────────────────────┐
│  INNGEST JOB ORCHESTRATOR (server-side, async)                   │
│                                                                    │
│  exam.process.book                                                │
│    ├── step.upload-to-gcs       (copy PDF Supabase → GCS)        │
│    ├── step.doc-ai-batch        (gọi Document AI Batch)          │
│    ├── step.poll-doc-ai         (poll until done, save raw)      │
│    ├── step.detect-structure    (rule-based, parse layout JSON)  │
│    ├── step.crop-images         (crop section 4 images)          │
│    ├── step.extract-content     (LLM per sub-unit, parallel)     │
│    ├── step.parse-answer-keys   (LLM on tail pages)              │
│    ├── step.parse-transcripts   (LLM on transcript pages)        │
│    ├── step.cross-validate      (count match, flag warnings)     │
│    └── step.notify-admin        (status: awaiting_review)        │
└──────────────────────────────────────────────────────────────────┘
         │            │            │            │
         ▼            ▼            ▼            ▼
┌──────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
│ GCS Buckets  │ │ Document │ │ LLM      │ │ Supabase     │
│ - input/     │ │ AI       │ │ - Claude │ │ Postgres     │
│ - output/    │ │ Layout   │ │ - GPT-4o │ │ + Realtime   │
│ - crops/     │ │ Parser   │ │          │ │              │
└──────────────┘ └──────────┘ └──────────┘ └──────────────┘
```

### 2.1. Phân chia trách nhiệm

| Component | Trách nhiệm | KHÔNG làm |
|---|---|---|
| **Browser** | Upload, monitor (qua Supabase Realtime), Review UI | Không OCR, không gọi AI, không xử lý PDF |
| **Inngest** | Job orchestration, retry, step persistence | Không hold business logic |
| **Document AI** | OCR ký tự, layout detection, table extraction, bbox | Không hiểu ngữ nghĩa, không structuring |
| **Structure detector (TS code)** | Parse Document AI JSON → unit/sub-unit/section boundaries | Không gọi AI |
| **LLM (Claude/GPT-4o)** | Map structured layout → DB schema, normalize, edge cases | Không OCR, không layout detection |
| **Validators** | Business rules, count check, schema check, cross-validate | Không sửa data, chỉ flag |
| **Supabase** | Persistence, realtime events, auth | - |

---

## 3. Google Cloud setup

### 3.1. Tạo GCP project

```bash
# Tạo project mới
gcloud projects create tocfl-fafa-prod --name="TOCFL FAFA Production"
gcloud config set project tocfl-fafa-prod

# Link billing (cần có billing account ID)
gcloud billing projects link tocfl-fafa-prod --billing-account=XXXXXX-XXXXXX-XXXXXX

# Enable APIs
gcloud services enable documentai.googleapis.com
gcloud services enable storage.googleapis.com
```

### 3.2. Tạo Document AI processor

**Region quyết định:** `asia-northeast1` (Tokyo) — gần Đài Loan/Việt Nam, latency thấp hơn `us`. Pricing chênh ~5%, đáng.

```bash
# Qua Console UI: https://console.cloud.google.com/ai/document-ai/processors
# Click "CREATE PROCESSOR" → chọn "Layout Parser"
# Region: asia-northeast1
# Name: tocfl-layout-parser
# Lưu lại processor_id (dạng: projects/PROJECT_NUMBER/locations/asia-northeast1/processors/PROCESSOR_ID)
```

**Lưu ý:** Layout Parser chưa available ở mọi region. Nếu `asia-northeast1` không có → fallback `us`. Check tại: https://cloud.google.com/document-ai/docs/regions

### 3.3. Service Account

```bash
gcloud iam service-accounts create tocfl-doc-ai \
  --display-name="TOCFL Document AI Worker"

# Roles
gcloud projects add-iam-policy-binding tocfl-fafa-prod \
  --member="serviceAccount:tocfl-doc-ai@tocfl-fafa-prod.iam.gserviceaccount.com" \
  --role="roles/documentai.apiUser"

gcloud projects add-iam-policy-binding tocfl-fafa-prod \
  --member="serviceAccount:tocfl-doc-ai@tocfl-fafa-prod.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# Tạo key JSON
gcloud iam service-accounts keys create ./tocfl-doc-ai-key.json \
  --iam-account=tocfl-doc-ai@tocfl-fafa-prod.iam.gserviceaccount.com
```

→ Copy nội dung JSON này vào Vercel env: `GOOGLE_APPLICATION_CREDENTIALS_JSON`

### 3.4. GCS Buckets

```bash
# Input bucket — PDF copy từ Supabase
gsutil mb -l asia-northeast1 gs://tocfl-fafa-pdf-input

# Output bucket — Document AI batch output
gsutil mb -l asia-northeast1 gs://tocfl-fafa-doc-ai-output

# Lifecycle: tự xóa sau 30 ngày (chỉ là intermediate, raw lưu lại Supabase)
cat > lifecycle.json <<EOF
{
  "lifecycle": {
    "rule": [{
      "action": {"type": "Delete"},
      "condition": {"age": 30}
    }]
  }
}
EOF
gsutil lifecycle set lifecycle.json gs://tocfl-fafa-pdf-input
gsutil lifecycle set lifecycle.json gs://tocfl-fafa-doc-ai-output
```

### 3.5. Pricing & quotas

| Service | Pricing | Free tier |
|---|---|---|
| Layout Parser | $30 / 1000 pages | 1000 pages/month đầu free |
| GCS Storage | $0.020 / GB / month | 5GB free |
| GCS Egress | $0.12 / GB | 1GB/month free |
| Document AI Online API | $1.50 / 1000 pages (OCR), $30 / 1000 (Layout) | shared quota |

**Cho sách 322 trang:** Document AI ~$10, GCS ~$0 (xóa sau 30 ngày). Sách đầu free vì free tier.

**Quota mặc định:** 600 pages/min cho Layout Parser. Đủ cho production. Nếu cần scale lên nhiều sách song song → request tăng quota.

---

## 4. Schema migration

```sql
-- ═══════════════════════════════════════════════════════════════════
-- Migration: 001_enterprise_pipeline_v1.sql
-- ═══════════════════════════════════════════════════════════════════

-- ─── exam_books: thêm cột source ───
ALTER TABLE exam_books
  ADD COLUMN source_pdf_path TEXT,           -- Supabase Storage path
  ADD COLUMN gcs_input_path TEXT,            -- gs://bucket/path (sau khi copy)
  ADD COLUMN doc_ai_processor_id TEXT,       -- full processor resource name
  ADD COLUMN total_pages INT,
  ADD COLUMN extraction_version INT DEFAULT 1;  -- bump khi rerun pipeline

-- ─── exam_units: support sub-unit ───
-- Schema cũ: UNIQUE (book_id, unit_number)
-- Schema mới: UNIQUE (book_id, unit_number, sub_number)
ALTER TABLE exam_units
  ADD COLUMN sub_number INT NOT NULL DEFAULT 0,
  ADD COLUMN sub_title_zh TEXT,              -- "9-1 網路購物" → sub_title_zh = "網路購物"
  ADD COLUMN start_page INT,
  ADD COLUMN end_page INT,
  ADD COLUMN status TEXT DEFAULT 'extracted', -- 'extracted'|'reviewing'|'verified'|'published'
  ADD COLUMN extracted_at TIMESTAMPTZ,
  ADD COLUMN verified_at TIMESTAMPTZ,
  ADD COLUMN verified_by UUID REFERENCES auth.users(id);

DROP INDEX IF EXISTS exam_units_book_id_unit_number_key;
CREATE UNIQUE INDEX exam_units_unique_idx
  ON exam_units(book_id, unit_number, sub_number);

-- ─── exam_passages: support image ───
ALTER TABLE exam_passages
  ADD COLUMN content_image_url TEXT,         -- Supabase Storage public URL
  ADD COLUMN content_image_bbox JSONB,       -- {page_num, x, y, w, h} relative to PDF
  ADD COLUMN passage_type TEXT;              -- 'text'|'image'|'mixed'

-- ─── exam_questions: verification + warnings ───
ALTER TABLE exam_questions
  ADD COLUMN explanation TEXT,                -- từ C. 解答說明
  ADD COLUMN verified BOOLEAN DEFAULT false,
  ADD COLUMN verified_by UUID REFERENCES auth.users(id),
  ADD COLUMN verified_at TIMESTAMPTZ,
  ADD COLUMN flag_warnings JSONB,            -- [{level, type, message}]
  ADD COLUMN source_page INT,                -- trang gốc (cho review UI)
  ADD COLUMN source_bbox JSONB;              -- bbox câu hỏi trên trang

-- ─── exam_listening_transcripts: bảng mới ───
CREATE TABLE exam_listening_transcripts (
  id BIGSERIAL PRIMARY KEY,
  question_id BIGINT REFERENCES exam_questions(id) ON DELETE CASCADE,
  transcript_zh TEXT NOT NULL,
  audio_url TEXT,                            -- nullable, upload sau
  source_page INT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON exam_listening_transcripts(question_id);

-- ─── exam_doc_ai_pages: raw output từ Document AI ───
-- Lưu để có thể re-run extract mà không cần gọi lại Document AI
CREATE TABLE exam_doc_ai_pages (
  book_id BIGINT REFERENCES exam_books(id) ON DELETE CASCADE,
  page_num INT,
  layout_json JSONB NOT NULL,                -- full layout output cho trang
  raw_text TEXT,                             -- plain text (extracted convenience)
  has_table BOOLEAN DEFAULT false,
  has_visual_element BOOLEAN DEFAULT false,
  PRIMARY KEY (book_id, page_num)
);

-- ─── exam_jobs: job queue + status ───
CREATE TABLE exam_jobs (
  id BIGSERIAL PRIMARY KEY,
  book_id BIGINT REFERENCES exam_books(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,                    -- 'full_pipeline'|'reextract_subunit'|'parse_answer_keys'
  status TEXT NOT NULL,                      -- 'queued'|'running'|'awaiting_review'|'done'|'failed'|'cancelled'
  current_step TEXT,                         -- 'upload_gcs'|'doc_ai'|'extract'|'validate'...
  progress_pct INT DEFAULT 0,
  progress_label TEXT,                       -- "Đang xử lý sub-unit 9-1 (12/30)"
  doc_ai_operation_id TEXT,                  -- để poll Google operation
  inngest_event_id TEXT,                     -- để correlate với Inngest dashboard
  scope JSONB,                                -- {unit_number?, sub_number?} cho re-run
  error_message TEXT,
  error_stack TEXT,
  retry_count INT DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE INDEX ON exam_jobs(book_id, status);
CREATE INDEX ON exam_jobs(status, created_at);

-- ─── exam_extraction_log: audit trail mọi AI call ───
CREATE TABLE exam_extraction_log (
  id BIGSERIAL PRIMARY KEY,
  book_id BIGINT,
  unit_id BIGINT,
  job_id BIGINT REFERENCES exam_jobs(id) ON DELETE SET NULL,
  stage TEXT NOT NULL,                       -- 'doc_ai'|'extract'|'verify'|'answer_keys'
  ai_provider TEXT,                          -- 'google_doc_ai'|'openai'|'anthropic'
  ai_model TEXT,                             -- 'layout-parser'|'gpt-4o-2024-08-06'|'claude-sonnet-4-7'
  prompt_version TEXT,                       -- 'extract_v3' để track prompt versioning
  input_tokens INT,
  output_tokens INT,
  cost_usd NUMERIC(10, 6),
  duration_ms INT,
  error TEXT,
  metadata JSONB,                            -- request_id, model_version, etc
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON exam_extraction_log(book_id, stage);
CREATE INDEX ON exam_extraction_log(created_at);

-- ─── RLS policies ───
ALTER TABLE exam_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY exam_jobs_admin_only ON exam_jobs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

ALTER TABLE exam_extraction_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY exam_extraction_log_admin_only ON exam_extraction_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

ALTER TABLE exam_doc_ai_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY exam_doc_ai_admin_only ON exam_doc_ai_pages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─── Realtime publication cho jobs ───
ALTER PUBLICATION supabase_realtime ADD TABLE exam_jobs;
```

---

## 5. Pipeline 9 stages

### Stage 1 — Upload PDF (browser)

**Endpoint:** `POST /api/admin/exam-books/upload`

```
Request: multipart/form-data
  - title: "華語文能力測驗關鍵詞彙 進階篇"
  - level: "B1"
  - file: <PDF binary>

Response:
  - book_id
  - source_pdf_path
  - upload_url (signed URL nếu dùng resumable upload)
```

**Logic:**
1. Validate user is admin
2. Validate file: PDF, ≤200MB, page count > 0
3. Tạo `exam_books` row (status: `uploaded`)
4. Upload vào Supabase Storage `exam-books/{book_id}/source.pdf`
5. Tạo `exam_jobs` row (`job_type: full_pipeline`, `status: queued`)
6. Trigger Inngest event: `await inngest.send({ name: 'exam.book.process', data: { book_id, job_id }})`
7. Return ngay, không đợi pipeline xong

**Browser sau response:**
- Redirect sang trang job monitor `/admin/exams/{book_id}/job`
- Subscribe Supabase Realtime channel cho `exam_jobs` row

### Stage 2 — Copy PDF sang GCS

**Inngest function:** `exam.book.process` step `upload-to-gcs`

```ts
// pseudocode
const { book_id } = event.data;
const book = await db.exam_books.findOne({ id: book_id });

// Download từ Supabase Storage
const pdfBuffer = await supabase.storage
  .from('exam-books')
  .download(`${book_id}/source.pdf`);

// Upload lên GCS
const gcsPath = `gs://tocfl-fafa-pdf-input/${book_id}/source.pdf`;
await gcs.bucket('tocfl-fafa-pdf-input').file(`${book_id}/source.pdf`).save(pdfBuffer);

await db.exam_books.update({ id: book_id }, { gcs_input_path: gcsPath });
await updateJob(job_id, { current_step: 'doc_ai', progress_pct: 10 });
```

**Tại sao copy thay vì gửi trực tiếp:** Document AI Batch API yêu cầu input ở GCS. Online API có thể nhận base64 nhưng giới hạn 20 trang/request → không phù hợp 322 trang.

### Stage 3 — Document AI Batch processing

**Inngest step:** `doc-ai-batch`

```ts
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';

const client = new DocumentProcessorServiceClient({
  credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON),
});

const [operation] = await client.batchProcessDocuments({
  name: book.doc_ai_processor_id, // full resource name
  inputDocuments: {
    gcsDocuments: {
      documents: [{ gcsUri: book.gcs_input_path, mimeType: 'application/pdf' }],
    },
  },
  documentOutputConfig: {
    gcsOutputConfig: {
      gcsUri: `gs://tocfl-fafa-doc-ai-output/${book.id}/`,
    },
  },
  // Layout parser specific config
  processOptions: {
    layoutConfig: {
      chunkingConfig: {
        chunkSize: 1000,
        includeAncestorHeadings: true,
      },
    },
  },
});

// Lưu operation ID để poll
await updateJob(job_id, {
  doc_ai_operation_id: operation.name,
  current_step: 'doc_ai_processing',
  progress_pct: 20,
});

// Inngest sẽ tự sleep + poll qua step
```

### Stage 4 — Poll & save raw output

**Inngest step:** `poll-doc-ai` (sleep loop với `step.sleepUntil`)

```ts
// Poll mỗi 30s
while (true) {
  const [op] = await client.operationsClient.getOperation({
    name: job.doc_ai_operation_id,
  });
  if (op.done) break;
  await step.sleep('wait-doc-ai', '30s');
}

// Đọc output từ GCS
const [files] = await gcs.bucket('tocfl-fafa-doc-ai-output')
  .getFiles({ prefix: `${book_id}/` });

// Document AI batch output là JSON shards (1 shard ~50 trang)
for (const file of files) {
  const [content] = await file.download();
  const shard = JSON.parse(content.toString());

  // Mỗi shard có pages[], parse từng trang
  for (const page of shard.pages) {
    await db.exam_doc_ai_pages.upsert({
      book_id: book.id,
      page_num: page.pageNumber,
      layout_json: page,           // full layout với blocks, paragraphs, tables
      raw_text: extractText(page),
      has_table: page.tables?.length > 0,
      has_visual_element: page.visualElements?.length > 0,
    });
  }
}

await updateJob(job_id, { current_step: 'detect_structure', progress_pct: 50 });
```

**Output Document AI Layout Parser sample (giản lược):**
```json
{
  "pageNumber": 23,
  "dimension": { "width": 527, "height": 736, "unit": "PT" },
  "blocks": [
    {
      "textBlock": {
        "text": "Unit 9 購物 9-1 網路購物",
        "type": "heading-1",
        "boundingBox": { "x": 50, "y": 30, "w": 400, "h": 40 }
      }
    },
    {
      "textBlock": {
        "text": "三、選詞填空",
        "type": "heading-2"
      }
    },
    {
      "tableBlock": {
        "headerRows": [...],
        "bodyRows": [...]
      }
    }
  ]
}
```

**Khác biệt với gpt-4o-mini OCR:**
- Có `type` cho mỗi block (heading-1, heading-2, paragraph, list-item, table)
- Có bbox pixel-level
- Bảng được parse native với rows/cols
- Không hallucinate (model discriminative, có confidence score)

### Stage 5 — Detect structure (rule-based, không LLM)

**Inngest step:** `detect-structure`

Đây là logic TS code thuần, đọc từ `exam_doc_ai_pages.layout_json` và:

#### 5.1. Detect sub-unit boundaries
```ts
// Header trang có format: "Unit N 主題 N-M 副主題"
const HEADER_REGEX = /Unit\s*(\d+)\s+(\S+)\s+(\d+)-(\d+)\s+(\S+)/;

const subUnits = [];
for (const page of pages) {
  const headings = page.blocks.filter(b => b.textBlock?.type === 'heading-1');
  for (const h of headings) {
    const match = h.textBlock.text.match(HEADER_REGEX);
    if (match) {
      const [, unit, unitTitle, , sub, subTitle] = match;
      const key = `${unit}-${sub}`;
      if (!subUnits.find(s => s.key === key)) {
        subUnits.push({
          key,
          unit_number: parseInt(unit),
          sub_number: parseInt(sub),
          unit_title_zh: unitTitle,
          sub_title_zh: subTitle,
          start_page: page.page_num,
        });
      }
    }
  }
}

// end_page = start_page của sub-unit kế tiếp - 1
for (let i = 0; i < subUnits.length; i++) {
  subUnits[i].end_page = i + 1 < subUnits.length
    ? subUnits[i + 1].start_page - 1
    : findFirstAnswerKeyPage(pages); // dừng trước phần đáp án
}
```

#### 5.2. Detect section boundaries trong sub-unit
```ts
const SECTION_PATTERNS = {
  listening: /^一\s*[、,]\s*對話聽力/,
  sentence_completion: /^二\s*[、,]\s*完成句子/,
  cloze: /^三\s*[、,]\s*選詞填空/,
  material_reading: /^四\s*[、,]\s*材料閱讀/,
  short_essay: /^五\s*[、,]\s*短文閱讀/,
  vocab: /^B\s*[\.\,]\s*關鍵詞/,
};

// Mỗi sub-unit, scan blocks từ start_page → end_page,
// tìm heading-2 match patterns trên → đó là section boundaries
```

#### 5.3. Detect images cần crop (section 4)
```ts
// Trong section 4, tìm:
// - visualElement blocks (Document AI gắn label)
// - Hoặc block lớn không phải text/table giữa các question
//   (heuristic: bbox area > X, không có text content > Y chars)

const imageBlocks = page.blocks.filter(b =>
  b.visualElement ||
  (b.boundingBox.h > 150 && (b.textBlock?.text || '').length < 20)
);
```

#### 5.4. Detect bảng vocab section B
```ts
// Document AI native cho table → dùng trực tiếp
const tables = page.tables; // array of {headerRows, bodyRows}
// Map sang exam_vocab schema
```

**Output stage 5:** Insert vào DB:
- `exam_units` (1 row/sub-unit, status: `extracted`)
- Các bảng `exam_section_pages_map` (intermediate, để stage 6 biết section nào ở trang nào)
- Trigger crop image (Stage 6)

### Stage 6 — Crop & upload images

**Inngest step:** `crop-images`

Cho mỗi image bbox detected ở Stage 5:

```ts
import { PDFDocument } from 'pdf-lib';
// hoặc dùng pdftoppm CLI để render trang → crop bằng sharp

for (const img of detectedImages) {
  // Render trang đó từ PDF gốc ở high DPI
  const pageImage = await renderPdfPage(pdfBuffer, img.page_num, dpi=300);

  // Crop theo bbox (Document AI bbox tính theo unit của PDF)
  const cropped = await sharp(pageImage)
    .extract({
      left: bboxToPx(img.bbox.x),
      top: bboxToPx(img.bbox.y),
      width: bboxToPx(img.bbox.w),
      height: bboxToPx(img.bbox.h),
    })
    .png()
    .toBuffer();

  // Upload Supabase Storage
  const path = `exam-images/${book.id}/u${unit}-${sub}-p${page}.png`;
  await supabase.storage.from('public-assets').upload(path, cropped);
  const url = supabase.storage.from('public-assets').getPublicUrl(path).publicUrl;

  // Lưu vào passage record sau (Stage 7 cần biết để link)
  detectedImages[idx].uploaded_url = url;
}
```

### Stage 7 — Content extraction (LLM với strict schema)

**Inngest step:** `extract-content` (parallel per sub-unit, max 8 concurrent)

Cho mỗi sub-unit, mỗi section:

```ts
// Lấy text + tables + images đã detect cho section này
const sectionContext = {
  type: 'cloze',
  text_blocks: [...], // từ Document AI
  tables: [...],
  images: [...],
  page_range: [23, 24],
};

// Strict JSON schema (OpenAI)
const schema = {
  type: 'object',
  properties: {
    passages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: ['string', 'null'] },           // "(一)", "(二)"
          content_text: { type: ['string', 'null'] },
          has_image: { type: 'boolean' },
          image_ref_id: { type: ['string', 'null'] },    // ref vào images đã detect
        },
        required: ['label', 'content_text', 'has_image', 'image_ref_id'],
        additionalProperties: false,
      },
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          q_num: { type: 'integer' },
          question_text: { type: 'string' },
          passage_label: { type: ['string', 'null'] },
          choices: {
            type: 'object',
            properties: {
              A: { type: 'string' },
              B: { type: 'string' },
              C: { type: 'string' },
              D: { type: 'string' },
            },
            required: ['A', 'B', 'C', 'D'],
            additionalProperties: false,
          },
        },
        required: ['q_num', 'question_text', 'passage_label', 'choices'],
        additionalProperties: false,
      },
    },
  },
  required: ['passages', 'questions'],
  additionalProperties: false,
};

const response = await openai.chat.completions.create({
  model: 'gpt-4o-2024-08-06',
  response_format: {
    type: 'json_schema',
    json_schema: { name: 'section_content', schema, strict: true },
  },
  messages: [
    { role: 'system', content: SYSTEM_PROMPT_BY_SECTION_TYPE[section.type] },
    { role: 'user', content: buildPromptForSection(sectionContext) },
  ],
});

const parsed = JSON.parse(response.choices[0].message.content);
```

**Lưu ý quan trọng:**
- Dùng `gpt-4o` (KHÔNG phải mini) vì cần CJK accuracy cao
- `strict: true` ép schema 100%, model không thể bỏ field
- Prompt cho section type khác nhau (listening rỗng question_text, cloze có blank numbers, material_reading có image refs...)
- Input cho LLM là **structured data từ Document AI** (text blocks với bbox), KHÔNG phải plain text — LLM có context tốt hơn

**Provider alternative:** Anthropic Claude với tool use (force schema). Cost tương đương, CJK ngang ngửa. Chọn 1 trong 2 dựa theo prompt caching support (Claude có, dùng được nếu reuse system prompt cho nhiều section).

### Stage 8 — Parse answer keys + transcripts

**Inngest step:** `parse-answer-keys` & `parse-transcripts`

#### 8.1. Detect tail pages
```ts
// Pages chứa `B. 聽力對話`: bắt heading "B. 聽力對話"
// Pages chứa `C. 解答說明`: bắt heading "C. 解答說明"
const transcriptPages = findPagesWithHeading(pages, /B[\.\,]\s*聽力對話/);
const answerKeyPages = findPagesWithHeading(pages, /C[\.\,]\s*解答說明/);
```

#### 8.2. Parse answer keys với LLM

```ts
const answerSchema = {
  type: 'object',
  properties: {
    answers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          unit_number: { type: 'integer' },
          sub_number: { type: 'integer' },
          question_number: { type: 'integer' },
          answer: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
          explanation: { type: ['string', 'null'] },
        },
        required: ['unit_number', 'sub_number', 'question_number', 'answer', 'explanation'],
        additionalProperties: false,
      },
    },
  },
  required: ['answers'],
  additionalProperties: false,
};

// Gửi text từ answerKeyPages cho LLM
// Update vào exam_questions theo (unit_number, sub_number, question_number)
```

#### 8.3. Parse transcripts tương tự

```ts
const transcriptSchema = {
  type: 'object',
  properties: {
    transcripts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          unit_number: { type: 'integer' },
          sub_number: { type: 'integer' },
          question_number: { type: 'integer' },
          transcript_zh: { type: 'string' },
        },
        required: ['unit_number', 'sub_number', 'question_number', 'transcript_zh'],
        additionalProperties: false,
      },
    },
  },
  required: ['transcripts'],
};

// Insert vào exam_listening_transcripts
```

### Stage 9 — Cross-validation & flagging

**Inngest step:** `cross-validate`

Chạy validators trên toàn bộ data đã extract:

```ts
const VALIDATORS = [
  // ─── Question-level validators ───
  {
    name: 'options_all_duplicate',
    level: 'red',
    apply: (q) => {
      const opts = Object.values(q.choices);
      if (new Set(opts).size === 1)
        return `4 options giống hệt nhau: "${opts[0]}" (hallucination)`;
    },
  },
  {
    name: 'options_partial_duplicate',
    level: 'yellow',
    apply: (q) => {
      const opts = Object.values(q.choices);
      const unique = new Set(opts).size;
      if (unique < 4) return `Chỉ ${unique}/4 options unique`;
    },
  },
  {
    name: 'simplified_chinese_in_choice',
    level: 'yellow',
    apply: (q) => {
      const SIMPLIFIED = ['学', '体', '国', '关', '对', '写', '会', '听', '简', '语'];
      const all = Object.values(q.choices).join('') + q.question_text;
      const found = SIMPLIFIED.filter(c => all.includes(c));
      if (found.length) return `Có giản thể: ${found.join(', ')}`;
    },
  },

  // ─── Section-level validators ───
  {
    name: 'listening_question_count',
    level: 'red',
    apply: (section) => {
      if (section.type === 'listening' && section.questions.length !== 5)
        return `Section listening có ${section.questions.length} câu, expected 5`;
    },
  },
  {
    name: 'cloze_blanks_match',
    level: 'red',
    apply: (section) => {
      if (section.type !== 'cloze') return;
      const blanksInPassage = (section.passages || [])
        .flatMap(p => extractBlankNumbers(p.content_text || ''));
      const questionNums = section.questions.map(q => q.q_num);
      const missing = questionNums.filter(n => !blanksInPassage.includes(n));
      if (missing.length) return `Câu ${missing.join(',')} không có blank trong passage`;
    },
  },
  {
    name: 'material_reading_has_content',
    level: 'red',
    apply: (section) => {
      if (section.type !== 'material_reading') return;
      const hasContent = (section.passages || []).some(p =>
        p.content_text || p.content_image_url
      );
      if (!hasContent) return 'Section 4 không có passage hoặc image';
    },
  },

  // ─── Sub-unit-level validators ───
  {
    name: 'subunit_question_count',
    level: 'red',
    apply: (subUnit) => {
      const total = subUnit.sections.flatMap(s => s.questions).length;
      if (total < 28 || total > 32)
        return `Sub-unit có ${total} câu, expected 30±2`;
    },
  },
  {
    name: 'answer_key_count_match',
    level: 'red',
    apply: (subUnit, ctx) => {
      const parsed = subUnit.sections.flatMap(s => s.questions).length;
      const answers = ctx.answerKeys.filter(a =>
        a.unit_number === subUnit.unit_number &&
        a.sub_number === subUnit.sub_number
      ).length;
      if (parsed !== answers)
        return `Parse ${parsed} câu nhưng answer key có ${answers}`;
    },
  },
  {
    name: 'all_questions_have_answer',
    level: 'red',
    apply: (subUnit) => {
      const missing = subUnit.sections
        .flatMap(s => s.questions)
        .filter(q => !q.correct_answer);
      if (missing.length)
        return `${missing.length} câu chưa có đáp án match từ answer key`;
    },
  },
];

// Apply tất cả validators, save vào exam_questions.flag_warnings
for (const subUnit of subUnits) {
  const warnings = [];
  for (const v of VALIDATORS) {
    const result = v.apply(subUnit, { answerKeys });
    if (result) warnings.push({ level: v.level, type: v.name, message: result });
  }
  // Save warnings vào DB...
}

// Update job status
await updateJob(job_id, {
  status: 'awaiting_review',
  progress_pct: 100,
  finished_at: new Date(),
});
```

### Stage 10 — Notify admin (final)

```ts
// Realtime đã update qua exam_jobs
// Optional: gửi email
await sendEmail(adminEmail, {
  subject: `Sách "${book.title}" sẵn sàng review`,
  body: `Pipeline xong. ${redFlagCount} câu cần review urgent, ${yellowFlagCount} câu warning.`,
});
```

---

## 6. Review UI

**Route:** `/admin/exams/{book_id}/review/{unit_number}-{sub_number}`

### 6.1. Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Unit 9 · 9-1 網路購物                          [3 red, 5 yellow]│
│ ▸ Section 1 一、對話聽力 ✓  (5/5 verified)                      │
│ ▾ Section 2 二、完成句子 ⚠ 1 warning                            │
│ ▸ Section 3 三、選詞填空 ⚠ 3 red flags                          │
│ ▸ Section 4 四、材料閱讀                                        │
│ ▸ Section 5 五、短文閱讀 ✓                                      │
│                                                                  │
│ ┌──────────────────────┬─────────────────────────────────────┐  │
│ │ ORIGINAL PAGE 23     │ EXTRACTED                           │  │
│ │ ┌──────────────────┐ │ Q17. ⚠ "4 options giống hệt nhau"  │  │
│ │ │ [scan image      │ │      Question: ___                  │  │
│ │ │  highlighted     │ │      A: 變化  ← edit               │  │
│ │ │  với bbox của    │ │      B: 變化  ← edit               │  │
│ │ │  câu 17 đỏ]      │ │      C: 變化  ← edit               │  │
│ │ │                  │ │      D: 變化  ← edit               │  │
│ │ └──────────────────┘ │      Answer: B (from key)          │  │
│ │ Click câu khác để   │      [Save] [Re-parse this Q]      │  │
│ │ jump page           │      [✓ Verify]                     │  │
│ └──────────────────────┴─────────────────────────────────────┘  │
│                                                                  │
│ [Re-parse this sub-unit] [Mark all verified] [Publish sub-unit] │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2. UX rules

- **Mặc định mở section đầu tiên có warning** (không phải section 1)
- **Image trang gốc ở cột trái, JSON parsed ở cột phải** — admin so sánh trực tiếp
- **Click vào câu hỏi → highlight bbox tương ứng trên image** (dùng `source_page` + `source_bbox`)
- **Inline edit, save on blur**, không cần modal
- **Re-parse this Q** chỉ chạy lại stage 7 cho 1 câu (rẻ, ~$0.001)
- **Re-parse this sub-unit** chạy lại stage 7 cho cả sub-unit, không cần Document AI lại
- **Publish sub-unit** chỉ enable khi 0 red flag và ≥80% câu đã verified

### 6.3. Bulk actions

- Trang "Bulk verify": list tất cả sub-unit, filter theo status
- "Verify all yellow flags as ok" — admin scan list, click duyệt các yellow nhỏ (vd giản thể vài chữ admin xác nhận đó là phồn thể đúng)
- Export: download toàn bộ sách dạng JSON cho QA bên ngoài

---

## 7. Cost & performance estimate

### 7.1. Cost per book (322 pages, 30 sub-units)

| Item | Calculation | Cost |
|---|---|---|
| Document AI Layout Parser | 322 × $0.030 | $9.66 |
| GCS Storage (1 month) | 100MB × $0.020 / GB | $0.002 |
| GCS Egress (output download) | 50MB × $0.12 / GB | $0.006 |
| LLM extract content (Stage 7) | 30 sub × 5 sec × ~3K tok × $5/1M | $2.25 |
| LLM parse answer keys (Stage 8) | ~30K tok × $5/1M | $0.15 |
| LLM parse transcripts | ~20K tok × $5/1M | $0.10 |
| Supabase Storage (PDF + crops) | 200MB | included |
| Inngest free tier | up to 50K steps/month | $0 |
| **TOTAL** | | **~$12.20** |

**Free tier cho sách đầu tiên:** Document AI free 1000 pages/month → sách đầu cost chỉ ~$2.50.

### 7.2. Latency

| Stage | Time |
|---|---|
| Upload PDF (browser) | ~10s (71MB) |
| Copy GCS | ~5s |
| Document AI Batch (322 pages) | 3-8 phút |
| Detect structure | <5s |
| Crop images | ~30s (30 images) |
| Extract content (parallel 8) | ~3 phút |
| Answer keys + transcripts | ~30s |
| Validate | <2s |
| **TOTAL pipeline** | **~10-15 phút** |
| **Admin review** | 1-2 giờ (giảm từ 10+ giờ) |

### 7.3. Reliability

- Inngest auto-retry với exponential backoff
- Mỗi step idempotent — failed step rerun không corrupt data
- Document AI batch resume — operation ID lưu trong DB, browser đóng cũng không sao
- Failed sub-unit có thể re-parse riêng, không cần redo cả sách

---

## 8. Roadmap thực thi

### Sprint 1 (1 tuần): Foundation
- [ ] Setup GCP project + Document AI processor + GCS buckets
- [ ] Schema migration (chạy `001_enterprise_pipeline_v1.sql`)
- [ ] Setup Inngest
- [ ] API endpoint `POST /api/admin/exam-books/upload`
- [ ] Inngest function `exam.book.process` step `upload-to-gcs`
- [ ] Test: upload PDF mẫu, confirm xuất hiện ở GCS

**Deliverable:** Admin upload được PDF, file lên đúng GCS bucket.

### Sprint 2 (1 tuần): Document AI integration
- [ ] Inngest steps `doc-ai-batch` + `poll-doc-ai`
- [ ] Save raw output vào `exam_doc_ai_pages`
- [ ] Job progress events qua Supabase Realtime
- [ ] Browser monitor UI hiển thị progress
- [ ] Test: chạy full sách, verify raw_text quality (so với pipeline cũ)

**Deliverable:** Có raw Document AI output trong DB, browser thấy progress real-time.

### Sprint 3 (1 tuần): Structure detection + image crop
- [ ] Rule-based parser sub-unit boundaries từ headings
- [ ] Section boundary detection
- [ ] Image bbox detection (section 4)
- [ ] Crop & upload pipeline
- [ ] Insert vào `exam_units`, `exam_sections`, `exam_passages`

**Deliverable:** Sách parsed thành cấu trúc đầy đủ trong DB, có ảnh, chưa có nội dung câu hỏi.

### Sprint 4 (1.5 tuần): Content extraction + validation
- [ ] LLM extract per section type (5 prompts khác nhau)
- [ ] Strict JSON schema enforcement
- [ ] Answer keys parser
- [ ] Transcripts parser
- [ ] Cross-validation rules
- [ ] Flag warnings vào DB

**Deliverable:** Sách parsed full với câu hỏi, đáp án, transcripts, warnings — sẵn sàng review.

### Sprint 5 (1 tuần): Review UI
- [ ] Route `/admin/exams/{id}/review`
- [ ] Image-side-by-side viewer
- [ ] Inline edit
- [ ] Bbox highlight
- [ ] Re-parse single Q / sub-unit
- [ ] Verify + publish workflow

**Deliverable:** End-to-end pipeline hoàn thiện, sách đầu tiên publish được.

### Sprint 6 (3-5 ngày): Hardening
- [ ] Gold dataset 5 sub-unit gõ tay → benchmark
- [ ] Cost monitoring dashboard (đọc từ `exam_extraction_log`)
- [ ] Error recovery cho mỗi step
- [ ] Documentation cho admin
- [ ] Migration tool: import sách đã làm ở pipeline cũ

**Deliverable:** Production-ready, đo được accuracy ≥98%, có dashboard theo dõi.

---

## 9. Decision points cần confirm trước khi code

| # | Quyết định | Lựa chọn đề xuất | Lý do |
|---|---|---|---|
| 1 | Document AI region | `asia-northeast1` | Gần VN/TW, latency thấp |
| 2 | LLM provider | Claude Sonnet 4.7 | CJK tốt + prompt caching |
| 3 | Job runner | Inngest free tier | Setup nhanh, có dashboard, retry tốt |
| 4 | Image crop tool | `pdftoppm` + `sharp` | Battle-tested, chạy được trên Vercel |
| 5 | LLM cho answer keys | gpt-4o-2024-08-06 với strict schema | Output structured chính xác |
| 6 | Storage cho cropped images | Supabase Storage `public-assets` bucket | Cùng infra, RLS đơn giản |
| 7 | PDF gốc storage | Supabase Storage `exam-books` private | Bảo mật, GCS chỉ là transient |
| 8 | Migration sách cũ | Pipeline mới chạy song song | Sách cũ giữ nguyên, mới dùng pipeline mới |

**Cần xác nhận từ business:**
- [ ] Bản quyền sách NTNU MTC đã được giải quyết?
- [ ] Budget AI/cloud chấp nhận ~$15/sách?
- [ ] Plan import bao nhiêu sách trong 6 tháng tới? (ảnh hưởng quota request)

---

## 10. Tài liệu tham khảo

- Google Document AI Layout Parser: https://cloud.google.com/document-ai/docs/layout-parse
- Document AI Batch Processing: https://cloud.google.com/document-ai/docs/send-request#batch-process
- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs
- Anthropic Tool Use: https://docs.anthropic.com/en/docs/build-with-claude/tool-use
- Inngest Functions: https://www.inngest.com/docs/functions
- Supabase Realtime: https://supabase.com/docs/guides/realtime

---

## 11. Appendix: Sample Document AI output

```json
{
  "pages": [{
    "pageNumber": 23,
    "blocks": [
      {
        "blockId": "p23-b0",
        "textBlock": {
          "text": "Unit 9 購物 9-1 網路購物",
          "type": "heading-1"
        },
        "boundingBox": {
          "vertices": [
            { "x": 50, "y": 30 }, { "x": 450, "y": 30 },
            { "x": 450, "y": 70 }, { "x": 50, "y": 70 }
          ]
        }
      },
      {
        "blockId": "p23-b1",
        "textBlock": {
          "text": "三、選詞填空",
          "type": "heading-2"
        }
      },
      {
        "blockId": "p23-b2",
        "textBlock": {
          "text": "(一)",
          "type": "list-item"
        }
      },
      {
        "blockId": "p23-b3",
        "textBlock": {
          "text": "大學附近到處都找得到租屋廣告牆，上面 14 著各種各樣的出租廣告...",
          "type": "paragraph"
        }
      },
      {
        "blockId": "p23-b10",
        "tableBlock": {
          "headerRows": [{ "cells": [{ "text": "本單元出處" }, { "text": "主題相關詞語" }] }],
          "bodyRows": [
            { "cells": [{ "text": "一、對話聽力1" }, { "text": "房子、擔心、還錢、上班、借錢" }] },
            { "cells": [{ "text": "一、對話聽力2" }, { "text": "房間、畢業、租、市區、空間、郊區、交通費" }] }
          ]
        }
      }
    ],
    "visualElements": [
      {
        "type": "figure",
        "boundingBox": { ... }  // tờ rơi 出租房間
      }
    ]
  }]
}
```

Đây là format mà Stage 5 (structure detector) sẽ parse — rõ ràng và machine-readable, không cần LLM đoán.
