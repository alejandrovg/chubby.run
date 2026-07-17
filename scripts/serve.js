// Minimal static file server for local preview. Never serves dotfiles,
// .env, or the scripts/ directory — those must stay off the public site.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PORT = process.env.PORT || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

const BLOCKED_PREFIXES = ['.env', '.git', 'scripts', 'node_modules', 'logos', 'gallery', 'strava-badges'];

function isBlocked(relPath) {
  const segments = relPath.split('/').filter(Boolean);
  if (segments.some((s) => s.startsWith('.'))) return true;
  return segments.length > 0 && BLOCKED_PREFIXES.includes(segments[0]);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let relPath = decodeURIComponent(url.pathname);
    if (relPath === '/') relPath = '/index.html';
    relPath = normalize(relPath).replace(/^(\.\.[/\\])+/, '');

    if (isBlocked(relPath)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const filePath = join(ROOT, relPath);
    const st = await stat(filePath).catch(() => null);
    if (!st || !st.isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }

    const body = await readFile(filePath);
    const mime = MIME[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch (err) {
    res.writeHead(500).end('Server error');
  }
});

server.listen(PORT, () => {
  console.log(`[serve] chubby.run running at http://localhost:${PORT}`);
});
