'use strict';
// Live test of the BROWSER checker (docs/checker.js) plus CORS headers, run on GitHub's servers.
const checker = require('../docs/checker.js');
const gm = require('../api/gm.js');
const EXPLORER = 'https://explorer.inkonchain.com', RPC = 'https://rpc-gel.inkonchain.com';
(async () => {
  const origin = 'https://chinex11.github.io';
  const probes = [
    ['explorer', EXPLORER + '/api/v2/transactions', { headers: { Origin: origin } }],
    ['rpc', RPC, { method: 'POST', headers: { Origin: origin, 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' }],
    ['github', 'https://api.github.com/users/octocat', { headers: { Origin: origin } }]
  ];
  let corsOk = true;
  for (const [n, u, o] of probes) { const r = await fetch(u, o); const h = r.headers.get('access-control-allow-origin'); console.log('CORS', n, r.status, 'allow-origin=' + h); if (!h) corsOk = false; }
  const t = await (await fetch(EXPLORER + '/api/v2/transactions')).json();
  const address = process.env.TEST_ADDRESS || (t.items.find((x) => x.from && !x.from.is_contract) || t.items[0]).from.hash;
  console.log('Testing', address);
  const res = await checker.check({ address, github: 'chinex11', xf: 500, xyears: 3, gmLookup: gm.lookupGm });
  res.categories.forEach((c) => { console.log('\n' + c.name + ' ' + c.score + '/' + c.max); c.items.forEach((i) => console.log('  ' + i.label.padEnd(28) + String(i.display).padEnd(14) + '+' + i.pts + '/' + i.max)); });
  console.log('\nScore', res.score, '/', res.totalMax, JSON.stringify(res.sybil), JSON.stringify(res.warnings));
  const top = await (await fetch('https://www.gm.ink/api/leaderboard-pagination?page=1')).json();
  const topRes = await checker.check({ address: top.users[0].address, gmLookup: gm.lookupGm });
  const tg = topRes.categories.find((c) => c.id === 'gm');
  console.log('\nGM check on the #1 wallet ' + top.users[0].address + ':', tg.score + '/' + tg.max, JSON.stringify(tg.items.map((i) => [i.display, i.pts, i.note])));
  const gmBad = res.categories.find((c) => c.id === 'gm').items.filter((i) => i.display === 'unavailable');
  const topOk = tg.items[0].display.startsWith('#1 ') && tg.score >= 10;
  console.log('Chain stats', JSON.stringify(res.chainStats), 'txRank', JSON.stringify(res.txRank));
  const bad = res.categories[0].items.filter((i) => i.display === 'unavailable').concat(gmBad);
  if (!topOk) { console.log('FAIL: GM rank for #1 wallet not parsed'); process.exit(1); }
  if (bad.length || !corsOk) { console.log('FAIL', bad.map((i) => i.id).join(','), 'corsOk=' + corsOk); process.exit(1); }
  console.log('PASS: browser checker works and CORS allows github.io');
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
