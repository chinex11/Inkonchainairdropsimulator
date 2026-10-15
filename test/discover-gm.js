'use strict';
// Finds the GM app's contract by looking for addresses near GM-related code in gm.ink's bundles.
const EXPLORER = 'https://explorer.inkonchain.com';
const get = async (u) => { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }); if (!r.ok) throw new Error(r.status + ' ' + u); return r; };
(async () => {
  const base = 'https://www.gm.ink/';
  const html = await (await get(base)).text();
  const chunks = new Set([...html.matchAll(/(?:src|href)=["']([^"']+\.js[^"']*)["']/g)].map((m) => new URL(m[1], base).href));
  (html.match(/\/_next\/static\/[^"'\\\s]+\.js/g) || []).forEach((p) => chunks.add(new URL(p, base).href));
  console.log('chunks', chunks.size);
  const hits = new Map();
  const funcs = new Set();
  for (const c of chunks) {
    let t; try { t = await (await get(c)).text(); } catch (e) { continue; }
    for (const m of t.matchAll(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g)) {
      const ctx = t.slice(Math.max(0, m.index - 160), m.index + 160);
      if (/gm|streak|checkin|check-in|leaderboard/i.test(ctx)) { if (!hits.has(m[0].toLowerCase())) hits.set(m[0].toLowerCase(), ctx.replace(/\s+/g, ' ')); }
    }
    for (const m of t.matchAll(/name:\s*["']([A-Za-z]*(?:gm|GM|Gm|streak|Streak|leaderboard|Leaderboard)[A-Za-z]*)["']/g)) funcs.add(m[1]);
    for (const m of t.matchAll(/["'`](\/api\/[A-Za-z0-9/_-]+)["'`]/g)) funcs.add('API ' + m[1]);
  }
  console.log('GM-related function/API names:', [...funcs].slice(0, 40).join(', '));
  console.log('Addresses near GM code:', hits.size);
  for (const [a, ctx] of hits) {
    try {
      const i = await (await get(EXPLORER + '/api/v2/addresses/' + a)).json();
      const c = await (await get(EXPLORER + '/api/v2/addresses/' + a + '/counters')).json();
      console.log('\n' + a, '| contract:', i.is_contract, '| name:', i.name || '-', '| txs:', c.transactions_count);
    } catch (e) { console.log('\n' + a, 'lookup failed'); }
    console.log('  ctx:', ctx.slice(0, 240));
  }
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
