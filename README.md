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
- **Gemini 3.8 Flash AI Creative & Algorithmic Suite**:
  - **Video Insights & Repurposer**: Executive summaries, timestamped chapters, viral social content (X/LinkedIn/Newsletter), and interactive Q&A.
  - **YouTube SEO & 10x Title Package**: 10 High-CTR video titles across 3 psychological styles, SEO description template, and 25 ranked algorithm search tags.
  - **60s Shorts & TikTok Scriptwriter**: 0-3s unscrollable hook, visual action/B-roll directions, and seamless retention loop payoff.
  - **High-CTR Thumbnail Concept Designer**: 3 mobile-optimized visual layouts, high-contrast focal points, 2-3 word on-screen text, and Midjourney/Imagen prompts.
  - **Multilingual Subtitle Translator**: Translates captions into Spanish, French, German, Japanese, Portuguese, and Arabic.
  - **CTR Clickability Scorer & Hook Doctor**: Scores video titles 0-100, detects cognitive triggers, and cures weak first 15 seconds with 5 high-retention hook types.
  - **Video-to-Article SEO Blog Writer**: Converts video notes into 1,200+ word publication-ready markdown articles with headings and FAQs.
  - **AI Pipeline Code Assistant**: Generates customized downloader microservices, batch queues, and bots in Python, Node.js, and Go.
- **Comprehensive Zero-Auth & Media APIs**:
  - `GET /api/yt/suggestions`: Real-time YouTube search autocomplete query suggestions.
  - `GET /api/yt/channel-feed`: Recent channel video uploads via official RSS XML feed.
  - `GET /api/yt/playlist`: Complete playlist feed parsing into structured video items and batch download commands.
  - `GET /api/yt/shorts`: Dedicated 9:16 vertical Shorts inspector, preview, and download links.
  - `POST /api/yt/multi-platform`: Universal downloader for TikTok, Twitter/X, Instagram, SoundCloud, and Reddit.
  - `POST /api/yt/batch-info`: Bulk resolver for up to 10 YouTube video URLs simultaneously.
  - `GET /api/yt/invidious`: Raw unthrottled streaming URLs from federated Invidious instances.
  - `POST /api/yt/chapters-parser`: Parses video descriptions and extracts timestamped chapter intervals.

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

## 🔌 API Reference Summary

### Media Extraction Endpoints:
- `GET /api/yt/info?url={URL}`: Video metadata, HD thumbnails, embed URL, and download resolvers.
- `GET /api/yt/suggestions?q={QUERY}`: Real-time YouTube search autocomplete suggestions.
- `GET /api/yt/channel-feed?channelId={CHANNEL_ID}`: 15 latest uploads from YouTube channel RSS.
- `GET /api/yt/playlist?playlistId={PLAYLIST_ID}`: Parses all videos in a playlist with batch yt-dlp commands.
- `GET /api/yt/shorts?url={SHORTS_URL}`: Vertical video metadata, aspect ratio, and 1-click resolver.
- `POST /api/yt/multi-platform`: Universal extraction for TikTok, Twitter/X, Instagram, SoundCloud, Reddit.
- `POST /api/yt/batch-info`: Query up to 10 video URLs in one payload.
- `POST /api/yt/download-direct`: Direct chunked server streaming (supports cookies/proxy if needed).

### Gemini 3.8 Flash AI Endpoints:
- `POST /api/ai/video-insights`: Executive summaries, chapters, social repurposing, or Q&A.
- `POST /api/ai/seo-optimizer`: 10 High-CTR titles, SEO description template, and 25 search tags.
- `POST /api/ai/shorts-script`: 60-second retention-looped vertical video scripts.
- `POST /api/ai/thumbnail-concept`: 3 visual compositions, color palettes, and Midjourney/Imagen prompts.
- `POST /api/ai/translate-captions`: Multilingual subtitle translations across 5 languages.
- `POST /api/ai/ctr-scorer`: 0-100 Clickability score, emotional trigger detection, and title upgrades.
- `POST /api/ai/hook-doctor`: 5 high-retention opening hooks curing audience drop-off.
- `POST /api/ai/video-to-article`: Full 1200+ word structured markdown SEO blog article.
- `POST /api/ai/code-assistant`: Production code generation for custom downloading pipelines.

---

## 📄 License
MIT License

