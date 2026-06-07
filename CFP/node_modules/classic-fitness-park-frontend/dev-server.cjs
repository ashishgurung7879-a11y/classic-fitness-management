const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const rootDir = __dirname;
const distDir = path.join(rootDir, 'dist');
const publicDir = path.join(rootDir, 'public');
const host = '0.0.0.0';

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index !== -1 && process.argv[index + 1]) {
    const value = Number(process.argv[index + 1]);
    return Number.isFinite(value) ? value : fallback;
  }
  return fallback;
}

const port = Number(process.env.PORT) || readArg('--port', 8080);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function safeJoin(baseDir, requestPath) {
  const normalized = path.normalize(path.join(baseDir, requestPath));
  return normalized.startsWith(baseDir) ? normalized : null;
}

function resolveFile(requestUrl) {
  const url = new URL(requestUrl, `http://${host}:${port}`);
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === '/') pathname = '/index.html';

  const candidates = [
    safeJoin(distDir, pathname),
    safeJoin(rootDir, pathname),
    safeJoin(publicDir, pathname)
  ].filter(Boolean);

  for (const filePath of candidates) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return filePath;
    }
  }

  return null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${host}:${port}`);

  if (url.pathname.startsWith('/api/')) {
    const proxyReq = http.request(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path: `${url.pathname}${url.search}`,
        method: req.method,
        headers: {
          ...req.headers,
          host: '127.0.0.1:5000',
        },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', () => {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: false,
        message: 'Cannot connect to local API at http://localhost:5000. Start the backend first.'
      }));
    });

    req.pipe(proxyReq);
    return;
  }

  const filePath = resolveFile(req.url || '/');

  if (!filePath) {
    const spaFallback = path.join(distDir, 'index.html');
    if (fs.existsSync(spaFallback)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(spaFallback).pipe(res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found. Run "npm run build" first.');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = mimeTypes[ext] || 'application/octet-stream';

  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(filePath).pipe(res);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Stop the other server or choose a different PORT.`);
  } else {
    console.error(err.message);
  }
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`Classic Fitness Park preview is running at http://localhost:${port}`);
});
