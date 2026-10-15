import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.jsx':'text/babel; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml' };
const server = http.createServer((req,res) => {
  let pathname; try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); } catch { res.writeHead(400).end('Bad request'); return; }
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/question-bank.json') pathname = '/public/question-bank.json';
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) { res.writeHead(403).end('Forbidden'); return; }
  fs.readFile(file, (err,data) => { if (err) { res.writeHead(err.code === 'ENOENT' ? 404 : 500, {'Content-Type':'text/plain'}).end(err.code === 'ENOENT' ? 'Not found' : 'Server error'); return; } res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'}); res.end(data); });
});
const port = Number(process.env.PORT || 5181);
server.listen(port, '127.0.0.1', () => console.log('CCA-F Practice is running at http://127.0.0.1:' + port));
