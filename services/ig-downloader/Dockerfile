# Tiny Node + yt-dlp container for personal Instagram/TikTok downloader.
# Alpine 3.18+ ships yt-dlp in community repo, no Python install needed.
FROM node:20-alpine

# yt-dlp + ffmpeg (latter is needed for some merge formats)
RUN apk add --no-cache yt-dlp ffmpeg

WORKDIR /app

# Install deps first for layer caching
COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "server.js"]
