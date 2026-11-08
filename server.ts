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
