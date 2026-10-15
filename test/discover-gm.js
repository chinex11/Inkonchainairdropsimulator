'use strict';
// Finds the GM app's contract address(es) and any leaderboard API by scanning gm.ink's front-end code.
const EXPLORER = 'https://explorer.inkonchain.com';
const get = async (u) => { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }); if (!r.ok) throw new Error(r.status + ' ' + u); return r; };
(async () => {
  const base = 'https://www.gm.ink/';
  const html = await (await get(base)).text();
  const srcs = [...html.matchAll(/(?:src|href)=["']([^"']+\.js[^"']*)["']/g)].map((m) => new URL(m[1], base).href);
  console.log('HTML bytes', html.length, 'scripts', srcs.length);
  const addrs = new Set(html.match(/0x[0-9a-fA-F]{40}/g) || []);
  const urls = new Set((html.match(/https?:\/\/[^"'\s<>)]+/g) || []));
  const chunks = new Set(srcs);
  for (const s of srcs) {
    try {
      const t = await (await get(s)).text();
      (t.match(/0x[0-9a-fA-F]{40}/g) || []).forEach((a) => addrs.add(a));
      (t.match(/https?:\/\/[^"'`\s<>)\\]+/g) || []).forEach((u) => urls.add(u));
      (t.match(/\/_next\/static\/[^"'`\s]+\.js/g) || []).forEach((p) => chunks.add(new URL(p, base).href));
    } catch (e) { console.log('skip', s, e.message); }
  }
  for (const c of chunks) {
    if (srcs.includes(c)) continue;
    try { const t = await (await get(c)).text(); (t.match(/0x[0-9a-fA-F]{40}/g) || []).forEach((a) => addrs.add(a)); (t.match(/https?:\/\/[^"'`\s<>)\\]+/g) || []).forEach((u) => urls.add(u)); } catch (e) {}
  }
  console.log('\nCandidate URLs (filtered):');
  [...urls].filter((u) => !/w3\.org|fonts\.|reactjs|github\.com|nextjs|\.(png|svg|jpg|woff2?|css)(\?|$)/i.test(u)).slice(0, 60).forEach((u) => console.log(' ', u));
  console.log('\nAddresses found:', addrs.size);
  for (const a of [...addrs].slice(0, 40)) {
    try {
      const i = await (await get(EXPLORER + '/api/v2/addresses/' + a)).json();
      let c = {}; try { c = await (await get(EXPLORER + '/api/v2/addresses/' + a + '/counters')).json(); } catch (e) {}
      console.log(' ', a, '| contract:', i.is_contract, '| name:', i.name || (i.implementations && i.implementations[0] && i.implementations[0].name) || '-', '| txs:', c.transactions_count, '| holders/xfers:', c.token_transfers_count);
    } catch (e) { console.log(' ', a, 'lookup failed', e.message); }
  }
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
