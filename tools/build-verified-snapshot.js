'use strict';
/* Builds docs/verified-snapshot.json: the transaction count (account nonce) of every wallet that has an active
   Kraken Verify attestation on Ink. The page uses it to rank a wallet exactly among verified wallets.
   Run daily by .github/workflows/verified-snapshot.yml, or by hand: node tools/build-verified-snapshot.js */
const fs = require('fs'), path = require('path');
const EAS = 'https://ink.easscan.org/graphql';
const RPC = process.env.INK_RPC || 'https://rpc-gel.inkonchain.com';
const SCHEMA = '0x8ffa68bde25f7b88e042ea3dff55ff27217b7d1c4bf24f57967b285c5ffe4c8b';
const ATTESTER = '0xfDB645Fe7868064bF3934f307A918C817e759fF6';
const OUT = path.join(__dirname, '..', 'docs', 'verified-snapshot.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(url, body, tries) {
  for (let i = 0; i < (tries || 4); i++) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (r.ok) return await r.json();
    } catch (e) { /* retry */ }
    await sleep(800 * (i + 1));
  }
  throw new Error('request failed: ' + url);
}

async function recipients() {
  const q = 'query($s:String!,$a:String!,$skip:Int!){attestations(where:{schemaId:{equals:$s},attester:{equals:$a},revoked:{equals:false}},take:1000,skip:$skip,orderBy:[{time:asc}]){recipient expirationTime}}';
  const now = Date.now() / 1000, set = new Set();
  for (let skip = 0; skip < 200000; skip += 1000) {
    const j = await post(EAS, { query: q, variables: { s: SCHEMA, a: ATTESTER, skip } });
    if (j.errors) throw new Error('easscan: ' + JSON.stringify(j.errors).slice(0, 200));
    const rows = (j.data && j.data.attestations) || [];
    rows.forEach((x) => { if (!Number(x.expirationTime) || Number(x.expirationTime) > now) set.add(x.recipient.toLowerCase()); });
    process.stdout.write('attestations read: ' + (skip + rows.length) + '\r');
    if (rows.length < 1000) break;
  }
  return [...set];
}

async function nonces(addrs) {
  const out = new Array(addrs.length).fill(null);
  const BATCH = Number(process.env.BATCH || 100), CONC = 6;
  const jobs = []; for (let i = 0; i < addrs.length; i += BATCH) jobs.push(i);
  let next = 0, done = 0, failed = 0;
  async function worker() {
    while (next < jobs.length) {
      const start = jobs[next++], slice = addrs.slice(start, start + BATCH);
      const body = slice.map((a, k) => ({ jsonrpc: '2.0', id: k, method: 'eth_getTransactionCount', params: [a, 'latest'] }));
      try {
        const res = await post(RPC, body, 5);
        (Array.isArray(res) ? res : []).forEach((x) => { if (x && x.result != null) out[start + x.id] = parseInt(x.result, 16); });
      } catch (e) { failed++; }
      done += slice.length;
      if ((done / BATCH) % 20 < 1) process.stdout.write('nonces read: ' + done + '/' + addrs.length + '\r');
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  // second pass for anything missed
  const miss = out.map((v, i) => (v == null ? i : -1)).filter((i) => i >= 0);
  for (const i of miss) {
    try { const r = await post(RPC, { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionCount', params: [addrs[i], 'latest'] }, 3); if (r.result != null) out[i] = parseInt(r.result, 16); } catch (e) { /* leave null */ }
  }
  return out;
}

(async () => {
  const t0 = Date.now();
  const addrs = await recipients();
  console.log('\nactive verified wallets:', addrs.length);
  if (addrs.length < 1000) throw new Error('suspiciously few verified wallets, not writing snapshot');
  const n = await nonces(addrs);
  const ok = n.filter((v) => v != null);
  console.log('\nnonces read:', ok.length, 'missing:', n.length - ok.length);
  if (ok.length < addrs.length * 0.97) throw new Error('too many wallets could not be read, not writing snapshot');
  ok.sort((a, b) => b - a);
  const snap = { generatedAt: new Date().toISOString(), total: ok.length, nonces: ok };
  fs.writeFileSync(OUT, JSON.stringify(snap));
  console.log('wrote', OUT, 'bytes', fs.statSync(OUT).size, 'top 5', ok.slice(0, 5), 'median', ok[Math.floor(ok.length / 2)], 'zero-tx wallets', ok.filter((v) => v === 0).length, 'seconds', Math.round((Date.now() - t0) / 1000));
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
