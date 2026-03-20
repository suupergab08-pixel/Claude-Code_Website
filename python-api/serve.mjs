/**
 * Server 1 — Node.js at localhost:3002
 * - Serves HTML frontend files
 * - Proxies image requests (so thumbnails from Reddit/news sites load correctly)
 * - Proxies Gemini API calls (keeps API key hidden from browser)
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3002;
const FLASK_API = 'http://127.0.0.1:5001';

// MIME types for static files
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ── Proxy: /api/* → Flask at 5001 ──
  if (url.pathname.startsWith('/api/')) {
    try {
      const flaskUrl = `${FLASK_API}${url.pathname}${url.search}`;
      let body = '';
      if (req.method === 'POST') {
        body = await readBody(req);
      }

      const fetchOpts = {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (body) fetchOpts.body = body;

      const flaskRes = await fetch(flaskUrl, fetchOpts);
      const contentType = flaskRes.headers.get('content-type') || 'application/json';
      const data = await flaskRes.arrayBuffer();

      res.writeHead(flaskRes.status, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
      });
      res.end(Buffer.from(data));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Flask API unreachable', details: err.message }));
    }
    return;
  }

  // ── Proxy: /img-proxy?url=... → fetch remote image ──
  if (url.pathname === '/img-proxy') {
    const imgUrl = url.searchParams.get('url');
    if (!imgUrl) {
      res.writeHead(400);
      res.end('Missing url param');
      return;
    }
    try {
      const imgRes = await fetch(imgUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'image/*',
        },
        redirect: 'follow',
      });
      const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
      const data = await imgRes.arrayBuffer();
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(Buffer.from(data));
    } catch {
      res.writeHead(404);
      res.end('Image fetch failed');
    }
    return;
  }

  // ── CORS preflight ──
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // ── Static files: serve from parent directory (project root) ──
  let filePath = url.pathname === '/' ? '/trend-finder.html' : url.pathname;
  const root = path.resolve(__dirname, '..');
  const fullPath = path.join(root, filePath);

  // Security: prevent directory traversal
  if (!fullPath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Serve static file
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const ext = path.extname(fullPath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';

    // Range request support for video
    if (ext === '.mp4' && req.headers.range) {
      const stat = fs.statSync(fullPath);
      const range = req.headers.range;
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunk = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunk,
        'Content-Type': 'video/mp4',
      });
      fs.createReadStream(fullPath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(fullPath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
  });
}

server.listen(PORT, () => {
  console.log(`Node server running at http://localhost:${PORT}`);
  console.log(`  Static files: ../`);
  console.log(`  API proxy:    /api/* → ${FLASK_API}`);
  console.log(`  Image proxy:  /img-proxy?url=...`);
  console.log(`  Default page: trend-finder.html`);
});
