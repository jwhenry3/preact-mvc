// Minimal static file server for the Pages artifact — directory index.html
// resolution + 404.html for misses. No deps.
// Usage: node scripts/serve-static.mjs [dir] [port]
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extname, join, normalize } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = join(root, process.argv[2] ?? 'dist-pages');
const port = Number(process.argv[3] ?? 4190);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const send = (res, status, file) => {
  res.writeHead(status, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
  });
  createReadStream(file).pipe(res);
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let path = normalize(join(dir, decodeURIComponent(url.pathname)));
  // Containment: stay under dir.
  if (!path.startsWith(dir)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  if (existsSync(path) && statSync(path).isDirectory()) {
    path = join(path, 'index.html');
  }
  if (existsSync(path) && statSync(path).isFile()) {
    send(res, 200, path);
    return;
  }
  const notFound = join(dir, '404.html');
  if (existsSync(notFound)) {
    send(res, 404, notFound);
  } else {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => {
  console.log(`serving ${dir} at http://localhost:${port}/`);
});
