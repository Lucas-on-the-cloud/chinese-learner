# 學中文 · Học Tiếng Trung

Ứng dụng học tiếng Trung với AI, highlight, flashcard, luyện viết chữ.

## Deploy miễn phí lên Vercel (10 phút)

### Bước 1: Tạo GitHub repo
1. Vào https://github.com → **New repository**
2. Tên: `chinese-learner` → **Create**
3. Upload tất cả file trong thư mục này lên repo đó

Cấu trúc thư mục phải là:
```
chinese-learner/
├── api/
│   └── proxy.js          ← Serverless proxy (fix CORS)
├── public/
│   └── index.html         ← App chính
├── vercel.json
└── package.json
```

### Bước 2: Deploy lên Vercel
1. Vào https://vercel.com → **Sign up with GitHub**
2. Click **Add New → Project**
3. Chọn repo `chinese-learner` vừa tạo
4. Vercel tự nhận cấu hình → Click **Deploy**
5. Chờ 30 giây → Vercel cho bạn URL: `https://chinese-learner-xxx.vercel.app`

### Bước 3: Dùng app
1. Mở URL Vercel
2. Vào ⚙️ Cài đặt → chọn Provider (Anthropic hoặc OpenAI) → dán API key → Lưu
3. Mở bài học → bấm "Phân tích & tạo từ vựng" → AI hoạt động!

## Tại sao cần proxy?

Anthropic và OpenAI **chặn gọi trực tiếp từ trình duyệt** (CORS policy). 
File `api/proxy.js` là một serverless function chạy trên Vercel server, 
nó nhận request từ trình duyệt → gọi API Anthropic/OpenAI → trả kết quả về.

```
Trình duyệt → /api/proxy (Vercel server) → api.anthropic.com → kết quả
```

API key được gửi từ trình duyệt trong mỗi request, 
KHÔNG lưu trên server. Key chỉ lưu trong localStorage của trình duyệt bạn.

## Tính năng
- 📖 Đọc bài với chữ Hán + Pinyin xen kẽ
- 🎨 Highlight chữ Trung & tiếng Việt (4 màu)
- ✨ AI tạo từ vựng từ ngữ cảnh bài đọc
- ✏️ Luyện viết chữ Hán (Hanzi Writer)
- 🃏 Flashcard với flip animation
- 💬 Chatbot hỏi đáp về bài đọc
- ⬇️ Xuất CSV từ vựng
- 🔌 Hỗ trợ Anthropic + OpenAI
