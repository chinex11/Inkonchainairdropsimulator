'use strict';
// Discovery: ZNS (.ink domains) contracts on Ink, Tydro/Aave tokens, and which explorer fields exist for a wallet.
const EX = 'https://explorer.inkonchain.com';
const UA = { 'User-Agent': 'Mozilla/5.0' };
const j = async (u) => { try { const r = await fetch(u, { headers: UA }); const t = await r.text(); try { return { s: r.status, j: JSON.parse(t) }; } catch (e) { return { s: r.status, t }; } } catch (e) { return { s: 'ERR', t: e.message }; } };
(async () => {
  console.log('== explorer search');
  for (const q of ['ZNS', 'domain', '.ink', 'Tydro', 'Aave', 'name service', 'Nado', 'Velodrome']) {
    const r = await j(EX + '/api/v2/search?q=' + encodeURIComponent(q));
    const it = (r.j && r.j.items) || [];
    console.log('q=' + q, r.s, it.slice(0, 6).map((x) => [x.type, x.name, x.symbol || '', x.address_hash || x.address || '', x.token_type || ''].join('|')).join('  ;  '));
  }
  console.log('\n== zns.bio');
  for (const u of ['https://zns.bio/', 'https://www.zns.bio/', 'https://zns.bio/api', 'https://api.zns.bio/']) {
    const r = await j(u);
    console.log(u, r.s, String(r.t || JSON.stringify(r.j)).slice(0, 200).replace(/\s+/g, ' '));
  }
  try {
    const html = await (await fetch('https://zns.bio/', { headers: UA })).text();
    const chunks = [...new Set((html.match(/\/_next\/static\/[^"'\\\s]+\.js/g) || []).concat((html.match(/\/assets\/[^"'\\\s]+\.js/g) || [])))].map((p) => 'https://zns.bio' + p);
    console.log('zns chunks', chunks.length);
    const addrs = new Map(); const apis = new Set();
    for (const c of chunks.slice(0, 40)) {
      let t; try { t = await (await fetch(c, { headers: UA })).text(); } catch (e) { continue; }
      for (const m of t.matchAll(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g)) { const ctx = t.slice(Math.max(0, m.index - 120), m.index + 60).replace(/\s+/g, ' '); if (!addrs.has(m[0].toLowerCase())) addrs.set(m[0].toLowerCase(), ctx); }
      (t.match(/https?:\/\/[a-zA-Z0-9./_-]*(?:zns|api)[a-zA-Z0-9./_?=&-]*/g) || []).forEach((x) => apis.add(x));
    }
    console.log('zns addresses', addrs.size);
    for (const [a, ctx] of [...addrs].slice(0, 25)) {
      const r = await j(EX + '/api/v2/addresses/' + a);
      console.log(' ', a, r.s === 200 ? ('contract=' + r.j.is_contract + ' name=' + (r.j.name || '-')) : r.s, '| ctx:', ctx.slice(0, 110));
    }
    console.log('zns api urls', [...apis].slice(0, 20).join(' '));
  } catch (e) { console.log('zns fetch error', e.message); }

  console.log('\n== wallet fields');
  const W = '0x2ff5131f1f349b8079054cbe23aed21a54810391';
  const c = await j(EX + '/api/v2/addresses/' + W + '/counters'); console.log('counters', JSON.stringify(c.j || c.t).slice(0, 300));
  const tb = await j(EX + '/api/v2/addresses/' + W + '/token-balances');
  console.log('token-balances', tb.s, (Array.isArray(tb.j) ? tb.j : []).slice(0, 12).map((x) => [x.token && x.token.type, x.token && x.token.name, x.token && x.token.symbol, x.value].join('|')).join('  ;  '));
  const nft = await j(EX + '/api/v2/addresses/' + W + '/nft/collections?type=ERC-721');
  console.log('nft collections', nft.s, ((nft.j && nft.j.items) || []).slice(0, 12).map((x) => [x.token && x.token.name, x.token && x.token.symbol, x.amount, x.token && x.token.address_hash].join('|')).join('  ;  '));
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
