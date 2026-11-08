# YouTube API & Media Downloader Hub 🚀

A modern full-stack web application, working API workbench, and media extraction hub. Features direct 1-click downloads, a standalone cookie-free **FastAPI** microservice, and **Gemini 3.8 Flash** AI video intelligence.

---

## ⚡ Features

- **Instant 1-Click Video & Audio Downloader**:
  - Download MP4 (1080p, 720p, 4K) & MP3 (320kbps) directly via Cobalt, ssYouTube, Y2Mate, and Loader.to without datacenter IP bot gates.
- **Direct 1-Click Asset Downloads**:
  - Full HD MaxRes Thumbnails (1280×720 / 1080p `maxresdefault.jpg`)
  - Closed Captions & Subtitles track (`.SRT` / `.VTT`)
  - Complete video metadata export (`.JSON`)
- **Direct Server Stream (`yt-dlp` + `FFmpeg`)**:
  - Server-side muxing and chunked streaming with automatic storage cleanup.
  - Cookie persistence and proxy settings for authenticated cloud runs.
- **FastAPI Cookie-Free Downloader Microservice**:
  - Located in `/fastapi_server/main.py`.
  - Uses mobile client emulation (`ios`, `android`) to extract media on home/VPS IPs without needing login cookies.
  - Dockerized with FFmpeg for single-command deployment.
- **Gemini 3.8 Flash AI Intelligence**:
  - Executive video summaries and key takeaways
  - Timestamped chapter breakdown
  - Viral social media repurposing (Twitter/X thread, LinkedIn post, newsletter)
  - Custom media API pipeline code generator in any programming language

---

## 🛠️ Quick Start

### 1. Web Application (React + Express + Vite)

```bash
# Install dependencies
npm install

# Start development server on port 3000
npm run dev
```

### 2. FastAPI Cookie-Free Microservice (Python)

```bash
# Navigate to fastapi_server folder
cd fastapi_server

# Install dependencies
pip install -r requirements.txt

# Start FastAPI server on port 8000
uvicorn main:app --reload --port 8000
```
Interactive Swagger documentation will be available at: `http://localhost:8000/docs`

### 3. Deploy on Render
1. Render > New > Blueprint > pick this repo (it reads `render.yaml`, builds the `Dockerfile` with Node, ffmpeg and yt-dlp).
2. Set `GEMINI_API_KEY`. Optionally `YT_COOKIES` and `YT_PROXY` (YouTube blocks datacenter IPs; cookies from a throwaway account or a residential proxy are what make downloads reliable).
3. Health check: `/health`. At most `MAX_CONCURRENT_DOWNLOADS` (2) downloads run at once, extra requests get a 429.

### 4. Docker Deployment (FastAPI service)

```bash
# Run FastAPI with Docker
cd fastapi_server
docker compose up -d
```

---

## 🔌 API Reference

### `GET /api/yt/info?url={YOUTUBE_URL}`
Fetches video metadata, thumbnail assets, embed URLs, and download resolver links.

### `POST /api/yt/download-direct`
Streams MP4 or MP3 directly from the server.
```json
{
  "url": "https://www.youtube.com/watch?v=...",
  "format": "mp4",
  "quality": "1080"
}
```

### `POST /api/ai/video-insights`
Generates summaries, chapters, or social repurposing via Gemini 3.8 Flash.
```json
{
  "title": "Video Title",
  "author": "Channel Name",
  "videoId": "VIDEO_ID",
  "taskType": "summary"
}
```

---

## 📄 License
MIT License
