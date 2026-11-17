// Local simulator and settings page. Serves web/ and shared/ on loopback only; the page talks to the
// Bar's HTTP API directly (the Bar allows cross-origin requests) and fetches weather itself.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join, extname } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PORT = Number(process.env.PORT || 4381);
const BAR = new URL(process.env.BUSY_BAR_URL || 'http://10.0.4.20').origin;
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ${BAR} https://api.open-meteo.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
  );
  const fail = status => {
    res.writeHead(status, { 'Content-Type': 'text/plain' });
    res.end(status === 404 ? 'Not found' : 'Forbidden');
  };
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host || '')) return fail(403);
  if (!['GET', 'HEAD'].includes(req.method)) return fail(403);
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/bar.json') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ url: BAR }));
  }
  const shared = path.startsWith('/shared/');
  const base = join(ROOT, shared ? 'shared' : 'web');
  const file = resolve(base, path === '/' ? 'index.html' : path.replace(/^\/(shared\/)?/, ''));
  if (!file.startsWith(base + '/')) return fail(404);
  try {
    const bytes = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {
    fail(404);
  }
});
server.listen(PORT, '127.0.0.1', () => console.log('SuperBar simulator: http://localhost:' + PORT));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
