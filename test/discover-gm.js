'use strict';
// Timing probe: logs every outbound request the checker makes and how long it took.
const gm = require('../api/gm.js');
const real = global.fetch; const log = [];
global.fetch = async (u, o) => { const t = Date.now(); try { const r = await real(u, o); log.push([Date.now() - t, r.status, String(u).replace('https://', '').slice(0, 110)]); return r; } catch (e) { log.push([Date.now() - t, 'ERR ' + e.message, String(u).slice(0, 110)]); throw e; } };
const checker = require('../docs/checker.js');
(async () => {
  for (const [name, addr] of [['user wallet', '0x2ff5131f1f349b8079054cbe23aed21a54810391']]) {
    log.length = 0; const t = Date.now();
    const r = await checker.check({ address: addr, github: 'chinex11', gmLookup: gm.lookupGm });
    console.log('\n== ' + name + ': total ' + (Date.now() - t) + ' ms, requests ' + log.length);
    r.categories.forEach((c) => { console.log(c.name + ' ' + c.score + '/' + c.max); c.items.forEach((i) => console.log('   ' + i.label.padEnd(28) + String(i.display).padEnd(22) + '+' + i.pts + '/' + i.max + '  ' + i.note)); });
    console.log('Score', r.score, '/', r.totalMax, 'sybil', JSON.stringify(r.sybil), 'warnings', JSON.stringify(r.warnings));
    log.slice().sort((a, b) => b[0] - a[0]).slice(0, 4).forEach((l) => console.log('  slow: ' + l[0] + 'ms ' + l[1] + ' ' + l[2]));
    console.log('  non-200:', JSON.stringify(log.filter((l) => l[1] !== 200).slice(0, 5)));
  }
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
// rerun after speed fix
