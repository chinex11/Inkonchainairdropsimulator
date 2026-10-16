'use strict';
// Waits for the new deployment, then checks the LIVE site serves checker.js and the GM function.
const base = 'https://inkonchainairdropsimulator.vercel.app';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  for (let i = 0; i < 12; i++) {
    const r = await fetch(base + '/checker.js?v=' + Date.now());
    const t = await r.text();
    console.log('try', i + 1, '/checker.js ->', r.status, 'bytes', t.length, 'has within():', t.includes('within('));
    if (r.status === 200 && t.includes('within(')) {
      const g = await fetch(base + '/api/gm?address=0xae47622426ae6c74baa8c75c07304b6e53e4c444');
      const home = await (await fetch(base + '/')).text();
      console.log('/api/gm ->', g.status, (await g.text()).slice(0, 120));
      console.log('home has did-not-load guard:', home.includes('did not load'));
      const checker = require('../docs/checker.js');
      const gm = require('../api/gm.js');
      const t0 = Date.now();
      const res = await checker.check({ address: '0x2ff5131f1f349b8079054cbe23aed21a54810391', github: 'Chinex11', gmLookup: gm.lookupGm });
      console.log('\nYOUR WALLET: ' + (Date.now() - t0) + ' ms, score ' + res.score + '/' + res.totalMax, 'sybil', JSON.stringify(res.sybil));
      res.categories.forEach((c) => { console.log(c.name + ' ' + c.score + '/' + c.max); c.items.forEach((x) => console.log('   ' + x.label.padEnd(28) + String(x.display).padEnd(24) + '+' + x.pts + '/' + x.max)); });
      console.log('warnings', JSON.stringify(res.warnings), 'txRank', JSON.stringify(res.txRank));
      return;
    }
    await sleep(15000);
  }
  console.log('FAIL: live site never served the new checker.js'); process.exit(1);
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
