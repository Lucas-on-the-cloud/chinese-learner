# ig-downloader

Self-hosted yt-dlp wrapper for the `/admin/reels.html` browser tool.
Replaces RapidAPI — unlimited free, supports Instagram + TikTok + YouTube + 1500 other sites (whatever yt-dlp supports).

## Endpoints

```
GET /info?url=https://www.instagram.com/reel/...
→ { videoUrl, thumbnail, title, duration, uploader, description }

GET /video?url=https://www.instagram.com/reel/...
→ streams mp4 binary with CORS headers
```

## Deploy to Render.com (free tier, 5 phút)

1. Sign up / log in tại [render.com](https://render.com) (không cần thẻ tín dụng cho free tier).
2. Dashboard → **New +** → **Web Service** → **Build and deploy from a Git repository** → connect GitHub → chọn repo `chinese-learner`.
3. Cấu hình:
   - **Name**: `ig-downloader` (sẽ thành URL `https://ig-downloader-xxxx.onrender.com`)
   - **Region**: Singapore (gần Đài Loan/VN nhất)
   - **Branch**: `main`
   - **Root Directory**: `services/ig-downloader`
   - **Runtime**: `Docker`
   - **Instance Type**: **Free**
4. (Optional) Environment Variables:
   - `ALLOWED_ORIGIN` = `https://tocflfafa.com` để chỉ domain của bạn gọi được
5. **Create Web Service** → đợi build (~5 phút lần đầu vì cài yt-dlp + ffmpeg).
6. Khi status thành **Live**, copy URL trên top page (vd `https://ig-downloader-abc1.onrender.com`).
7. Mở `https://your-url/info?url=https://www.instagram.com/reel/...` test thử trên trình duyệt — phải trả JSON.
8. Vào `https://tocflfafa.com/admin/reels.html` → Settings → paste URL Render vào field "Downloader API URL".

## Lưu ý Render free tier

- App **sleep sau 15 phút không có request** → request đầu sau khi sleep mất ~30s để wake.
- 750h/tháng free → đủ chạy 1 service liên tục.
- Bandwidth 100GB/tháng — dư thừa cho cá nhân.

## ⚠ Instagram cookies (BẮT BUỘC để không bị block)

Instagram chặn IP của Render và các datacenter khác. Lỗi sẽ ra dạng:

```
ERROR: [Instagram] DSZC4Mjldth: Requested content is not available, rate-limit reached or login required.
```

Fix bằng cách upload cookies từ trình duyệt đã đăng nhập IG của bạn:

### 1. Export cookies từ trình duyệt

- Cài extension **"Get cookies.txt LOCALLY"** ([Chrome](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)) — tránh các extension đời cũ vì tiềm ẩn malware.
- Mở [instagram.com](https://www.instagram.com), đảm bảo đang đăng nhập (account của bạn hoặc account phụ — KHÔNG dùng account chính nếu lo bảo mật).
- Click extension icon → chọn **"Export As" → cookies.txt** (Netscape format).
- Lưu file `cookies.txt` về máy.

### 2. Upload cookies vào Render

- Service trên Render → **Environment** tab → cuộn xuống **Secret Files**.
- Click **+ Add Secret File**:
  - **Filename / Path**: `/etc/secrets/cookies.txt`
  - **File Contents**: mở `cookies.txt` bằng text editor, copy hết, paste vào.
- **Save Changes** → Render auto-redeploy.

Sau khi deploy xong, log Render sẽ có dòng `[ig-downloader] cookies file: /etc/secrets/cookies.txt` → sẵn sàng.

### 3. Refresh khi cookies hết hạn

Cookies IG thường sống ~3-6 tháng. Khi nào yt-dlp lại ra lỗi login required → lặp lại bước 1-2 với cookies mới.

### Bảo mật

- Cookies = session token = ai có cookies có thể login as bạn trên IG. Render Secret Files được mã hoá at-rest, chỉ container service đọc được — an toàn miễn là bạn không share Render account.
- Nên dùng **account IG phụ** (đăng ký 1 account riêng cho việc này) để hạn chế rủi ro.

## Test local

```bash
cd services/ig-downloader
npm install
# Cần yt-dlp + ffmpeg cài máy local
node server.js
# Thử
curl 'http://localhost:3000/info?url=https://www.instagram.com/reel/...'
```
