'use strict';
/* Self-host option: node server.js  (Not used on Vercel. Vercel serves docs/ as the site and api/gm.js as a function.). */
const http = require('http'), fs = require('fs'), path = require('path');
const checker = require('../docs/checker.js');
const gm = require('../api/gm.js');
const PORT = Number(process.env.PORT || 3000);
const PUB = path.join(__dirname, '..', 'docs');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const hits = new Map();
const limited = (ip) => { const now = Date.now(), a = (hits.get(ip) || []).filter((t) => now - t < 60000); a.push(now); hits.set(ip, a); return a.length > 30; };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const send = (code, body, type) => { res.writeHead(code, { 'content-type': type || 'application/json', 'cache-control': 'no-store' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
  if (u.pathname === '/api/gm') return gm(req, res);
  if (u.pathname === '/api/check') {
    if (limited(String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0])) return send(429, { error: 'Too many checks. Wait a minute.' });
    const xf = u.searchParams.get('xf');
    try {
      return send(200, await checker.check({ address: (u.searchParams.get('address') || '').trim(), github: (u.searchParams.get('github') || '').trim(),
        xf: xf !== null && xf !== '' ? Number(xf) : null, xyears: Number(u.searchParams.get('xyears') || 0), gmLookup: gm.lookupGm }));
    } catch (e) { return send(400, { error: e.message }); }
  }
  const file = path.normalize(path.join(PUB, u.pathname === '/' ? '/index.html' : u.pathname));
  if (file.indexOf(PUB) !== 0) return send(403, 'Forbidden', 'text/plain');
  fs.readFile(file, (err, data) => { if (err) return send(404, 'Not found', 'text/plain'); res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(data); });
}).listen(PORT, () => console.log('Ink Airdrop Checker on http://localhost:' + PORT));
