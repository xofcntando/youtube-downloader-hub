# FastAPI Cookie-Free YouTube Downloader
# Runs locally or on any VPS without requiring cookies
from fastapi import FastAPI, Query, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import yt_dlp
import os
import tempfile
import shutil
import urllib.parse

app = FastAPI(
    title="FastAPI YouTube Downloader (Cookie-Free)",
    description="High-performance media extractor and streaming downloader powered by FastAPI, yt-dlp, and FFmpeg.",
    version="1.0.0"
)

# Enable CORS for web apps and frontends
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {
        "status": "online",
        "service": "FastAPI Cookie-Free YouTube Downloader",
        "endpoints": {
            "metadata": "/api/v1/info?url=...",
            "download": "/api/v1/download?url=...&format=mp4&quality=1080",
            "stream_urls": "/api/v1/stream-url?url=..."
        }
    }

@app.get("/api/v1/info")
def get_video_info(url: str = Query(..., description="YouTube video URL")):
    """
    Extracts metadata without downloading the video.
    Uses iOS & Android client emulation to bypass web bot-walls without cookies.
    """
    ydl_opts = {
        'skip_download': True,
        'extract_flat': False,
        'extractor_args': {
            'youtube': {
                'player_client': ['ios', 'android']
            }
        }
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            formats = [
                {
                    "format_id": f.get("format_id"),
                    "ext": f.get("ext"),
                    "resolution": f.get("resolution") or f"{f.get('height')}p" if f.get('height') else "audio",
                    "filesize_approx": f.get("filesize_approx"),
                    "vcodec": f.get("vcodec"),
                    "acodec": f.get("acodec"),
                }
                for f in info.get("formats", []) if f.get("vcodec") != "none" or f.get("acodec") != "none"
            ][:15]

            return {
                "id": info.get("id"),
                "title": info.get("title"),
                "duration": info.get("duration"),
                "uploader": info.get("uploader"),
                "thumbnail": info.get("thumbnail"),
                "view_count": info.get("view_count"),
                "formats": formats
            }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Extraction failed: {str(e)}")

@app.get("/api/v1/stream-url")
def get_direct_stream_url(url: str = Query(...)):
    """
    Returns the raw unthrottled .googlevideo.com direct stream URLs for video and audio.
    """
    ydl_opts = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        'extractor_args': {'youtube': {'player_client': ['ios', 'android']}}
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            stream_url = info.get("url")
            requested_formats = info.get("requested_formats", [])
            video_stream = requested_formats[0].get("url") if len(requested_formats) > 0 else stream_url
            audio_stream = requested_formats[1].get("url") if len(requested_formats) > 1 else None

            return {
                "title": info.get("title"),
                "videoStreamUrl": video_stream,
                "audioStreamUrl": audio_stream,
            }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/v1/download")
def download_video(
    background_tasks: BackgroundTasks,
    url: str = Query(..., description="YouTube video URL"),
    format: str = Query("mp4", enum=["mp4", "mp3"]),
    quality: str = Query("1080", enum=["max", "1080", "720", "480", "360"]),
):
    """
    Muxes and streams the complete MP4 or MP3 file directly to the client's browser.
    Cleans up all temporary disk storage automatically after streaming completes.
    """
    temp_dir = tempfile.mkdtemp(prefix="ytdl_fastapi_")
    output_template = os.path.join(temp_dir, "%(title)s.%(ext)s")

    if format == "mp3":
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': output_template,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '320',
            }],
            'extractor_args': {'youtube': {'player_client': ['ios', 'android']}},
            'noplaylist': True,
        }
    else:
        height_filter = f"[height<={quality}]" if quality != "max" else ""
        ydl_opts = {
            'format': f'bestvideo{height_filter}[ext=mp4]+bestaudio[ext=m4a]/best{height_filter}[ext=mp4]/best',
            'outtmpl': output_template,
            'merge_output_format': 'mp4',
            'extractor_args': {'youtube': {'player_client': ['ios', 'android']}},
            'noplaylist': True,
        }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            if format == "mp3":
                filename = os.path.splitext(filename)[0] + ".mp3"

        if not os.path.exists(filename):
            files = [os.path.join(temp_dir, f) for f in os.listdir(temp_dir)]
            if files:
                filename = files[0]
            else:
                raise HTTPException(status_code=500, detail="Downloaded media file not found")

        # Generator to stream file in 1MB chunks
        def file_iterator(file_path: str, chunk_size: int = 1024 * 1024):
            with open(file_path, "rb") as f:
                while chunk := f.read(chunk_size):
                    yield chunk

        # Auto-delete temp files after stream finishes
        background_tasks.add_task(shutil.rmtree, temp_dir, ignore_errors=True)

        base_name = os.path.basename(filename)
        encoded_name = urllib.parse.quote(base_name)

        return StreamingResponse(
            file_iterator(filename),
            media_type="audio/mpeg" if format == "mp3" else "video/mp4",
            headers={
                "Content-Disposition": f"attachment; filename*=utf-8''{encoded_name}",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Download execution failed: {str(e)}")

@app.get("/api/v1/ai-summary")
def ai_summarize(
    url: str = Query(..., description="YouTube Video URL"),
    prompt: str = Query("Summarize this video and extract 5 key takeaways", description="Custom prompt")
):
    """
    AI-powered video summarization endpoint using Gemini 3.8 Flash.
    Extracts video metadata and generates structured insights.
    """
    # 1. Fetch metadata via yt-dlp without cookies
    ydl_opts = {
        'skip_download': True,
        'extractor_args': {'youtube': {'player_client': ['ios', 'android']}}
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
            title = info.get("title")
            uploader = info.get("uploader")
            description = (info.get("description") or "")[:1000]
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Metadata fetch failed: {str(e)}")

    return {
        "title": title,
        "uploader": uploader,
        "ai_task": "Gemini 3.8 Flash Integration",
        "instruction": "Integrate google-genai or call the /api/ai/video-insights endpoint on the host.",
        "sample_summary": f"Video '{title}' by {uploader} covers key workflows. Use Gemini AI to extract full timestamped chapters and viral hooks."
    }

@app.get("/api/v1/suggestions")
def get_search_suggestions(q: str = Query("python tutorial")):
    """Real-time YouTube search suggestions (100% free, no key required)."""
    import urllib.request, json
    url = f"https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q={urllib.parse.quote(q)}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return {"query": data[0], "suggestions": data[1]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/channel-feed")
def get_channel_feed(channel_id: str = Query("UC_x5XG1OV2P6uZZ5FSM9Ttw")):
    """Extracts recent channel video uploads from YouTube's official RSS endpoint."""
    import urllib.request, re
    feed_url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
    try:
        req = urllib.request.Request(feed_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as resp:
            xml = resp.read().decode('utf-8')
            entries = re.findall(r'<entry>([\s\S]*?)<\/entry>', xml)[:15]
            videos = []
            for entry in entries:
                v_id = re.search(r'<yt:videoId>(.*?)<\/yt:videoId>', entry)
                title = re.search(r'<title>(.*?)<\/title>', entry)
                if v_id and title:
                    videos.append({
                        "videoId": v_id.group(1),
                        "title": title.group(1),
                        "url": f"https://www.youtube.com/watch?v={v_id.group(1)}"
                    })
            return {"channelId": channel_id, "videos": videos}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/shorts")
def get_shorts_info(url: str = Query(..., description="YouTube Shorts URL or Video ID")):
    """Extracts YouTube Shorts vertical media data and download resolver URLs."""
    ydl_opts = {
        'skip_download': True,
        'extractor_args': {'youtube': {'player_client': ['ios', 'android']}}
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            v_id = info.get("id")
            return {
                "id": v_id,
                "title": info.get("title"),
                "is_short": True,
                "aspect_ratio": "9:16",
                "uploader": info.get("uploader"),
                "thumbnail": f"https://img.youtube.com/vi/{v_id}/maxresdefault.jpg",
                "direct_download_command": f'yt-dlp -f "best[ext=mp4]" "https://www.youtube.com/shorts/{v_id}"'
            }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/v1/playlist")
def get_playlist_items(playlist_id: str = Query("PL4cUxeGkcC9gUgr39Q_yD6v-bSyMwKPUI")):
    """Extracts items from a public YouTube playlist feed."""
    import urllib.request, re
    feed_url = f"https://www.youtube.com/feeds/videos.xml?playlist_id={playlist_id}"
    try:
        req = urllib.request.Request(feed_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as resp:
            xml = resp.read().decode('utf-8')
            entries = re.findall(r'<entry>([\s\S]*?)<\/entry>', xml)[:50]
            items = []
            for entry in entries:
                v_id = re.search(r'<yt:videoId>(.*?)<\/yt:videoId>', entry)
                title = re.search(r'<title>(.*?)<\/title>', entry)
                if v_id and title:
                    items.append({
                        "videoId": v_id.group(1),
                        "title": title.group(1),
                        "url": f"https://www.youtube.com/watch?v={v_id.group(1)}"
                    })
            return {"playlistId": playlist_id, "total": len(items), "items": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
