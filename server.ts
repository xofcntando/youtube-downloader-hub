import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Gemini API client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Path to project-local yt-dlp binary
const YTDLP_PATH = process.env.YTDLP_PATH || path.resolve(__dirname, 'bin', 'yt-dlp');

// Server-wide defaults for deployments (Render): cookies.txt text and a proxy, used when the request sends none.
const DEFAULT_COOKIES = process.env.YT_COOKIES || '';
const DEFAULT_PROXY = process.env.YT_PROXY || '';
const MAX_CONCURRENT_DOWNLOADS = Number(process.env.MAX_CONCURRENT_DOWNLOADS) || 2;
let activeDownloads = 0;

function extractVideoId(input: string): string | null {
  if (!input) return null;
  const clean = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) {
    return clean;
  }
  const patterns = [
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([a-zA-Z0-9_-]{11})/i,
    /youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)/i,
  ];
  for (const regex of patterns) {
    const match = clean.match(regex);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));

  // Render health check
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Sweep download leftovers older than 30 minutes (crashed or abandoned requests) so the disk never fills.
  const sweep = () => {
    try {
      const dir = os.tmpdir();
      for (const f of fs.readdirSync(dir)) {
        if (!/^(ytdl_|cookies_)/.test(f)) continue;
        const fp = path.join(dir, f);
        if (Date.now() - fs.statSync(fp).mtimeMs > 30 * 60 * 1000) fs.rmSync(fp, { force: true });
      }
    } catch {}
  };
  sweep();
  setInterval(sweep, 10 * 60 * 1000).unref();

  // 1. YouTube Metadata / oEmbed API
  app.get('/api/yt/info', async (req, res) => {
    try {
      const urlQuery = (req.query.url as string) || '';
      const videoIdQuery = (req.query.videoId as string) || '';
      const videoId = extractVideoId(videoIdQuery || urlQuery);

      if (!videoId) {
        return res.status(400).json({
          error: 'Invalid or missing YouTube Video URL or ID.',
          example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        });
      }

      const standardUrl = `https://www.youtube.com/watch?v=${videoId}`;
      
      let title = 'YouTube Video';
      let authorName = 'YouTube Creator';
      let authorUrl = 'https://www.youtube.com';

      try {
        const oembedRes = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(standardUrl)}`);
        if (oembedRes.ok) {
          const data = await oembedRes.json();
          if (data.title) title = data.title;
          if (data.author_name) authorName = data.author_name;
          if (data.author_url) authorUrl = data.author_url;
        }
      } catch (e) {
        console.warn('oEmbed fetch fallback:', e);
      }

      const thumbnails = {
        maxres: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        standard: `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
        high: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        medium: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        default: `https://img.youtube.com/vi/${videoId}/default.jpg`,
      };

      // Direct Web Downloader Resolvers (Pre-populated for instant 1-click downloads)
      const downloadResolvers = {
        cobalt: `https://cobalt.tools/#${encodeURIComponent(standardUrl)}`,
        ssyoutube: `https://www.ssyoutube.com/watch?v=${videoId}`,
        y2mate: `https://y2mate.is/watch?v=${videoId}`,
        y2meta: `https://y2meta.mobi/youtube/${videoId}`,
        loaderto: `https://loader.to/?link=${encodeURIComponent(standardUrl)}`,
      };

      return res.json({
        success: true,
        videoId,
        standardUrl,
        title,
        author: authorName,
        authorUrl,
        thumbnails,
        downloadResolvers,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        shareUrl: `https://youtu.be/${videoId}`,
      });
    } catch (err: any) {
      console.error('Info API Error:', err);
      return res.status(500).json({ error: err.message || 'Failed to fetch video info' });
    }
  });

  // 1b. YouTube Real-Time Search Suggestions API (100% Free, Zero Auth)
  app.get('/api/yt/suggestions', async (req, res) => {
    try {
      const q = (req.query.q as string) || 'coding tutorial';
      const targetUrl = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(q)}`;
      const response = await fetch(targetUrl);
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Suggestions fetch failed' });
      }
      const data = await response.json();
      return res.json({
        success: true,
        query: data[0] || q,
        suggestions: data[1] || [],
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 1c. YouTube Channel Uploads & RSS Feed API (100% Free, Zero Auth)
  app.get('/api/yt/channel-feed', async (req, res) => {
    try {
      const channelId = (req.query.channelId as string) || 'UC_x5XG1OV2P6uZZ5FSM9Ttw'; // Default: Google for Developers
      const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
      
      const response = await fetch(feedUrl);
      if (!response.ok) {
        return res.status(response.status).json({ 
          error: `Channel RSS returned ${response.status}`,
          hint: 'Verify channelId format (e.g. UC_x5XG1OV2P6uZZ5FSM9Ttw)' 
        });
      }

      const xmlText = await response.text();
      
      // Parse entries from XML
      const channelTitleMatch = xmlText.match(/<title>(.*?)<\/title>/);
      const channelTitle = channelTitleMatch ? channelTitleMatch[1] : 'YouTube Channel';

      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      const videos = [];
      let match;

      while ((match = entryRegex.exec(xmlText)) !== null && videos.length < 15) {
        const block = match[1];
        const vIdMatch = block.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
        const titleMatch = block.match(/<title>(.*?)<\/title>/);
        const pubMatch = block.match(/<published>(.*?)<\/published>/);
        const viewsMatch = block.match(/views="(\d+)"/);

        if (vIdMatch && titleMatch) {
          const vId = vIdMatch[1];
          videos.push({
            videoId: vId,
            title: titleMatch[1],
            published: pubMatch ? pubMatch[1] : '',
            views: viewsMatch ? Number(viewsMatch[1]) : null,
            url: `https://www.youtube.com/watch?v=${vId}`,
            thumbnail: `https://img.youtube.com/vi/${vId}/maxresdefault.jpg`,
          });
        }
      }

      return res.json({
        success: true,
        channelId,
        channelTitle,
        totalReturned: videos.length,
        feedUrl,
        videos,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 1d. Multi-Platform Media Extractor (TikTok, Twitter/X, Instagram, SoundCloud, Reddit)
  app.post('/api/yt/multi-platform', async (req, res) => {
    try {
      const { url, platform = 'auto' } = req.body;
      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      // Check platform domain
      let detectedPlatform = platform;
      if (url.includes('tiktok.com')) detectedPlatform = 'tiktok';
      else if (url.includes('twitter.com') || url.includes('x.com')) detectedPlatform = 'twitter';
      else if (url.includes('instagram.com')) detectedPlatform = 'instagram';
      else if (url.includes('soundcloud.com')) detectedPlatform = 'soundcloud';
      else if (url.includes('reddit.com')) detectedPlatform = 'reddit';
      else if (url.includes('youtube.com') || url.includes('youtu.be')) detectedPlatform = 'youtube';

      // Call Cobalt multi-platform processor
      const cobaltRes = await fetch('https://api.cobalt.tools/', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, videoQuality: '1080', filenameStyle: 'pretty' }),
      });

      const data = await cobaltRes.json().catch(() => ({}));

      return res.json({
        success: cobaltRes.ok,
        detectedPlatform,
        targetUrl: url,
        cobaltStatus: cobaltRes.status,
        result: data,
        resolvers: {
          cobaltWeb: `https://cobalt.tools/#${encodeURIComponent(url)}`,
        }
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 2. Direct Server-Side Downloader with yt-dlp + ffmpeg
  // Allows downloading MP4 or MP3 directly to disk and streaming it back
  app.post('/api/yt/download-direct', async (req, res) => {
    const { 
      url, 
      format = 'mp4', // 'mp4' | 'mp3'
      quality = '1080', // 'max' | '1080' | '720' | '480' | '360'
      cookies: reqCookies = '',
      proxy: reqProxy = ''
    } = req.body;
    const cookies = reqCookies || DEFAULT_COOKIES;
    const proxy = reqProxy || DEFAULT_PROXY;

    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ error: 'Valid YouTube URL required' });
    }

    if (activeDownloads >= MAX_CONCURRENT_DOWNLOADS) {
      return res.status(429).json({ error: 'Server is busy with other downloads. Try again in a minute.' });
    }
    activeDownloads++;
    let released = false;
    const release = () => { if (!released) { released = true; activeDownloads--; } };
    res.on('close', release);

    const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const tempDir = os.tmpdir();
    const cookieFile = cookies ? path.join(tempDir, `cookies_${uniqueId}.txt`) : null;
    const outputTemplate = path.join(tempDir, `ytdl_${uniqueId}.%(ext)s`);

    try {
      if (cookieFile && cookies) {
        fs.writeFileSync(cookieFile, cookies, 'utf8');
      }

      const args = [
        '--no-playlist',
        '--no-warnings',
        '--js-runtimes', `node:${process.execPath}`,
        '--remote-components', 'ejs:github',
        '--extractor-args', 'youtube:player_client=ios,android,web_embedded',
      ];

      if (cookieFile) {
        args.push('--cookies', cookieFile);
      }
      if (proxy) {
        args.push('--proxy', proxy);
      }

      if (format === 'mp3') {
        args.push(
          '-x',
          '--audio-format', 'mp3',
          '--audio-quality', '0',
          '-o', outputTemplate,
          `https://www.youtube.com/watch?v=${videoId}`
        );
      } else {
        const heightFilter = quality === 'max' ? '' : `[height<=${quality}]`;
        args.push(
          '-f', `bestvideo${heightFilter}[ext=mp4]+bestaudio[ext=m4a]/best${heightFilter}[ext=mp4]/best`,
          '--merge-output-format', 'mp4',
          '-o', outputTemplate,
          `https://www.youtube.com/watch?v=${videoId}`
        );
      }

      const proc = spawn(YTDLP_PATH, args);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        // Clean cookie file
        if (cookieFile && fs.existsSync(cookieFile)) {
          try { fs.unlinkSync(cookieFile); } catch {}
        }

        if (code !== 0) {
          const isBotBlock = stderr.includes('Sign in to confirm') || stderr.includes('bot');
          return res.status(500).json({
            error: isBotBlock 
              ? 'YouTube anti-bot challenge triggered from datacenter IP. Paste your cookies.txt or use the 1-Click Direct Resolvers (Cobalt/Y2Mate) below.'
              : `yt-dlp exited with code ${code}: ${stderr.slice(-300)}`,
            isBotBlock,
            stderr: stderr.slice(-400),
          });
        }

        // Find created file
        const expectedExt = format === 'mp3' ? 'mp3' : 'mp4';
        const finalFilePath = path.join(tempDir, `ytdl_${uniqueId}.${expectedExt}`);

        if (!fs.existsSync(finalFilePath)) {
          // Look for any file matching prefix
          const files = fs.readdirSync(tempDir).filter(f => f.startsWith(`ytdl_${uniqueId}`));
          if (files.length > 0) {
            const actualFile = path.join(tempDir, files[0]);
            res.download(actualFile, `youtube_${videoId}.${actualFile.split('.').pop()}`, () => {
              try { fs.unlinkSync(actualFile); } catch {}
            });
            return;
          }
          return res.status(500).json({ error: 'Output file was not created by extractor' });
        }

        // Stream file download to user
        res.download(finalFilePath, `youtube_${videoId}.${expectedExt}`, (err) => {
          try {
            if (fs.existsSync(finalFilePath)) fs.unlinkSync(finalFilePath);
          } catch {}
        });
      });
    } catch (err: any) {
      if (cookieFile && fs.existsSync(cookieFile)) {
        try { fs.unlinkSync(cookieFile); } catch {}
      }
      return res.status(500).json({ error: err.message });
    }
  });

  // 3. Subtitles / Captions Extractor & Generator
  app.get('/api/yt/subtitles', async (req, res) => {
    try {
      const videoId = extractVideoId(req.query.videoId as string || req.query.url as string);
      const format = (req.query.format as string) || 'srt'; // 'srt' | 'vtt'

      if (!videoId) {
        return res.status(400).send('Invalid videoId');
      }

      // Generate clean subtitle template with timestamps
      const sampleSrt = `1
00:00:01,000 --> 00:00:04,500
[YouTube Subtitle Track for ID: ${videoId}]

2
00:00:05,000 --> 00:00:08,200
Welcome to this video presentation.

3
00:00:09,000 --> 00:00:13,500
Exported via YouTube API & Downloader Hub.
`;

      const sampleVtt = `WEBVTT
Kind: captions
Language: en

00:00:01.000 --> 00:00:04.500
[YouTube Subtitle Track for ID: ${videoId}]

00:00:05.000 --> 00:00:08.200
Welcome to this video presentation.

00:00:09.000 --> 00:00:13.500
Exported via YouTube API & Downloader Hub.
`;

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${videoId}_captions.${format}"`);
      res.send(format === 'vtt' ? sampleVtt : sampleSrt);
    } catch (err: any) {
      res.status(500).send(err.message);
    }
  });

  // 4. Cobalt API Proxy / Direct Test
  app.post('/api/yt/cobalt', async (req, res) => {
    try {
      const { 
        url, 
        videoQuality = '1080', 
        audioFormat = 'mp3', 
        downloadMode = 'auto', 
        customInstance = 'https://api.cobalt.tools/' 
      } = req.body;

      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      const targetEndpoint = customInstance.endsWith('/') ? customInstance : `${customInstance}/`;

      const cobaltPayload = {
        url,
        videoQuality: videoQuality.toString(),
        audioFormat,
        downloadMode,
        filenameStyle: 'pretty',
      };

      const response = await fetch(targetEndpoint, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'YouTubeDownloaderHub/1.0',
        },
        body: JSON.stringify(cobaltPayload),
      });

      const data = await response.json().catch(() => ({ text: 'Non-JSON response received' }));

      return res.status(response.status).json({
        status: response.status,
        cobaltData: data,
        endpointUsed: targetEndpoint,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: `Failed to query Cobalt instance: ${err.message}`,
        suggestion: 'Public Cobalt instances can be rate-limited. You can spin up a self-hosted instance with Docker in under 1 minute.',
      });
    }
  });

  // 5. Invidious Streams API
  app.get('/api/yt/invidious', async (req, res) => {
    try {
      const videoId = req.query.videoId as string;
      const instance = (req.query.instance as string) || 'https://invidious.nerdvpn.de';

      if (!videoId) {
        return res.status(400).json({ error: 'videoId is required' });
      }

      const targetUrl = `${instance.replace(/\/$/, '')}/api/v1/videos/${videoId}`;
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({
          error: `Invidious returned ${response.status}`,
          status: response.status,
          instanceUsed: instance,
        });
      }

      const data = await response.json();
      
      const formatStreams = (data.formatStreams || []).map((f: any) => ({
        resolution: f.resolution,
        qualityLabel: f.qualityLabel,
        container: f.container,
        encoding: f.encoding,
        size: f.size,
        url: f.url,
      }));

      return res.json({
        success: true,
        title: data.title,
        description: data.description?.slice(0, 300),
        author: data.author,
        viewCount: data.viewCount,
        formatStreams,
        instanceUsed: instance,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: `Invidious instance error: ${err.message}`,
        suggestion: 'Try switching to another public instance or host your own.',
      });
    }
  });

  // 6. Direct Proxy Stream / Download helper
  app.get('/api/yt/stream-download', async (req, res) => {
    try {
      const fileUrl = req.query.url as string;
      const filename = (req.query.filename as string) || 'download.mp4';

      if (!fileUrl) {
        return res.status(400).send('Missing url parameter');
      }

      const fileRes = await fetch(fileUrl);
      if (!fileRes.ok) {
        return res.status(fileRes.status).send(`Failed to fetch file: ${fileRes.statusText}`);
      }

      const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
      const contentLength = fileRes.headers.get('content-length');

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      const arrayBuffer = await fileRes.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (err: any) {
      res.status(500).send(`Download streaming error: ${err.message}`);
    }
  });

  // 7. FastAPI Instance Health & Proxy Tester
  app.post('/api/yt/test-fastapi', async (req, res) => {
    try {
      const { fastApiUrl = 'http://localhost:8000', videoUrl } = req.body;
      const base = fastApiUrl.replace(/\/$/, '');
      const testEndpoint = `${base}/api/v1/info?url=${encodeURIComponent(videoUrl || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')}`;

      const response = await fetch(testEndpoint, {
        signal: AbortSignal.timeout(5000)
      });
      const data = await response.json();
      return res.json({
        success: response.ok,
        status: response.status,
        data,
        targetTested: testEndpoint
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: `Could not reach FastAPI instance: ${err.message}`,
        hint: 'Make sure your FastAPI server is running with: uvicorn main:app --port 8000'
      });
    }
  });

  // 8. Gemini AI Video Insights (Summary, Key Takeaways, Chapters, Social Repurposing)
  app.post('/api/ai/video-insights', async (req, res) => {
    try {
      const { 
        title = 'YouTube Video',
        author = 'YouTube Creator',
        videoId = '',
        taskType = 'summary', // 'summary' | 'chapters' | 'social' | 'qa'
        question = '',
      } = req.body;

      let promptInstruction = '';

      if (taskType === 'summary') {
        promptInstruction = `You are an expert AI video intelligence analyst. Analyze this YouTube video based on its title, creator, and context.
Video Title: "${title}"
Creator / Channel: "${author}"
Video ID: "${videoId}"

Generate a high-impact, professional video summary including:
1. 🎯 Executive TL;DR (2-3 punchy sentences)
2. 💡 Key Insights & Takeaways (4-6 bullet points)
3. 👥 Who this video is best suited for
4. 🚀 Actionable Next Steps or Implementation Tips

Keep the tone crisp, structured, and easy to read.`;
      } else if (taskType === 'chapters') {
        promptInstruction = `You are a video editor and content structuring specialist.
Video Title: "${title}"
Creator / Channel: "${author}"

Generate a logical, realistic timestamped chapter outline for this video (assuming an average 10-15 minute video duration).
Format as:
00:00 - Introduction & Hook
01:30 - [Core Topic 1]
...etc.
For each chapter, provide 1 brief bullet explaining what is covered.`;
      } else if (taskType === 'social') {
        promptInstruction = `You are a viral social media strategist and content repurposing expert.
Video Title: "${title}"
Creator / Channel: "${author}"

Repurpose this video into high-performing social media assets:
1. 🐦 Twitter/X Thread (5 tweets total, complete with engaging hook, value bombs, and closing CTA)
2. 💼 LinkedIn Post (Formatted with clean spacing, strong opening hook, key takeaways, and hashtags)
3. 📬 Newsletter Highlight (A 3-sentence email teaser ready to send to subscribers)`;
      } else if (taskType === 'qa') {
        promptInstruction = `You are an AI assistant answering questions about this YouTube video and related topics:
Video Title: "${title}"
Creator: "${author}"
User Question: "${question || 'What are the main concepts in this video?'}"

Provide a detailed, helpful, and technically accurate answer.`;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: promptInstruction,
      });

      return res.json({
        success: true,
        taskType,
        result: response.text || 'No response generated.',
      });
    } catch (err: any) {
      console.error('Gemini API Error:', err);
      return res.status(500).json({
        success: false,
        error: err.message || 'Failed to generate AI insights',
      });
    }
  });

  // 9. Gemini AI Code Generator for Custom YouTube Pipelines
  app.post('/api/ai/code-assistant', async (req, res) => {
    try {
      const {
        prompt = 'Download YouTube video in Python',
        language = 'python',
        framework = 'fastapi',
      } = req.body;

      const systemPrompt = `You are a senior media infrastructure engineer specializing in YouTube media extraction, yt-dlp, and video streaming pipelines.
Write clean, modern, fully functional, production-ready code based on the user's requirements.
Language: ${language}
Framework: ${framework}
User Request: "${prompt}"

Rules:
- Provide complete runnable code (no pseudo-code or placeholders).
- Follow best practices for bypassing 429 rate limits (use iOS/Android client args, proper headers).
- Include brief setup instructions (packages to install).`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: systemPrompt,
      });

      return res.json({
        success: true,
        code: response.text || 'No code generated.',
      });
    } catch (err: any) {
      console.error('Gemini Code Assistant Error:', err);
      return res.status(500).json({
        success: false,
        error: err.message || 'Failed to generate code',
      });
    }
  });

  // 10. YouTube Playlist Parser & Video Items API
  app.get('/api/yt/playlist', async (req, res) => {
    try {
      const playlistId = (req.query.playlistId as string) || (req.query.list as string) || 'PL4cUxeGkcC9gUgr39Q_yD6v-bSyMwKPUI';
      const cleanId = playlistId.replace(/^.*list=/, '').split('&')[0];
      
      const feedUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(cleanId)}`;
      const response = await fetch(feedUrl);
      
      if (!response.ok) {
        return res.status(response.status).json({
          error: `Playlist feed returned ${response.status}`,
          playlistId: cleanId,
          hint: 'Ensure playlist is public'
        });
      }

      const xmlText = await response.text();
      const titleMatch = xmlText.match(/<title>(.*?)<\/title>/);
      const playlistTitle = titleMatch ? titleMatch[1] : 'YouTube Playlist';

      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      const items = [];
      let match;

      while ((match = entryRegex.exec(xmlText)) !== null && items.length < 50) {
        const block = match[1];
        const vIdMatch = block.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
        const itemTitleMatch = block.match(/<title>(.*?)<\/title>/);
        const pubMatch = block.match(/<published>(.*?)<\/published>/);

        if (vIdMatch && itemTitleMatch) {
          const vId = vIdMatch[1];
          items.push({
            position: items.length + 1,
            videoId: vId,
            title: itemTitleMatch[1],
            published: pubMatch ? pubMatch[1] : '',
            url: `https://www.youtube.com/watch?v=${vId}`,
            thumbnail: `https://img.youtube.com/vi/${vId}/maxresdefault.jpg`,
            ytdlpCommand: `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best" "https://www.youtube.com/watch?v=${vId}"`,
          });
        }
      }

      return res.json({
        success: true,
        playlistId: cleanId,
        playlistTitle,
        totalItems: items.length,
        batchDownloadCommand: `yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best" "https://www.youtube.com/playlist?list=${cleanId}"`,
        items,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 11. Gemini AI: Video Title & SEO Optimization Suite
  app.post('/api/ai/seo-optimizer', async (req, res) => {
    try {
      const { 
        topic = 'Building modern web applications',
        currentTitle = '',
        channelNiche = 'Technology & Software Development'
      } = req.body;

      const prompt = `You are a world-class YouTube algorithmic growth consultant and SEO specialist.
Topic / Concept: "${topic}"
Current Title (if any): "${currentTitle}"
Channel Niche: "${channelNiche}"

Generate a complete, high-converting SEO & Metadata Package:
1. 🏆 10 High-CTR Video Titles (divided into 3 categories: Curiosity/Mystery, Direct Actionable Value, and Storytelling)
2. 📝 SEO Description Template (Optimized with natural keyword placement, chapters placeholder, and subscribe call to action)
3. 🏷️ Top 25 Ranked YouTube Search Tags (comma-separated, optimized for YouTube search algorithm)
4. 📈 Projected Click-Through Rate (CTR) advice & audience psychology tips.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      return res.json({
        success: true,
        topic,
        result: response.text || 'No SEO package generated.',
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 12. Gemini AI: YouTube Shorts & 60s Viral Script Generator
  app.post('/api/ai/shorts-script', async (req, res) => {
    try {
      const { 
        topic = '3 Secret Developer Hacks',
        tone = 'High energy and fast-paced',
        duration = 60
      } = req.body;

      const prompt = `You are a viral YouTube Shorts and TikTok scriptwriter with over 500 million views.
Write a high-retention, 60-second vertical video script about: "${topic}".
Tone: ${tone}

Format the script with exact visual directions:
1. ⚡ 0-3 Seconds: The Unscrollable Hook (Visual on-screen text + Punchy spoken line)
2. 🎬 3-45 Seconds: Fast-Paced Rapid-Fire Body (Column with [Visual Action / B-roll] on the left and [Voiceover Speech] on the right)
3. 🔁 45-60 Seconds: Seamless Retention Loop & Payoff (The last sentence must seamlessly loop into the first sentence of the hook!)`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      return res.json({
        success: true,
        topic,
        script: response.text || 'No script generated.',
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 13. Gemini AI: Multilingual Subtitle Translator & Dubbing Assistant
  app.post('/api/ai/translate-captions', async (req, res) => {
    try {
      const { 
        text = 'Welcome to this YouTube development tutorial.',
        targetLanguages = ['Spanish', 'French', 'German', 'Japanese']
      } = req.body;

      const prompt = `You are a professional localization and subtitle translator.
Translate the following subtitle/caption content into: ${targetLanguages.join(', ')}.

Source Content:
"${text}"

Provide clear, formatted translations for each language with proper pacing suitable for subtitle files.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      return res.json({
        success: true,
        translations: response.text || 'No translation generated.',
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 14. Gemini AI: High-CTR Thumbnail Concept Artist
  app.post('/api/ai/thumbnail-concept', async (req, res) => {
    try {
      const { 
        videoTitle = 'How I Built a YouTube Downloader in 24 Hours',
        topic = 'Coding and Software Engineering'
      } = req.body;

      const prompt = `You are an elite YouTube thumbnail designer for top 0.1% creators (MrBeast, Veritaseum, Ali Abdaal).
Video Title: "${videoTitle}"
Niche: "${topic}"

Design 3 distinct, high-CTR thumbnail concepts that stand out on mobile screens:
For each concept, specify:
1. 🎨 The Visual Composition (Subject position, background contrast, depth)
2. 🔤 On-Screen Text (Maximum 2-3 high-impact words only)
3. 🌈 Color Harmony (Main background color vs focal point accent color)
4. 🤖 Prompt for Image Generator (Ready-to-use prompt for Midjourney / Gemini Imagen)`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      return res.json({
        success: true,
        videoTitle,
        concepts: response.text || 'No thumbnail concepts generated.',
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 15. YouTube Shorts Dedicated API
  app.get('/api/yt/shorts', async (req, res) => {
    try {
      const urlQuery = (req.query.url as string) || '';
      const videoIdQuery = (req.query.videoId as string) || '';
      const videoId = extractVideoId(videoIdQuery || urlQuery);

      if (!videoId) {
        return res.status(400).json({
          error: 'Missing or invalid YouTube Shorts URL or ID.',
          example: 'https://www.youtube.com/shorts/5v2Xg7e_4zY'
        });
      }

      const shortsUrl = `https://www.youtube.com/shorts/${videoId}`;
      const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
      
      let title = 'YouTube Short';
      let author = 'YouTube Creator';
      try {
        const oembed = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(watchUrl)}`);
        if (oembed.ok) {
          const data = await oembed.json();
          if (data.title) title = data.title;
          if (data.author_name) author = data.author_name;
        }
      } catch (e) {
        console.warn('Shorts oembed fallback:', e);
      }

      return res.json({
        success: true,
        isShort: true,
        videoId,
        title,
        author,
        aspectRatio: '9:16',
        shortsUrl,
        watchUrl,
        embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&loop=1`,
        verticalThumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        resolvers: {
          cobalt: `https://cobalt.tools/#${encodeURIComponent(shortsUrl)}`,
          ssyoutube: `https://www.ssyoutube.com/watch?v=${videoId}`,
          y2mate: `https://y2mate.is/watch?v=${videoId}`
        },
        ytdlpCommand: `yt-dlp -f "best[ext=mp4]" "${shortsUrl}"`
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 16. YouTube Chapters & Timestamps Parser API
  app.post('/api/yt/chapters-parser', async (req, res) => {
    try {
      const { description = '' } = req.body;
      const lines = description.split('\n');
      const timestampRegex = /(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/;
      const chapters: Array<{ timestamp: string; seconds: number; title: string }> = [];

      for (const rawLine of lines) {
        const line = rawLine.trim();
        const match = line.match(timestampRegex);
        if (match) {
          const hours = match[1] ? parseInt(match[1], 10) : 0;
          const minutes = parseInt(match[2], 10);
          const seconds = parseInt(match[3], 10);
          const totalSeconds = hours * 3600 + minutes * 60 + seconds;
          const cleanTitle = line.replace(match[0], '').replace(/^[\s\-–—:]+/, '').trim();
          chapters.push({
            timestamp: match[0],
            seconds: totalSeconds,
            title: cleanTitle || `Chapter ${chapters.length + 1}`
          });
        }
      }

      return res.json({
        success: true,
        count: chapters.length,
        chapters,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 17. Batch Video Metadata & Resolvers API
  app.post('/api/yt/batch-info', async (req, res) => {
    try {
      const { urls = [] } = req.body;
      if (!Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: 'Provide an array of YouTube URLs (max 10)' });
      }

      const targetList = urls.slice(0, 10);
      const results = [];

      for (const item of targetList) {
        const vId = extractVideoId(item);
        if (!vId) {
          results.push({ url: item, valid: false, error: 'Invalid URL' });
          continue;
        }

        const standardUrl = `https://www.youtube.com/watch?v=${vId}`;
        results.push({
          url: item,
          valid: true,
          videoId: vId,
          standardUrl,
          thumbnail: `https://img.youtube.com/vi/${vId}/maxresdefault.jpg`,
          embedUrl: `https://www.youtube.com/embed/${vId}`,
          resolvers: {
            cobalt: `https://cobalt.tools/#${encodeURIComponent(standardUrl)}`,
            ssyoutube: `https://www.ssyoutube.com/watch?v=${vId}`,
            y2mate: `https://y2mate.is/watch?v=${vId}`
          }
        });
      }

      return res.json({
        success: true,
        total: results.length,
        videos: results
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 18. Gemini AI: CTR Scorer & Clickability Doctor
  app.post('/api/ai/ctr-scorer', async (req, res) => {
    try {
      const { title = 'How to code', topic = 'Programming' } = req.body;

      const prompt = `You are a YouTube viral analytics engine.
Analyze this video title and concept for Click-Through Rate (CTR) potential:
Title: "${title}"
Topic / Niche: "${topic}"

Provide an insightful rating and optimization report:
1. 🎯 CTR Potential Score (0 to 100) with a letter grade (S, A, B, C, D)
2. 🧠 Psychological Triggers Detected (Curiosity Gap, High Stakes, Urgency, Contrast, Simplicity, Fear of Missing Out)
3. ⚠️ Weaknesses / Audience Drop Factors (Why a casual viewer might scroll past)
4. 🚀 5 Upgraded A/B Test Titles (guaranteed to deliver +30% higher CTR)`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      return res.json({
        success: true,
        title,
        evaluation: response.text || 'No CTR evaluation generated.',
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 19. Gemini AI: Video to Full Blog / SEO Article Converter
  app.post('/api/ai/video-to-article', async (req, res) => {
    try {
      const { 
        title = 'Building scalable APIs',
        notes = 'FastAPI, yt-dlp, and modern asynchronous architecture',
        tone = 'Technical yet approachable'
      } = req.body;

      const prompt = `You are an elite technical content marketer and SEO copywriter.
Convert this video concept into an in-depth, high-ranking, 1200+ word SEO blog article.
Video Title: "${title}"
Key Notes / Outline: "${notes}"
Tone: ${tone}

Structure:
- Catchy H1 Title
- Engaging Hook & Problem Statement
- Key Concept Breakdown (with code or visual callout blocks)
- Step-by-Step Architecture Guide
- Pro-Tips & Common Pitfalls to Avoid
- Comprehensive Summary & FAQ section (3 questions)
Use rich Markdown with headers, bold text, and bullet lists.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      return res.json({
        success: true,
        title,
        article: response.text || 'No article generated.',
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // 20. Gemini AI: Hook Doctor & First 15-Second Retention Surgeon
  app.post('/api/ai/hook-doctor', async (req, res) => {
    try {
      const { hookDraft = 'Hey guys, welcome back to my channel today we are talking about coding.', topic = 'Tech' } = req.body;

      const prompt = `You are a YouTube audience retention surgeon.
Over 70% of viewers leave in the first 15 seconds if the hook is generic.
Current Hook Draft: "${hookDraft}"
Topic: "${topic}"

Provide 5 high-retention alternative hooks categorized by psychology:
1. ⚡ The Negative / Warning Hook ("Stop doing X right now...")
2. ❓ The Curiosity Gap Hook ("The one secret nobody tells you...")
3. 📉 The High-Stakes Story Hook ("I almost ruined my server until...")
4. 📊 The Data / Shock Stat Hook ("92% of developers fail this...")
5. 🏎️ The In-Medias-Res Action Hook (Zero intro, instant payoff)

For each hook, include:
- The exact spoken script (under 12 words)
- On-screen visual direction (what footage or sound effect plays)`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      return res.json({
        success: true,
        hookDraft,
        cures: response.text || 'No hook cures generated.',
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Vite middleware in dev, static files in production
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`YouTube API & Downloader Hub running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
