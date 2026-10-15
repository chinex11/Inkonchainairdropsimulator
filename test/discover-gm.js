'use strict';
// Inspects gm.ink's public API endpoints: how they are called, what they return, and whether browsers on other sites may read them.
const base = 'https://www.gm.ink';
const get = async (u, o) => fetch(u, Object.assign({ headers: { 'User-Agent': 'Mozilla/5.0', Origin: 'https://inkonchainairdropsimulator.vercel.app' } }, o));
(async () => {
  const html = await (await get(base + '/')).text();
  const chunks = new Set((html.match(/\/_next\/static\/[^"'\\\s]+\.js/g) || []).map((p) => base + p));
  const want = ['/api/gm-account/stats', '/api/user-leaderboard', '/api/leaderboard-pagination', '/api/gm-data'];
  for (const c of chunks) {
    let t; try { t = await (await get(c)).text(); } catch (e) { continue; }
    for (const w of want) { let i = t.indexOf(w); if (i >= 0) { console.log('\n[' + w + '] ' + t.slice(Math.max(0, i - 200), i + 300).replace(/\s+/g, ' ')); } }
  }
  const sample = process.env.SAMPLE || '0x00deca2338BDd7f23D48095F452D737071316E84';
  const tries = ['/api/user-leaderboard', '/api/leaderboard-pagination?page=1', '/api/gm-data', '/api/gm-account/stats?address=' + sample, '/api/gm-data?address=' + sample];
  for (const p of tries) {
    try {
      const r = await get(base + p);
      const body = (await r.text()).slice(0, 500).replace(/\s+/g, ' ');
      console.log('\nGET', p, '->', r.status, 'type=' + r.headers.get('content-type'), 'cors=' + r.headers.get('access-control-allow-origin'));
      console.log('  ', body);
    } catch (e) { console.log('\nGET', p, 'ERROR', e.message); }
  }
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
