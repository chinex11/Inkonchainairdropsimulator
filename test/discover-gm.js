'use strict';
// Discover how Kraken Verify (an EAS attestation on Ink) can be read for a wallet.
const EAS = '0x4200000000000000000000000000000000000021';
const RPC = 'https://rpc-gel.inkonchain.com';
const UA = { 'User-Agent': 'Mozilla/5.0', 'content-type': 'application/json' };
const rpc = async (method, params) => { const r = await fetch(RPC, { method: 'POST', headers: UA, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }); return r.json(); };
const pad = (a) => '0x' + a.toLowerCase().replace('0x', '').padStart(64, '0');
const T_ATTESTED = '0x8bf46bf4cfd674fa735a3d63ec1c9ad4153f033c290341f3a588b75685141b35';
(async () => {
  console.log('== docs page text');
  try {
    const html = await (await fetch('https://docs.inkonchain.com/build/verify', { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
    const txt = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    console.log('bytes', html.length, 'title', (html.match(/<title>([^<]*)/) || [])[1]);
    console.log('0x addresses in html:', [...new Set(html.match(/0x[0-9a-fA-F]{40,64}/g) || [])].join(' '));
    for (const k of ['schema', 'attester', 'attestation', 'EAS', 'easscan']) { const i = txt.toLowerCase().indexOf(k.toLowerCase()); if (i >= 0) console.log('[' + k + ']', txt.slice(Math.max(0, i - 150), i + 350)); }
  } catch (e) { console.log('docs err', e.message); }

  console.log('\n== easscan graphql');
  const q = (recipient) => ({ query: 'query($r:String!){attestations(where:{recipient:{equals:$r}},take:10,orderBy:[{time:desc}]){id schemaId attester recipient revoked time decodedDataJson}}', variables: { r: recipient } });
  const verifiedWallet = '0xae47622426ae6c74baa8c75c07304b6e53e4c444'; // gm.ink shows verified:true
  for (const host of ['https://ink.easscan.org/graphql', 'https://easscan.org/graphql']) {
    for (const [name, w] of [['gm verified #1', verifiedWallet], ['user', '0x2ff5131f1f349b8079054cbe23aed21a54810391']]) {
      try { const r = await fetch(host, { method: 'POST', headers: UA, body: JSON.stringify(q(w)) }); const t = await r.text(); console.log(host, name, r.status, t.slice(0, 900)); } catch (e) { console.log(host, name, 'ERR', e.message); }
    }
  }

  console.log('\n== RPC logs for Attested(recipient)');
  const latest = parseInt((await rpc('eth_blockNumber', [])).result, 16);
  console.log('latest block', latest);
  for (const [name, w] of [['gm verified #1', verifiedWallet], ['user', '0x2ff5131f1f349b8079054cbe23aed21a54810391']]) {
    const r = await rpc('eth_getLogs', [{ fromBlock: '0x0', toBlock: 'latest', address: EAS, topics: [T_ATTESTED, pad(w)] }]);
    if (r.error) { console.log(name, 'getLogs error', JSON.stringify(r.error).slice(0, 200)); continue; }
    console.log(name, 'attestations found:', r.result.length);
    r.result.slice(0, 5).forEach((l) => console.log('   attester', '0x' + l.topics[2].slice(26), 'schema', l.topics[3], 'uid', l.data.slice(0, 66), 'block', parseInt(l.blockNumber, 16)));
  }
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
