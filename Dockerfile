# YouTube Downloader Hub for Render: Node + ffmpeg + standalone yt-dlp.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Standalone yt-dlp (no Python needed). Rebuild the service to pick up a newer release.
RUN mkdir -p /app/bin \
 && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /app/bin/yt-dlp \
 && chmod +x /app/bin/yt-dlp

WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    YTDLP_PATH=/app/bin/yt-dlp
EXPOSE 10000
CMD ["npm", "start"]
