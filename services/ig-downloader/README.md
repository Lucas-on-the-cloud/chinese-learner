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

## Test local

```bash
cd services/ig-downloader
npm install
# Cần yt-dlp + ffmpeg cài máy local
node server.js
# Thử
curl 'http://localhost:3000/info?url=https://www.instagram.com/reel/...'
```
