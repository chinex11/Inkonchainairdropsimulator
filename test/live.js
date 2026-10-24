'use strict';
// Live test of the browser checker (docs/checker.js) on real wallets, run on GitHub's servers.
const checker = require('../docs/checker.js');
const gm = require('../api/gm.js');
const EX = 'https://explorer.inkonchain.com';
const j = async (u) => (await fetch(u, { headers: { 'User-Agent': 'live-test' } })).json();
const show = (r) => r.categories.forEach((c) => { console.log('  ' + c.name + ' ' + c.score + '/' + c.max); c.items.forEach((i) => console.log('     ' + i.label.padEnd(28) + String(i.display).padEnd(20) + '+' + i.pts + '/' + i.max)); });
(async () => {
  const znsHolder = (await j(EX + '/api/v2/tokens/0xFb2Cd41a8aeC89EFBb19575C6c48d872cE97A0A5/holders')).items[0].address.hash;
  const wallets = [['YOUR WALLET', '0x2ff5131f1f349b8079054cbe23aed21a54810391'], ['TOP .ink DOMAIN HOLDER', znsHolder], ['KRAKEN-VERIFIED (known)', '0xEe8F6759fAB9329EAfEA08C7cDF279d019b79b9b'], ['NOT VERIFIED (zero-ish)', '0x0000000000000000000000000000000000000001']];
  const out = {};
  for (const [name, address] of wallets) {
    const t = Date.now();
    const r = await checker.check({ address, gmLookup: gm.lookupGm });
    out[name] = r;
    console.log('\n== ' + name + ' ' + address + ' (' + (Date.now() - t) + ' ms) score ' + r.score + '/' + r.totalMax + ' ' + JSON.stringify(r.warnings));
    show(r);
  }
  const g = (r, cat, id) => r.categories.find((c) => c.id === cat).items.find((i) => i.id === id);
  const checks = [
    ['ZNS holder has a domain', g(out['TOP .ink DOMAIN HOLDER'], 'ident', 'domains').pts > 0],
    ['Known verified wallet reads as verified', g(out['KRAKEN-VERIFIED (known)'], 'ident', 'kraken').pts === 3],
    ['Unverified wallet reads as not verified', g(out['NOT VERIFIED (zero-ish)'], 'ident', 'kraken').display === 'Not verified'],
    ['No unavailable ident/defi items for your wallet', out['YOUR WALLET'].categories.filter((c) => c.id === 'ident' || c.id === 'usage').every((c) => c.items.every((i) => i.display !== 'unavailable'))]
  ];
  console.log('');
  checks.forEach(([n, ok]) => console.log((ok ? 'PASS ' : 'FAIL ') + n));
  if (checks.some((c) => !c[1])) process.exit(1);
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
