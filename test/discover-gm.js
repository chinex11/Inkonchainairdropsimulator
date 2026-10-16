'use strict';
// Fetches the LIVE site and reports which version of the code it is serving.
const base = 'https://inkonchainairdropsimulator.vercel.app';
(async () => {
  for (const p of ['/', '/checker.js?v=4', '/checker.js', '/api/gm?address=0xae47622426ae6c74baa8c75c07304b6e53e4c444']) {
    const r = await fetch(base + p, { headers: { 'Cache-Control': 'no-cache' } });
    const t = await r.text();
    const h = (k) => r.headers.get(k);
    const marks = ['checker.js?v=4', 'taking too long', 'done (', 'within(', 'chainOut', 'rkScore', 'TIME_BUDGET', 'MAX_PAGES = 6'].filter((m) => t.includes(m));
    console.log(p, '->', r.status, 'bytes', t.length, '| cache-control:', h('cache-control'), '| x-vercel-cache:', h('x-vercel-cache'), '| age:', h('age'));
    console.log('   markers:', marks.join(', ') || 'none');
  }
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
