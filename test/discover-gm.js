'use strict';
// Timing probe: logs every outbound request the checker makes and how long it took.
const gm = require('../api/gm.js');
const real = global.fetch; const log = [];
global.fetch = async (u, o) => { const t = Date.now(); try { const r = await real(u, o); log.push([Date.now() - t, r.status, String(u).replace('https://', '').slice(0, 110)]); return r; } catch (e) { log.push([Date.now() - t, 'ERR ' + e.message, String(u).slice(0, 110)]); throw e; } };
const checker = require('../docs/checker.js');
(async () => {
  for (const [name, addr] of [['busy', '0xC44592088b94889a7fD303F46a60C51b4915F794'], ['mid', '0x00deca2338BDd7f23D48095F452D737071316E84']]) {
    log.length = 0; const t = Date.now();
    const r = await checker.check({ address: addr, github: 'chinex11', gmLookup: gm.lookupGm });
    console.log('\n== ' + name + ': total ' + (Date.now() - t) + ' ms, requests ' + log.length + ', warnings ' + JSON.stringify(r.warnings));
    const slow = log.slice().sort((a, b) => b[0] - a[0]).slice(0, 6);
    slow.forEach((l) => console.log('  ' + l[0] + 'ms  ' + l[1] + '  ' + l[2]));
    const bad = log.filter((l) => l[1] !== 200); console.log('  non-200:', bad.length, JSON.stringify(bad.slice(0, 5)));
  }
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
// rerun after speed fix
