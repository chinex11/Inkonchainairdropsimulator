'use strict';
// Does Ink's official verify page reference this schema / attester?
const NEEDLES = ['8ffa68bde25f7b88', 'fdb645fe7868064b', '34a3f175a93c054b', 'b7a958f0e1642c38'].map((s) => s.toLowerCase());
const UA = { 'User-Agent': 'Mozilla/5.0' };
const getT = async (u) => { try { const r = await fetch(u, { headers: UA }); return { s: r.status, t: await r.text() }; } catch (e) { return { s: 'ERR', t: '' }; } };
(async () => {
  const seen = new Set(); const hits = [];
  for (const page of ['https://inkonchain.com/verify', 'https://inkonchain.com/', 'https://docs.inkonchain.com/build/verify']) {
    const r = await getT(page);
    console.log(page, r.s, 'bytes', r.t.length);
    const chunks = [...new Set((r.t.match(/(?:\/_next|\/assets|\/_astro|\/static)[^"'\\\s)]+\.js/g) || []))].map((p) => new URL(p, page).href);
    const srcs = [...new Set((r.t.match(/https?:\/\/[^"'\\\s)]+\.js/g) || []))];
    for (const u of [...chunks, ...srcs].slice(0, 60)) {
      if (seen.has(u)) continue; seen.add(u);
      const c = await getT(u); const low = c.t.toLowerCase();
      NEEDLES.forEach((n) => { const i = low.indexOf(n); if (i >= 0) hits.push([page, u, n, c.t.slice(Math.max(0, i - 160), i + 120).replace(/\s+/g, ' ')]); });
    }
    NEEDLES.forEach((n) => { const i = r.t.toLowerCase().indexOf(n); if (i >= 0) hits.push([page, 'inline', n, r.t.slice(Math.max(0, i - 160), i + 120).replace(/\s+/g, ' ')]); });
    const kr = r.t.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const k = kr.toLowerCase().indexOf('verify'); if (k >= 0) console.log('  text near verify:', kr.slice(Math.max(0, k - 80), k + 400));
  }
  console.log('scripts scanned', seen.size, 'needle hits', hits.length);
  hits.slice(0, 8).forEach((h) => console.log(' HIT', h[0], h[1].slice(-60), h[2], '|', h[3]));
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
