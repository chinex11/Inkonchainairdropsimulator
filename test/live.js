'use strict';
// Live smoke test: finds a recently active Ink wallet, runs the checker on it, prints what each lookup returned.
const { spawn } = require('child_process');
const EXPLORER = process.env.INK_EXPLORER || 'https://explorer.inkonchain.com';
const PORT = 3999;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function j(url) { const r = await fetch(url, { headers: { 'User-Agent': 'live-test' } }); console.log('GET', url, '->', r.status); if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url); return r.json(); }

(async () => {
  let address = process.env.TEST_ADDRESS;
  if (!address) {
    const t = await j(EXPLORER + '/api/v2/transactions');
    address = (t.items.find((x) => x.from && x.from.hash && !x.from.is_contract) || t.items[0]).from.hash;
  }
  console.log('Testing address', address);
  const srv = spawn('node', ['server.js'], { env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: 'inherit' });
  await sleep(1500);
  let res;
  try {
    const gh = process.env.TEST_GITHUB || 'chinex11';
    res = await j('http://localhost:' + PORT + '/api/check?address=' + address + '&github=' + gh + '&xf=500&xyears=3');
  } finally { srv.kill(); }
  res.categories.forEach((c) => { console.log('\n' + c.name + ' ' + c.score + '/' + c.max); c.items.forEach((i) => console.log('  ' + i.label.padEnd(28) + String(i.display).padEnd(14) + '+' + i.pts + '/' + i.max + '  ' + i.note)); });
  console.log('\nScore', res.score, '/', res.totalMax, ' sybil', JSON.stringify(res.sybil));
  console.log('Warnings', JSON.stringify(res.warnings, null, 1));
  const chain = res.categories[0].items;
  const bad = chain.filter((i) => i.display === 'unavailable');
  if (bad.length) { console.log('\nFAIL: unavailable on-chain items:', bad.map((i) => i.id).join(', ')); process.exit(1); }
  console.log('\nPASS: all on-chain items returned data');
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
