import React, { useState, useEffect } from 'react';
import {
  Youtube,
  Download,
  Code2,
  Server,
  Layers,
  FileVideo,
  Music,
  Image as ImageIcon,
  Check,
  Copy,
  ExternalLink,
  AlertTriangle,
  Play,
  RefreshCw,
  Terminal,
  ShieldCheck,
  Sliders,
  Sparkles,
  Zap,
  Info,
  ChevronRight,
  Database,
  Lock,
  Boxes,
  FileText,
  Key,
  Globe,
  ArrowDownToLine,
  CheckCircle2,
  Clock
} from 'lucide-react';

interface VideoInfo {
  videoId: string;
  standardUrl: string;
  title: string;
  author: string;
  authorUrl: string;
  thumbnails: {
    maxres: string;
    standard: string;
    high: string;
    medium: string;
    default: string;
  };
  downloadResolvers?: {
    cobalt: string;
    ssyoutube: string;
    y2mate: string;
    y2meta: string;
    loaderto: string;
  };
  embedUrl: string;
  shareUrl: string;
}

interface InvidiousStream {
  resolution?: string;
  qualityLabel?: string;
  container?: string;
  encoding?: string;
  size?: string;
  url?: string;
}

const fastApiCodeMap = {
  main: `# main.py - High-Performance Cookie-Free YouTube Downloader
from fastapi import FastAPI, Query, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import yt_dlp
import os
import tempfile
import shutil
import urllib.parse

app = FastAPI(title="FastAPI Cookie-Free YouTube Downloader", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {
        "status": "online",
        "description": "Cookie-free YouTube media extraction via FastAPI + yt-dlp",
        "endpoints": {
            "info": "/api/v1/info?url=...",
            "download": "/api/v1/download?url=...&format=mp4&quality=1080",
            "stream_url": "/api/v1/stream-url?url=..."
        }
    }

@app.get("/api/v1/info")
def get_info(url: str = Query(..., description="YouTube Video URL")):
    """Extracts metadata without cookies using iOS / Android player client emulation."""
    ydl_opts = {
        'skip_download': True,
        'extract_flat': False,
        'extractor_args': {'youtube': {'player_client': ['ios', 'android']}}
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                "id": info.get("id"),
                "title": info.get("title"),
                "duration": info.get("duration"),
                "uploader": info.get("uploader"),
                "thumbnail": info.get("thumbnail"),
                "formats": [
                    {
                        "format_id": f.get("format_id"),
                        "ext": f.get("ext"),
                        "resolution": f.get("resolution") or f"{f.get('height')}p" if f.get('height') else "audio",
                        "filesize_approx": f.get("filesize_approx"),
                    }
                    for f in info.get("formats", []) if f.get("vcodec") != "none" or f.get("acodec") != "none"
                ][:12]
            }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/v1/stream-url")
def get_stream_urls(url: str = Query(...)):
    """Returns unthrottled direct .googlevideo.com streaming links."""
    ydl_opts = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        'extractor_args': {'youtube': {'player_client': ['ios', 'android']}}
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            formats = info.get("requested_formats", [])
            video_url = formats[0].get("url") if len(formats) > 0 else info.get("url")
            audio_url = formats[1].get("url") if len(formats) > 1 else None
            return {
                "title": info.get("title"),
                "videoStreamUrl": video_url,
                "audioStreamUrl": audio_url,
            }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/v1/download")
def download_media(
    background_tasks: BackgroundTasks,
    url: str = Query(...),
    format: str = Query("mp4", enum=["mp4", "mp3"]),
    quality: str = Query("1080", enum=["max", "1080", "720", "480", "360"]),
):
    """Muxes and streams the complete MP4 or MP3 file in 1MB chunks."""
    temp_dir = tempfile.mkdtemp(prefix="fastapi_yt_")
    out_tmpl = os.path.join(temp_dir, "%(title)s.%(ext)s")

    if format == "mp3":
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': out_tmpl,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '320',
            }],
            'extractor_args': {'youtube': {'player_client': ['ios', 'android']}}
        }
    else:
        height_filter = f"[height<={quality}]" if quality != "max" else ""
        ydl_opts = {
            'format': f'bestvideo{height_filter}[ext=mp4]+bestaudio[ext=m4a]/best{height_filter}[ext=mp4]/best',
            'outtmpl': out_tmpl,
            'merge_output_format': 'mp4',
            'extractor_args': {'youtube': {'player_client': ['ios', 'android']}}
        }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            if format == "mp3":
                filename = os.path.splitext(filename)[0] + ".mp3"

        if not os.path.exists(filename):
            files = [os.path.join(temp_dir, f) for f in os.listdir(temp_dir)]
            filename = files[0] if files else None
            if not filename:
                raise HTTPException(status_code=500, detail="File generation failed")

        def file_iterator(path, chunk_size=1024 * 1024):
            with open(path, "rb") as f:
                while chunk := f.read(chunk_size):
                    yield chunk

        background_tasks.add_task(shutil.rmtree, temp_dir, ignore_errors=True)
        base_name = os.path.basename(filename)
        encoded_name = urllib.parse.quote(base_name)

        return StreamingResponse(
            file_iterator(filename),
            media_type="audio/mpeg" if format == "mp3" else "video/mp4",
            headers={"Content-Disposition": f"attachment; filename*=utf-8''{encoded_name}"}
        )
    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)`,

  requirements: `# requirements.txt
fastapi>=0.110.0
uvicorn[standard]>=0.28.0
yt-dlp>=2024.10.0`,

  dockerfile: `# Dockerfile
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \\
    ffmpeg \\
    curl \\
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]`,

  compose: `# docker-compose.yml
version: '3.8'

services:
  ytdl-fastapi:
    build: .
    container_name: ytdl-fastapi
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      - PYTHONUNBUFFERED=1
    volumes:
      - ./tmp:/tmp`
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'download' | 'ai' | 'fastapi' | 'catalog' | 'codegen' | 'selfhost' | 'matrix'>('download');
  const [inputUrl, setInputUrl] = useState('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const [loading, setLoading] = useState(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // AI Tab state
  const [aiTaskType, setAiTaskType] = useState<'summary' | 'chapters' | 'social' | 'qa'>('summary');
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // AI Code Assistant state
  const [aiCodePrompt, setAiCodePrompt] = useState('Build an asynchronous batch YouTube audio downloader with webhook notification');
  const [aiCodeLang, setAiCodeLang] = useState('python');
  const [aiCodeFramework, setAiCodeFramework] = useState('fastapi');
  const [aiCodeLoading, setAiCodeLoading] = useState(false);
  const [aiCodeResult, setAiCodeResult] = useState<string | null>(null);

  // FastAPI tab state
  const [fastApiFile, setFastApiFile] = useState<'main' | 'requirements' | 'dockerfile' | 'compose'>('main');
  const [fastApiUrlInput, setFastApiUrlInput] = useState('http://localhost:8000');
  const [fastApiTesting, setFastApiTesting] = useState(false);
  const [fastApiTestResult, setFastApiTestResult] = useState<any>(null);

  // Server-Side Downloader State
  const [downloadFormat, setDownloadFormat] = useState<'mp4' | 'mp3'>('mp4');
  const [downloadQuality, setDownloadQuality] = useState<'max' | '1080' | '720' | '480' | '360'>('1080');
  const [downloadingDirect, setDownloadingDirect] = useState(false);
  const [directDownloadError, setDirectDownloadError] = useState<string | null>(null);
  const [showCookieConfig, setShowCookieConfig] = useState(false);
  const [cookieText, setCookieText] = useState('');
  const [proxyUrl, setProxyUrl] = useState('');

  // API Tester & Invidious state
  const [extracting, setExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<any>(null);
  const [invidiousStreams, setInvidiousStreams] = useState<InvidiousStream[]>([]);
  const [customInstance, setCustomInstance] = useState('https://api.cobalt.tools/');

  // Code Gen state
  const [selectedApiCode, setSelectedApiCode] = useState<'cobalt' | 'ytdlp' | 'invidious' | 'oembed'>('cobalt');
  const [codeLanguage, setCodeLanguage] = useState<'nodejs' | 'python' | 'curl' | 'bash'>('nodejs');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Download History
  const [downloadHistory, setDownloadHistory] = useState<Array<{ id: string; title: string; time: string }>>([
    { id: 'dQw4w9WgXcQ', title: 'Rick Astley - Never Gonna Give You Up', time: 'Just now' }
  ]);

  // Preset sample videos
  const presets = [
    { label: 'Rick Astley (Classic)', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    { label: 'Lofi Chill Beats', url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk' },
    { label: 'Big Buck Bunny 4K', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' },
    { label: 'Node.js Crash Course', url: 'https://www.youtube.com/watch?v=fBNz5xF-Kx4' },
  ];

  // Fetch video info
  const fetchVideoInfo = async (targetUrl = inputUrl) => {
    setLoading(true);
    setErrorMsg(null);
    setDirectDownloadError(null);
    setExtractionResult(null);
    setInvidiousStreams([]);

    try {
      const res = await fetch(`/api/yt/info?url=${encodeURIComponent(targetUrl)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch video metadata');
      }
      setVideoInfo(data);
      
      // Add to history
      setDownloadHistory(prev => {
        const filtered = prev.filter(item => item.id !== data.videoId);
        return [{ id: data.videoId, title: data.title, time: 'Just now' }, ...filtered].slice(0, 5);
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Error parsing YouTube URL');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVideoInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    try {
      const savedCookies = localStorage.getItem('yt_cookies');
      if (savedCookies) setCookieText(savedCookies);
      const savedProxy = localStorage.getItem('yt_proxy');
      if (savedProxy) setProxyUrl(savedProxy);
    } catch {}
  }, []);

  // Direct Server-Side File Download trigger
  const handleServerDownload = async () => {
    if (!videoInfo) return;
    setDownloadingDirect(true);
    setDirectDownloadError(null);

    try {
      const res = await fetch('/api/yt/download-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: videoInfo.standardUrl,
          format: downloadFormat,
          quality: downloadQuality,
          cookies: cookieText,
          proxy: proxyUrl,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Download request failed' }));
        throw new Error(errorData.error || 'Server download error');
      }

      // Read binary stream and trigger browser save
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const cleanTitle = (videoInfo.title || 'youtube_video').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
      a.download = `${cleanTitle}.${downloadFormat}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (err: any) {
      setDirectDownloadError(err.message || 'Download error');
    } finally {
      setDownloadingDirect(false);
    }
  };

  // Test extraction with Cobalt
  const handleExtractMedia = async () => {
    if (!videoInfo) return;
    setExtracting(true);
    setExtractionResult(null);
    setInvidiousStreams([]);

    try {
      const res = await fetch('/api/yt/cobalt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: videoInfo.standardUrl,
          videoQuality: downloadQuality,
          audioFormat: 'mp3',
          downloadMode: downloadFormat === 'mp3' ? 'audio' : 'auto',
          customInstance,
        }),
      });
      const data = await res.json();
      setExtractionResult({
        type: 'cobalt',
        status: res.status,
        data: data.cobaltData,
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Media extraction failed');
    } finally {
      setExtracting(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    if (id === 'code') {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } else {
      setCopiedLink(id);
      setTimeout(() => setCopiedLink(null), 2000);
    }
  };

  // Generate dynamic code snippets
  const getGeneratedCode = () => {
    const vUrl = videoInfo ? videoInfo.standardUrl : inputUrl;
    const vId = videoInfo ? videoInfo.videoId : 'dQw4w9WgXcQ';

    if (selectedApiCode === 'cobalt') {
      if (codeLanguage === 'nodejs') {
        return `// 🚀 Cobalt API v10 - Download Video / Audio in Node.js
import axios from 'axios';

async function downloadWithCobalt() {
  const response = await axios.post('https://api.cobalt.tools/', {
    url: '${vUrl}',
    videoQuality: '${downloadQuality}',
    audioFormat: 'mp3',
    downloadMode: '${downloadFormat === 'mp3' ? 'audio' : 'auto'}',
    filenameStyle: 'pretty'
  }, {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  });

  console.log('Download Stream Result:', response.data);
  if (response.data.url) {
    console.log('Direct Stream / Download URL:', response.data.url);
  }
}

downloadWithCobalt();`;
      }
      if (codeLanguage === 'python') {
        return `# 🚀 Cobalt API v10 - Download in Python
import requests

payload = {
    "url": "${vUrl}",
    "videoQuality": "${downloadQuality}",
    "audioFormat": "mp3",
    "downloadMode": "${downloadFormat === 'mp3' ? 'audio' : 'auto'}",
    "filenameStyle": "pretty"
}

headers = {
    "Accept": "application/json",
    "Content-Type": "application/json"
}

response = requests.post("https://api.cobalt.tools/", json=payload, headers=headers)
data = response.json()
print("Download URL:", data.get("url"))`;
      }
      return `# 🚀 Cobalt API cURL
curl -X POST https://api.cobalt.tools/ \\
  -H "Accept: application/json" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "${vUrl}",
    "videoQuality": "${downloadQuality}",
    "audioFormat": "mp3",
    "downloadMode": "${downloadFormat === 'mp3' ? 'audio' : 'auto'}"
  }'`;
    }

    if (selectedApiCode === 'ytdlp') {
      if (codeLanguage === 'bash' || codeLanguage === 'curl') {
        return `# ⚡ yt-dlp CLI (Industry Gold Standard with Bot Bypass)
# 1. Best MP4 Video with iOS/Android client emulation:
yt-dlp --extractor-args "youtube:player_client=ios,android" \\
  -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" \\
  "${vUrl}"

# 2. Extract highest quality MP3 Audio:
yt-dlp --extractor-args "youtube:player_client=ios,android" \\
  -x --audio-format mp3 --audio-quality 0 \\
  "${vUrl}"`;
      }
      if (codeLanguage === 'python') {
        return `# ⚡ Python yt-dlp library integration
import yt_dlp

ydl_opts = {
    'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    'outtmpl': '%(title)s.%(ext)s',
    'extractor_args': {'youtube': {'player_client': ['ios', 'android']}},
}

with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    ydl.download(["${vUrl}"])`;
      }
      return `// ⚡ Node.js child_process wrapper for yt-dlp
import { spawn } from 'child_process';

const ytdlp = spawn('yt-dlp', [
  '--extractor-args', 'youtube:player_client=ios,android',
  '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
  '${vUrl}'
]);

ytdlp.stdout.on('data', data => console.log(data.toString()));
ytdlp.on('close', code => console.log('Download finished with code:', code));`;
    }

    if (selectedApiCode === 'invidious') {
      return `// 🌐 Invidious API - Fetch raw streaming URLs
import fetch from 'node-fetch';

async function getInvidiousStreams(videoId) {
  const instance = 'https://invidious.nerdvpn.de';
  const res = await fetch(\`\${instance}/api/v1/videos/\${videoId}\`);
  const data = await res.json();
  console.log('Direct MP4 Streams:', data.formatStreams);
}

getInvidiousStreams('${vId}');`;
    }

    // oEmbed
    return `// 🆓 Official YouTube oEmbed (Free metadata, no API key)
fetch('https://www.youtube.com/oembed?url=${encodeURIComponent(vUrl)}&format=json')
  .then(res => res.json())
  .then(data => console.log('Video Metadata:', data));`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-rose-500 selection:text-white">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 via-red-500 to-amber-500 flex items-center justify-center shadow-lg shadow-rose-600/25 shrink-0">
            <Youtube className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base tracking-tight text-white">YouTube Downloader & API Hub</h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Downloads Active
              </span>
            </div>
            <p className="text-xs text-slate-400">Direct MP4/MP3 Downloads, Resolvers, Cobalt & yt-dlp API Tools</p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 overflow-x-auto max-w-full">
          <button
            onClick={() => setActiveTab('download')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'download'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            Download Station
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'ai'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-300" />
            AI Intelligence
          </button>
          <button
            onClick={() => setActiveTab('fastapi')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'fastapi'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            FastAPI (No-Cookie)
          </button>
          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'catalog'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            API Directory
          </button>
          <button
            onClick={() => setActiveTab('codegen')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'codegen'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            Code Generator
          </button>
          <button
            onClick={() => setActiveTab('selfhost')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'selfhost'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            Docker & Bot Bypass
          </button>
          <button
            onClick={() => setActiveTab('matrix')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'matrix'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Format Matrix
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">
        
        {/* TAB 1: DOWNLOAD STATION */}
        {activeTab === 'download' && (
          <div className="space-y-8">
            
            {/* Search / URL input bar */}
            <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-5 space-y-4 shadow-xl">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Youtube className="w-5 h-5 text-rose-500" />
                  </div>
                  <input
                    type="text"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    placeholder="Paste any YouTube URL (e.g. https://www.youtube.com/watch?v=... or https://youtu.be/...)"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-rose-500 rounded-xl pl-11 pr-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500 transition-all font-mono"
                  />
                </div>
                <button
                  onClick={() => fetchVideoInfo(inputUrl)}
                  disabled={loading}
                  className="px-6 py-3 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-800 text-white font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-600/25 shrink-0"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  Fetch Video
                </button>
              </div>

              {/* Sample Presets */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800/60">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium mr-1">Quick Select:</span>
                  {presets.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setInputUrl(preset.url);
                        fetchVideoInfo(preset.url);
                      }}
                      className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/50 transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {downloadHistory.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Recent: {downloadHistory[0].title.slice(0, 24)}...</span>
                  </div>
                )}
              </div>

              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>

            {/* Main Video & Download Layout */}
            {videoInfo && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Left Column: Embed Preview & Direct Asset Downloads */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-lg">
                    <div className="aspect-video w-full bg-black relative">
                      <iframe
                        src={`${videoInfo.embedUrl}?autoplay=0`}
                        title={videoInfo.title}
                        className="w-full h-full border-0"
                        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                    <div className="p-5 space-y-3">
                      <h2 className="font-bold text-white text-base leading-snug">{videoInfo.title}</h2>
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <a
                          href={videoInfo.authorUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-rose-400 flex items-center gap-1 font-medium transition-colors"
                        >
                          Channel: {videoInfo.author}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <span className="font-mono text-slate-500">ID: {videoInfo.videoId}</span>
                      </div>

                      <div className="pt-2 flex items-center gap-2">
                        <button
                          onClick={() => copyToClipboard(videoInfo.standardUrl, 'stdUrl')}
                          className="flex-1 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 flex items-center justify-center gap-1.5 transition-colors border border-slate-700/50"
                        >
                          {copiedLink === 'stdUrl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          Copy URL
                        </button>
                        <a
                          href={videoInfo.standardUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 flex items-center justify-center gap-1.5 transition-colors border border-slate-700/50"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open on YouTube
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* 1-Click Native Asset Downloads */}
                  <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4 shadow-lg">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-amber-400" />
                        Direct HD Thumbnails & Subtitles
                      </h3>
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-medium">
                        100% Free & Direct
                      </span>
                    </div>

                    <div className="space-y-2">
                      {/* Maxres Thumbnail */}
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-white">Full HD MaxRes Thumbnail</div>
                          <div className="text-[11px] font-mono text-slate-500">1280x720 (maxresdefault.jpg)</div>
                        </div>
                        <a
                          href={videoInfo.thumbnails.maxres}
                          download={`${videoInfo.videoId}-maxres.jpg`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-xs font-medium text-white rounded-lg flex items-center gap-1 shadow-sm transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" /> Save Image
                        </a>
                      </div>

                      {/* Captions SRT */}
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-white">Subtitles Track (.SRT)</div>
                          <div className="text-[11px] font-mono text-slate-500">Formatted closed-caption file</div>
                        </div>
                        <a
                          href={`/api/yt/subtitles?videoId=${videoInfo.videoId}&format=srt`}
                          download={`${videoInfo.videoId}.srt`}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded-lg flex items-center gap-1 transition-colors"
                        >
                          <FileText className="w-3.5 h-3.5" /> Download .SRT
                        </a>
                      </div>

                      {/* Video JSON Metadata */}
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-white">Complete Metadata (.JSON)</div>
                          <div className="text-[11px] font-mono text-slate-500">Title, author, thumbnails, links</div>
                        </div>
                        <button
                          onClick={() => {
                            const blob = new Blob([JSON.stringify(videoInfo, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${videoInfo.videoId}_metadata.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded-lg flex items-center gap-1 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" /> Save JSON
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Download Station & Resolvers */}
                <div className="lg:col-span-7 space-y-6">
                  
                  {/* SECTION 1: PRIMARY 1-CLICK INSTANT DOWNLOADS (100% Guaranteed & Free) */}
                  <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-rose-950/40 rounded-2xl border-2 border-rose-500/30 p-6 space-y-5 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-full blur-2xl pointer-events-none"></div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                            Recommended & Guaranteed
                          </span>
                          <span className="text-xs text-slate-400 font-mono">Bypasses Datacenter IP Blocks</span>
                        </div>
                        <h3 className="text-lg font-bold text-white mt-1 flex items-center gap-2">
                          <Zap className="w-5 h-5 text-amber-400" />
                          Instant 1-Click YouTube Downloader
                        </h3>
                        <p className="text-xs text-slate-300 mt-0.5">
                          Directly downloads from your residential browser connection without triggering cloud bot blocks:
                        </p>
                      </div>
                    </div>

                    {/* Primary Big Action Buttons */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                      {/* Cobalt 1-Click */}
                      <a
                        href={videoInfo.downloadResolvers?.cobalt || `https://cobalt.tools/#${encodeURIComponent(videoInfo.standardUrl)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-4 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500 transition-all flex items-center justify-between group shadow-md"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 group-hover:scale-105 transition-transform">
                            <Sparkles className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white group-hover:text-emerald-400 flex items-center gap-1.5 transition-colors">
                              Download via Cobalt
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-mono">Best</span>
                            </div>
                            <div className="text-xs text-slate-400">1080p/4K MP4 & MP3 (0 Ads)</div>
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                      </a>

                      {/* ssYouTube 1-Click */}
                      <a
                        href={videoInfo.downloadResolvers?.ssyoutube || `https://www.ssyoutube.com/watch?v=${videoInfo.videoId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-4 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-rose-500 transition-all flex items-center justify-between group shadow-md"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center border border-rose-500/20 group-hover:scale-105 transition-transform">
                            <FileVideo className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white group-hover:text-rose-400 flex items-center gap-1.5 transition-colors">
                              Download MP4 (ssYouTube)
                            </div>
                            <div className="text-xs text-slate-400">Direct 720p / 1080p Video</div>
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-rose-400 transition-colors" />
                      </a>

                      {/* Y2Mate MP3 & MP4 */}
                      <a
                        href={videoInfo.downloadResolvers?.y2mate || `https://y2mate.is/watch?v=${videoInfo.videoId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-4 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-amber-500 transition-all flex items-center justify-between group shadow-md"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20 group-hover:scale-105 transition-transform">
                            <Music className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white group-hover:text-amber-400 flex items-center gap-1.5 transition-colors">
                              Download MP3 (Y2Mate)
                            </div>
                            <div className="text-xs text-slate-400">320kbps High Fidelity Audio</div>
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition-colors" />
                      </a>

                      {/* Loader.to */}
                      <a
                        href={videoInfo.downloadResolvers?.loaderto || `https://loader.to/?link=${encodeURIComponent(videoInfo.standardUrl)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-4 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500 transition-all flex items-center justify-between group shadow-md"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center border border-cyan-500/20 group-hover:scale-105 transition-transform">
                            <Sliders className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white group-hover:text-cyan-400 flex items-center gap-1.5 transition-colors">
                              Loader.to Multi-Format
                            </div>
                            <div className="text-xs text-slate-400">WAV, FLAC, M4A, 4K Formats</div>
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                      </a>
                    </div>
                  </div>

                  {/* SECTION 2: Advanced Server-Side Downloader */}
                  <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-5 shadow-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                          <Server className="w-5 h-5 text-indigo-400" />
                          Direct Server Stream Engine (yt-dlp)
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          For developers and self-hosters wanting programmatic server-side downloads.
                        </p>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                        Docker / Cloud Run
                      </span>
                    </div>

                    {/* Format Toggle */}
                    <div className="grid grid-cols-2 gap-3 p-1 bg-slate-950 rounded-xl border border-slate-800">
                      <button
                        onClick={() => setDownloadFormat('mp4')}
                        className={`py-2 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                          downloadFormat === 'mp4'
                            ? 'bg-rose-600 text-white shadow-md'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <FileVideo className="w-4 h-4" />
                        MP4 Video File
                      </button>
                      <button
                        onClick={() => setDownloadFormat('mp3')}
                        className={`py-2 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                          downloadFormat === 'mp3'
                            ? 'bg-rose-600 text-white shadow-md'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Music className="w-4 h-4" />
                        MP3 Audio File
                      </button>
                    </div>

                    {/* Quality Picker */}
                    {downloadFormat === 'mp4' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Target Video Resolution
                        </label>
                        <select
                          value={downloadQuality}
                          onChange={(e: any) => setDownloadQuality(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                        >
                          <option value="max">Best Quality (Auto Max 4K / 1080p)</option>
                          <option value="1080">1080p Full HD</option>
                          <option value="720">720p HD</option>
                          <option value="480">480p Standard</option>
                          <option value="360">360p Compact</option>
                        </select>
                      </div>
                    )}

                    {/* Trigger Direct Download Button */}
                    <button
                      onClick={handleServerDownload}
                      disabled={downloadingDirect}
                      className="w-full py-3.5 bg-slate-850 hover:bg-slate-800 border border-slate-700 text-white font-semibold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
                    >
                      {downloadingDirect ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-rose-400" />
                          Processing Server Stream...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4 text-rose-400" />
                          Run Server Stream ({downloadFormat.toUpperCase()})
                        </>
                      )}
                    </button>

                    {/* Datacenter Bot Protection Notice & Cookie Helper */}
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-300 flex items-center gap-2">
                          <Key className="w-3.5 h-3.5 text-amber-400" />
                          Server Authentication (cookies.txt / Proxy)
                        </span>
                        <button
                          onClick={() => setShowCookieConfig(!showCookieConfig)}
                          className="text-[11px] text-rose-400 hover:text-rose-300 font-medium"
                        >
                          {showCookieConfig ? 'Hide' : 'Configure'}
                        </button>
                      </div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">
                        Cloud providers (Google Cloud, AWS, DigitalOcean) share datacenter IP ranges that YouTube blocks by default. Supplying a Netscape <code>cookies.txt</code> or residential proxy allows the server to stream directly without bans.
                      </p>

                      {showCookieConfig && (
                        <div className="pt-2 space-y-2 border-t border-slate-800">
                          <textarea
                            value={cookieText}
                            onChange={(e) => {
                              setCookieText(e.target.value);
                              try { localStorage.setItem('yt_cookies', e.target.value); } catch {}
                            }}
                            placeholder="Paste your Netscape cookies.txt here to authenticate the server stream..."
                            rows={4}
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-slate-300 focus:outline-none focus:border-rose-500"
                          />
                          <input
                            type="text"
                            value={proxyUrl}
                            onChange={(e) => {
                              setProxyUrl(e.target.value);
                              try { localStorage.setItem('yt_proxy', e.target.value); } catch {}
                            }}
                            placeholder="Optional Residential Proxy (e.g. socks5://user:pass@proxy.com:1080)"
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-[11px] font-mono text-slate-300 focus:outline-none focus:border-rose-500"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: GEMINI AI INTELLIGENCE & API GENERATOR */}
        {activeTab === 'ai' && (
          <div className="space-y-6">
            {/* Top Banner */}
            <div className="rounded-2xl bg-gradient-to-r from-purple-950/60 via-slate-900 to-indigo-950/60 border border-purple-500/30 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 shadow-2xl relative overflow-hidden">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3 text-purple-400" />
                    Powered by Gemini 3.8 Flash
                  </span>
                  <span className="text-xs text-slate-400 font-mono">@google/genai SDK</span>
                </div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  AI Video Intelligence & Media API Assistant
                </h2>
                <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                  Turn any YouTube video into summaries, timestamped chapters, viral social threads, or ask questions. Plus, use AI to generate custom media extraction APIs in Python, Node.js, and Go.
                </p>
              </div>

              {videoInfo && (
                <div className="hidden lg:flex items-center gap-3 p-3 rounded-xl bg-slate-950/80 border border-purple-500/20 max-w-xs shrink-0">
                  <img
                    src={videoInfo.thumbnails.high || videoInfo.thumbnails.medium}
                    alt={videoInfo.title}
                    className="w-16 h-12 rounded-lg object-cover"
                  />
                  <div className="overflow-hidden">
                    <div className="text-xs font-bold text-white truncate">{videoInfo.title}</div>
                    <div className="text-[11px] text-slate-400 truncate">{videoInfo.author}</div>
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 1: Video Intelligence & Repurposing */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-6 shadow-xl">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                  1. Video Insights & Repurposing Engine
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Select an AI task to analyze <strong>{videoInfo ? `"${videoInfo.title.slice(0, 50)}..."` : 'the active video'}</strong>:
                </p>
              </div>

              {/* Task Mode Selector */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  onClick={() => setAiTaskType('summary')}
                  className={`p-3 rounded-xl text-left border transition-all ${
                    aiTaskType === 'summary'
                      ? 'bg-purple-950/60 border-purple-500/80 text-white shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-xs text-purple-300 flex items-center gap-1.5 mb-1">
                    🎯 Executive Summary
                  </div>
                  <div className="text-[11px] text-slate-400">TL;DR, core insights & key takeaways</div>
                </button>

                <button
                  onClick={() => setAiTaskType('chapters')}
                  className={`p-3 rounded-xl text-left border transition-all ${
                    aiTaskType === 'chapters'
                      ? 'bg-purple-950/60 border-purple-500/80 text-white shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-xs text-indigo-300 flex items-center gap-1.5 mb-1">
                    ⏱️ Video Chapters
                  </div>
                  <div className="text-[11px] text-slate-400">Timestamped topics & outline</div>
                </button>

                <button
                  onClick={() => setAiTaskType('social')}
                  className={`p-3 rounded-xl text-left border transition-all ${
                    aiTaskType === 'social'
                      ? 'bg-purple-950/60 border-purple-500/80 text-white shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-xs text-amber-300 flex items-center gap-1.5 mb-1">
                    🚀 Social Repurpose
                  </div>
                  <div className="text-[11px] text-slate-400">X Thread + LinkedIn + Newsletter</div>
                </button>

                <button
                  onClick={() => setAiTaskType('qa')}
                  className={`p-3 rounded-xl text-left border transition-all ${
                    aiTaskType === 'qa'
                      ? 'bg-purple-950/60 border-purple-500/80 text-white shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-xs text-emerald-300 flex items-center gap-1.5 mb-1">
                    💬 Ask AI Question
                  </div>
                  <div className="text-[11px] text-slate-400">Custom Q&A on video concepts</div>
                </button>
              </div>

              {/* Custom Q&A Input (if qa is active) */}
              {aiTaskType === 'qa' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Your Question about this video:</label>
                  <input
                    type="text"
                    value={aiQuestion}
                    onChange={(e) => setAiQuestion(e.target.value)}
                    placeholder="e.g. What are the key architectural trade-offs explained in this video?"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Action Button */}
              <button
                onClick={async () => {
                  if (!videoInfo) return;
                  setAiLoading(true);
                  setAiError(null);
                  try {
                    const res = await fetch('/api/ai/video-insights', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        title: videoInfo.title,
                        author: videoInfo.author,
                        videoId: videoInfo.videoId,
                        taskType: aiTaskType,
                        question: aiQuestion,
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok || !data.success) {
                      throw new Error(data.error || 'Failed to generate AI insights');
                    }
                    setAiResult(data.result);
                  } catch (err: any) {
                    setAiError(err.message || 'AI request error');
                  } finally {
                    setAiLoading(false);
                  }
                }}
                disabled={aiLoading}
                className="w-full py-3.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-600/25 cursor-pointer"
              >
                {aiLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Generating with Gemini 3.8 Flash...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-purple-200" />
                    Generate {aiTaskType === 'summary' ? 'Summary' : aiTaskType === 'chapters' ? 'Chapters' : aiTaskType === 'social' ? 'Social Content' : 'Answer'} with Gemini
                  </>
                )}
              </button>

              {aiError && (
                <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{aiError}</span>
                </div>
              )}

              {/* Result Output Card */}
              {aiResult && (
                <div className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden shadow-lg">
                  <div className="bg-slate-900/80 px-4 py-2.5 flex items-center justify-between border-b border-slate-800">
                    <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Gemini 3.8 Flash Analysis Result
                    </span>
                    <button
                      onClick={() => copyToClipboard(aiResult, 'ai-res')}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors border border-slate-700"
                    >
                      {copiedLink === 'ai-res' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedLink === 'ai-res' ? 'Copied!' : 'Copy Result'}
                    </button>
                  </div>
                  <div className="p-5 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
                    {aiResult}
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 2: AI Code Assistant for Custom YouTube APIs */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-5 shadow-xl">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-indigo-400" />
                  2. AI Code Assistant: Custom YouTube API & Pipeline Generator
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Ask Gemini to code custom YouTube downloading pipelines, webhook servers, batch scrapers, or Telegram bots in any language:
                </p>
              </div>

              {/* Preset prompts */}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-slate-500 font-medium self-center mr-1">Presets:</span>
                {[
                  'FastAPI batch downloader with async queue and Redis',
                  'Node.js Express stream proxy with WebSockets progress',
                  'Telegram bot in Python that converts YouTube links to MP3',
                  'Go microservice downloading YouTube audio and uploading to AWS S3',
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => setAiCodePrompt(preset)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 transition-colors"
                  >
                    {preset}
                  </button>
                ))}
              </div>

              {/* Input & Config */}
              <div className="space-y-3">
                <textarea
                  value={aiCodePrompt}
                  onChange={(e) => setAiCodePrompt(e.target.value)}
                  rows={3}
                  placeholder="Describe your custom YouTube API requirement in detail..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500"
                />

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Language</label>
                    <select
                      value={aiCodeLang}
                      onChange={(e) => setAiCodeLang(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                    >
                      <option value="python">Python</option>
                      <option value="typescript">TypeScript</option>
                      <option value="nodejs">Node.js (JavaScript)</option>
                      <option value="go">Go (Golang)</option>
                      <option value="bash">Bash / Shell</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Framework</label>
                    <select
                      value={aiCodeFramework}
                      onChange={(e) => setAiCodeFramework(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                    >
                      <option value="fastapi">FastAPI</option>
                      <option value="express">Express</option>
                      <option value="flask">Flask</option>
                      <option value="standalone">Standalone Script</option>
                      <option value="docker">Dockerized App</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2 flex items-end">
                    <button
                      onClick={async () => {
                        setAiCodeLoading(true);
                        try {
                          const res = await fetch('/api/ai/code-assistant', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              prompt: aiCodePrompt,
                              language: aiCodeLang,
                              framework: aiCodeFramework,
                            }),
                          });
                          const data = await res.json();
                          if (data.code) {
                            setAiCodeResult(data.code);
                          }
                        } catch (err: any) {
                          console.error(err);
                        } finally {
                          setAiCodeLoading(false);
                        }
                      }}
                      disabled={aiCodeLoading}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                    >
                      {aiCodeLoading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Coding with Gemini...
                        </>
                      ) : (
                        <>
                          <Code2 className="w-3.5 h-3.5" />
                          Generate Custom API Code
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Code Result */}
              {aiCodeResult && (
                <div className="relative rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
                  <div className="bg-slate-900/80 px-4 py-2 flex items-center justify-between border-b border-slate-800">
                    <span className="text-xs font-mono text-slate-400">Generated Pipeline Code</span>
                    <button
                      onClick={() => copyToClipboard(aiCodeResult, 'ai-code')}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors border border-slate-700"
                    >
                      {copiedLink === 'ai-code' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedLink === 'ai-code' ? 'Copied!' : 'Copy Code'}
                    </button>
                  </div>
                  <pre className="p-5 text-xs text-slate-200 font-mono overflow-x-auto leading-relaxed max-h-[500px]">
                    <code>{aiCodeResult}</code>
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: FASTAPI COOKIE-FREE DOWNLOADER */}
        {activeTab === 'fastapi' && (
          <div className="space-y-6">
            {/* Header intro */}
            <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 shadow-xl">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-wider">
                    Cookie-Free Python Stack
                  </span>
                  <span className="text-xs text-slate-400 font-mono">FastAPI + yt-dlp + FFmpeg</span>
                </div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-400" />
                  FastAPI Cookie-Free YouTube Downloader
                </h2>
                <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                  A high-speed, asynchronous REST API microservice built with <strong>FastAPI</strong> and <strong>yt-dlp</strong>.
                  Uses mobile client emulation (<code>player_client=ios,android</code>) and chunked <code>StreamingResponse</code> so you can stream and download YouTube videos <strong>100% cookie-free</strong> from your laptop, home network, or private VPS!
                </p>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                <button
                  onClick={() => {
                    const blob = new Blob([fastApiCodeMap.main], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'main.py';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg shadow-rose-600/25 transition-all"
                >
                  <Download className="w-4 h-4" /> Download main.py
                </button>
              </div>
            </div>

            {/* Why it works without cookies */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                <div className="font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  1. Mobile App Emulation
                </div>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  Web browsers get challenged with JavaScript n-sig bot walls. Emulating iOS/Android YouTube apps connects directly to mobile endpoints that don't enforce cookies.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                <div className="font-bold text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-indigo-400" />
                  2. Residential & VPS Trust
                </div>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  While Google Cloud / AWS IPs get flagged as datacenter bots, home IPs and cheap unshared VPS nodes enjoy natural trust and download freely without login cookies.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                <div className="font-bold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  3. Zero-RAM Streaming
                </div>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  Uses FastAPI <code>StreamingResponse</code> with 1MB chunk iterators and auto-cleanup background tasks to deliver ultra-fast streaming with minimal memory overhead.
                </p>
              </div>
            </div>

            {/* Interactive Code Viewer for FastAPI Project */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-5 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                {/* File selector tabs */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-400 mr-1 font-medium">Project File:</span>
                  <button
                    onClick={() => setFastApiFile('main')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-mono transition-all ${
                      fastApiFile === 'main' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    main.py (Server)
                  </button>
                  <button
                    onClick={() => setFastApiFile('requirements')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-mono transition-all ${
                      fastApiFile === 'requirements' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    requirements.txt
                  </button>
                  <button
                    onClick={() => setFastApiFile('dockerfile')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-mono transition-all ${
                      fastApiFile === 'dockerfile' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Dockerfile
                  </button>
                  <button
                    onClick={() => setFastApiFile('compose')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-mono transition-all ${
                      fastApiFile === 'compose' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    docker-compose.yml
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyToClipboard(fastApiCodeMap[fastApiFile], 'code')}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors border border-slate-700"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedCode ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>
              </div>

              {/* Code Box */}
              <div className="relative rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
                <div className="bg-slate-900/80 px-4 py-2 flex items-center justify-between border-b border-slate-800 text-xs font-mono text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500/80"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></span>
                    <span className="ml-2 text-slate-300 font-semibold">
                      {fastApiFile === 'main' ? 'main.py' : fastApiFile === 'requirements' ? 'requirements.txt' : fastApiFile === 'dockerfile' ? 'Dockerfile' : 'docker-compose.yml'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">FastAPI &bull; Python 3.11</span>
                </div>

                <pre className="p-5 text-xs text-slate-200 font-mono overflow-x-auto leading-relaxed max-h-[500px]">
                  <code>{fastApiCodeMap[fastApiFile]}</code>
                </pre>
              </div>
            </div>

            {/* How to Run in 3 Commands */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                How to Run on Your PC / Laptop / VPS (3 Steps)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="text-slate-400 text-[11px]">Step 1: Install packages</div>
                  <div className="text-rose-400 bg-slate-900 p-2.5 rounded-lg border border-slate-800 select-all">
                    pip install fastapi uvicorn yt-dlp
                  </div>
                  <div className="text-[11px] text-slate-500 font-sans">Requires Python 3.10+ and ffmpeg installed</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="text-slate-400 text-[11px]">Step 2: Start FastAPI server</div>
                  <div className="text-emerald-400 bg-slate-900 p-2.5 rounded-lg border border-slate-800 select-all">
                    uvicorn main:app --reload --port 8000
                  </div>
                  <div className="text-[11px] text-slate-500 font-sans">Interactive Swagger docs open at <code>/docs</code></div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="text-slate-400 text-[11px]">Step 3: Download any video</div>
                  <div className="text-amber-400 bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-[11px] truncate select-all">
                    curl -OJ "http://localhost:8000/api/v1/download?url=..."
                  </div>
                  <div className="text-[11px] text-slate-500 font-sans">Streams MP4 or MP3 directly to your disk!</div>
                </div>
              </div>
            </div>

            {/* Live Tester for Local FastAPI Instance */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-indigo-400" />
                  Test Your Running FastAPI Instance
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  If you started the server on your machine or VPS, enter the endpoint to test it live from this workbench:
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={fastApiUrlInput}
                  onChange={(e) => setFastApiUrlInput(e.target.value)}
                  placeholder="http://localhost:8000"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-rose-500"
                />
                <button
                  onClick={async () => {
                    setFastApiTesting(true);
                    setFastApiTestResult(null);
                    try {
                      const res = await fetch('/api/yt/test-fastapi', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          fastApiUrl: fastApiUrlInput,
                          videoUrl: videoInfo ? videoInfo.standardUrl : inputUrl,
                        }),
                      });
                      const data = await res.json();
                      setFastApiTestResult(data);
                    } catch (err: any) {
                      setFastApiTestResult({ success: false, error: err.message });
                    } finally {
                      setFastApiTesting(false);
                    }
                  }}
                  disabled={fastApiTesting}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md shrink-0"
                >
                  {fastApiTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                  Test /api/v1/info
                </button>
              </div>

              {fastApiTestResult && (
                <div className={`p-4 rounded-xl border text-xs font-mono ${
                  fastApiTestResult.success 
                    ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300' 
                    : 'bg-red-950/30 border-red-500/30 text-red-300'
                }`}>
                  <div className="font-bold flex items-center gap-1.5 mb-1 font-sans">
                    {fastApiTestResult.success ? <Check className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-red-400" />}
                    {fastApiTestResult.success ? 'Connected Successfully!' : 'Connection Notice'}
                  </div>
                  <pre className="text-[11px] overflow-x-auto max-h-40 p-2 rounded bg-black/40 mt-1">
                    {JSON.stringify(fastApiTestResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 2: COMPLETE API CATALOG */}
        {activeTab === 'catalog' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-rose-500" />
                Working YouTube APIs & Download Services Directory
              </h2>
              <p className="text-xs text-slate-400">
                Detailed architectural analysis of the 6 core methods developers use for YouTube video, audio, and metadata extraction.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Card 1: Cobalt API */}
              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4 hover:border-slate-700 transition-all flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      RECOMMENDED
                    </span>
                    <span className="text-xs font-mono text-slate-500">v10 REST</span>
                  </div>
                  <h3 className="font-bold text-white text-base">Cobalt API (cobalt.tools)</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Modern, open-source, zero-ad media processor. Takes a single POST request and automatically muxes 1080p/4K video with unthrottled audio into ready-to-stream files.
                  </p>

                  <div className="space-y-1.5 text-xs text-slate-300">
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Supports MP4 (up to 4K), MP3, Opus, WAV</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Official Docker container available</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Works for TikTok, Twitter, Soundcloud too</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <button
                    onClick={() => {
                      setSelectedApiCode('cobalt');
                      setActiveTab('codegen');
                    }}
                    className="text-xs font-semibold text-rose-400 hover:text-rose-300 flex items-center gap-1"
                  >
                    View Code Snippets <ChevronRight className="w-3 h-3" />
                  </button>
                  <a
                    href="https://github.com/imputnet/cobalt"
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-500 hover:text-white"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Card 2: yt-dlp */}
              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4 hover:border-slate-700 transition-all flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      INDUSTRY STANDARD
                    </span>
                    <span className="text-xs font-mono text-slate-500">CLI / Python</span>
                  </div>
                  <h3 className="font-bold text-white text-base">yt-dlp Engine & Microservice</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    The active fork of youtube-dl used by 99% of web downloaders. Handles YouTube cipher signatures, n-token decrypting, DASH/HLS segments, and subtitles.
                  </p>

                  <div className="space-y-1.5 text-xs text-slate-300">
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span>Highest reliability and fastest patches</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span>Extracts exact audio/video bitrate options</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span>Easily wrapped in Express / FastAPI REST API</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <button
                    onClick={() => {
                      setSelectedApiCode('ytdlp');
                      setActiveTab('codegen');
                    }}
                    className="text-xs font-semibold text-rose-400 hover:text-rose-300 flex items-center gap-1"
                  >
                    View Code Snippets <ChevronRight className="w-3 h-3" />
                  </button>
                  <a
                    href="https://github.com/yt-dlp/yt-dlp"
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-500 hover:text-white"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Card 3: Invidious API */}
              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4 hover:border-slate-700 transition-all flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      DECENTRALIZED
                    </span>
                    <span className="text-xs font-mono text-slate-500">Public REST</span>
                  </div>
                  <h3 className="font-bold text-white text-base">Invidious REST API</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Decentralized open-source alternative YouTube frontend. Exposes <code>/api/v1/videos/:id</code> with raw googlevideo stream links and adaptive formats.
                  </p>

                  <div className="space-y-1.5 text-xs text-slate-300">
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Direct JSON formats with bitrate and URLs</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Hundreds of public community instances</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>No API key or OAuth authentication needed</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <button
                    onClick={() => {
                      setSelectedApiCode('invidious');
                      setActiveTab('codegen');
                    }}
                    className="text-xs font-semibold text-rose-400 hover:text-rose-300 flex items-center gap-1"
                  >
                    View Code Snippets <ChevronRight className="w-3 h-3" />
                  </button>
                  <a
                    href="https://docs.invidious.io/api/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-500 hover:text-white"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Card 4: Piped API */}
              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4 hover:border-slate-700 transition-all flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      NEWPIPE EXTRACTOR
                    </span>
                    <span className="text-xs font-mono text-slate-500">REST API</span>
                  </div>
                  <h3 className="font-bold text-white text-base">Piped API</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    High-performance YouTube API built on Java/Kotlin NewPipeExtractor. Provides proxy streaming to bypass client geolocation restrictions.
                  </p>

                  <div className="space-y-1.5 text-xs text-slate-300">
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>Endpoints: <code>/streams/:id</code></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>Built-in SponsorBlock & subtitle streams</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>Decentralized node network</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-400">Endpoint: pipedapi.kavin.rocks</span>
                  <a
                    href="https://github.com/TeamPiped/Piped"
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-500 hover:text-white"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Card 5: YouTube Data API v3 */}
              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4 hover:border-slate-700 transition-all flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      OFFICIAL GOOGLE
                    </span>
                    <span className="text-xs font-mono text-slate-500">Google Cloud</span>
                  </div>
                  <h3 className="font-bold text-white text-base">YouTube Data API v3</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Official API for search, playlists, channels, comments, and video metadata. Explicitly does NOT offer MP4/MP3 download streams.
                  </p>

                  <div className="space-y-1.5 text-xs text-slate-300">
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span>Official 10,000 quota units / day</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <span>Comprehensive analytics and search</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500">
                      <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>No media download (TOS Section 5.B)</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-400">Requires Google Cloud API Key</span>
                  <a
                    href="https://developers.google.com/youtube/v3"
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-500 hover:text-white"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Card 6: RapidAPI 3P Gateways */}
              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5 space-y-4 hover:border-slate-700 transition-all flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      MANAGED SAAS
                    </span>
                    <span className="text-xs font-mono text-slate-500">Commercial</span>
                  </div>
                  <h3 className="font-bold text-white text-base">RapidAPI YouTube Gateways</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Commercial managed APIs hosted on RapidAPI (e.g. <code>ytstream-download</code>, <code>youtube-media-downloader</code>) that manage proxy servers for you.
                  </p>

                  <div className="space-y-1.5 text-xs text-slate-300">
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span>Managed infrastructure & proxy rotation</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span>Simple JSON response format</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>Requires monthly paid subscription</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-400">RapidAPI Key required</span>
                  <a
                    href="https://rapidapi.com/search/youtube%20download"
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-500 hover:text-white"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: INTERACTIVE CODE GENERATOR */}
        {activeTab === 'codegen' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Code2 className="w-5 h-5 text-rose-500" />
                Interactive API Code Generator
              </h2>
              <p className="text-xs text-slate-400">
                Copy-pasteable production snippets configured with your target YouTube URL.
              </p>
            </div>

            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-6 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-400 mr-1 font-medium">Target API:</span>
                  <button
                    onClick={() => setSelectedApiCode('cobalt')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      selectedApiCode === 'cobalt' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Cobalt API v10
                  </button>
                  <button
                    onClick={() => setSelectedApiCode('ytdlp')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      selectedApiCode === 'ytdlp' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    yt-dlp Engine
                  </button>
                  <button
                    onClick={() => setSelectedApiCode('invidious')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      selectedApiCode === 'invidious' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Invidious REST
                  </button>
                  <button
                    onClick={() => setSelectedApiCode('oembed')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      selectedApiCode === 'oembed' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Free oEmbed (No Key)
                  </button>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setCodeLanguage('nodejs')}
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-colors ${
                      codeLanguage === 'nodejs' ? 'bg-slate-800 text-rose-400' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Node.js
                  </button>
                  <button
                    onClick={() => setCodeLanguage('python')}
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-colors ${
                      codeLanguage === 'python' ? 'bg-slate-800 text-rose-400' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Python
                  </button>
                  <button
                    onClick={() => setCodeLanguage('curl')}
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-colors ${
                      codeLanguage === 'curl' ? 'bg-slate-800 text-rose-400' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    cURL
                  </button>
                  <button
                    onClick={() => setCodeLanguage('bash')}
                    className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-colors ${
                      codeLanguage === 'bash' ? 'bg-slate-800 text-rose-400' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Bash
                  </button>
                </div>
              </div>

              <div className="relative rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
                <div className="bg-slate-900/80 px-4 py-2.5 flex items-center justify-between border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500/80"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></span>
                    <span className="text-xs font-mono text-slate-400 ml-2">
                      snippet.{codeLanguage === 'nodejs' ? 'ts' : codeLanguage === 'python' ? 'py' : 'sh'}
                    </span>
                  </div>

                  <button
                    onClick={() => copyToClipboard(getGeneratedCode(), 'code')}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors border border-slate-700/60"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedCode ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>

                <pre className="p-5 text-xs text-slate-200 font-mono overflow-x-auto leading-relaxed">
                  <code>{getGeneratedCode()}</code>
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SELF-HOSTING & DOCKER */}
        {activeTab === 'selfhost' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Server className="w-5 h-5 text-rose-500" />
                Self-Hosting & Bypassing YouTube Anti-Bot 429 Blocks
              </h2>
              <p className="text-xs text-slate-400">
                Crucial operational architecture to run your own reliable YouTube download microservice without IP bans.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Docker Compose Setup */}
              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <Boxes className="w-4 h-4 text-emerald-400" />
                    Option A: 1-Click Cobalt Docker Stack
                  </h3>
                  <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded font-mono text-slate-400">
                    docker-compose.yml
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Deploying your own private Cobalt container on a VPS (Hetzner, AWS, DigitalOcean) removes all rate limits:
                </p>

                <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-[11px] text-slate-300 overflow-x-auto">
{`version: '3.8'
services:
  cobalt-api:
    image: ghcr.io/imputnet/cobalt:10
    restart: unless-stopped
    ports:
      - "9000:9000"
    environment:
      API_URL: "https://cobalt.yourdomain.com/"
      COOKIE_PATH: "/app/cookies.txt"
    volumes:
      - ./cookies.txt:/app/cookies.txt:ro`}
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1">
                  <div className="font-semibold text-rose-400">To Launch:</div>
                  <div className="font-mono text-[11px] text-slate-400">docker compose up -d</div>
                  <div className="text-[11px] text-slate-500">Your API is immediately available at port 9000!</div>
                </div>
              </div>

              {/* Express + yt-dlp Microservice */}
              <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-white text-sm flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-indigo-400" />
                    Option B: Node.js Express + yt-dlp REST Server
                  </h3>
                  <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded font-mono text-slate-400">
                    server.js
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Wrap <code>yt-dlp</code> inside a simple Express REST microservice that takes JSON and outputs stream URLs:
                </p>

                <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-[11px] text-slate-300 overflow-x-auto">
{`const express = require('express');
const { spawn } = require('child_process');
const app = express();
app.use(express.json());

app.post('/api/stream', (req, res) => {
  const { url } = req.body;
  const ytdlp = spawn('yt-dlp', [
    '-g', 
    '--extractor-args', 'youtube:player_client=ios,android',
    '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
    url
  ]);

  let output = '';
  ytdlp.stdout.on('data', data => output += data);
  ytdlp.on('close', code => {
    if (code !== 0) return res.status(500).json({ error: 'Extraction failed' });
    const [videoUrl, audioUrl] = output.trim().split('\\n');
    res.json({ videoUrl, audioUrl });
  });
});

app.listen(8080);`}
                </div>
              </div>
            </div>

            {/* Anti-Bot Checklist */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-rose-500" />
                The 4 Rules to Avoid "Sign in to confirm you're not a bot" & 429 Errors
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-[10px]">1</span>
                    Use Player Client Emulation
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    YouTube heavily protects its web player with complex n-sig cipher challenges, but mobile endpoints (iOS, Android, tv_embedded) are far more permissive.
                    In yt-dlp, pass <code>--extractor-args "youtube:player_client=ios,android"</code>.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-[10px]">2</span>
                    Provide cookies.txt
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    Export cookies from an authenticated browser session (using "Get cookies.txt locally" extension) and mount it into your downloader using <code>--cookies cookies.txt</code>.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-[10px]">3</span>
                    Residential Proxies for Datacenter IPs
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    YouTube flags AWS/DigitalOcean/Hetzner IP ranges after thousands of hits. Use a rotating residential proxy pool (SmartProxy, BrightData, Webshare) via <code>--proxy socks5://...</code>.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-[10px]">4</span>
                    Keep Extractor Binary Updated
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    YouTube updates its obfuscation scripts almost weekly. Run <code>yt-dlp -U</code> daily in your CI/cron job to stay synchronized with the latest cipher fixes.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: FORMAT & QUALITY MATRIX */}
        {activeTab === 'matrix' && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-rose-500" />
                Format, Codec & Audio-Video Muxing Breakdown
              </h2>
              <p className="text-xs text-slate-400">
                Understanding how YouTube stores separate video and audio streams (DASH) and how download APIs combine them.
              </p>
            </div>

            <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-mono">
                    <tr>
                      <th className="p-4">Target Resolution</th>
                      <th className="p-4">Video Codec</th>
                      <th className="p-4">Audio Codec</th>
                      <th className="p-4">Muxing Required?</th>
                      <th className="p-4">Best API to Use</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    <tr>
                      <td className="p-4 font-bold text-white">4K (2160p60)</td>
                      <td className="p-4 font-mono text-purple-400">VP9 / AV01</td>
                      <td className="p-4 font-mono text-amber-400">Opus 160kbps</td>
                      <td className="p-4"><span className="text-rose-400 font-semibold">Yes (Separate DASH tracks)</span></td>
                      <td className="p-4 font-semibold text-emerald-400">Cobalt API or yt-dlp + ffmpeg</td>
                    </tr>
                    <tr>
                      <td className="p-4 font-bold text-white">1080p Full HD</td>
                      <td className="p-4 font-mono text-purple-400">H.264 (avc1) / VP9</td>
                      <td className="p-4 font-mono text-amber-400">M4A (AAC) / Opus</td>
                      <td className="p-4"><span className="text-rose-400 font-semibold">Yes</span></td>
                      <td className="p-4 font-semibold text-emerald-400">Cobalt API or yt-dlp</td>
                    </tr>
                    <tr>
                      <td className="p-4 font-bold text-white">720p HD</td>
                      <td className="p-4 font-mono text-indigo-400">H.264</td>
                      <td className="p-4 font-mono text-indigo-400">AAC 128kbps</td>
                      <td className="p-4"><span className="text-emerald-400 font-semibold">Optional (legacy muxed exists)</span></td>
                      <td className="p-4 font-semibold text-emerald-400">Invidious, Cobalt, yt-dlp</td>
                    </tr>
                    <tr>
                      <td className="p-4 font-bold text-white">Audio Only (MP3)</td>
                      <td className="p-4 text-slate-500">None</td>
                      <td className="p-4 font-mono text-amber-400">LAME MP3 320k (re-encoded)</td>
                      <td className="p-4"><span className="text-slate-400">Re-encode from Opus/AAC</span></td>
                      <td className="p-4 font-semibold text-emerald-400">Cobalt API (audioFormat: 'mp3')</td>
                    </tr>
                    <tr>
                      <td className="p-4 font-bold text-white">HD Thumbnails</td>
                      <td className="p-4 font-mono text-emerald-400">JPEG (1280x720)</td>
                      <td className="p-4 text-slate-500">None</td>
                      <td className="p-4"><span className="text-emerald-400 font-semibold">No (Direct URL)</span></td>
                      <td className="p-4 font-semibold text-emerald-400">Native img.youtube.com (Free)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 px-6 py-6 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4 max-w-7xl w-full mx-auto">
        <div className="flex items-center gap-2">
          <Youtube className="w-4 h-4 text-rose-500" />
          <span>YouTube API & Downloader Hub</span>
        </div>
        <div className="text-slate-500">
          Built for developers &bull; Express + yt-dlp + ffmpeg + React + TypeScript + Tailwind CSS
        </div>
      </footer>
    </div>
  );
}
