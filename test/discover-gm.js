'use strict';
const H = 'https://ink.easscan.org/graphql';
const SCHEMA = '0x8ffa68bde25f7b88e042ea3dff55ff27217b7d1c4bf24f57967b285c5ffe4c8b', ATT = '0xfDB645Fe7868064bF3934f307A918C817e759fF6';
const Q = 'query($r:String!,$s:String!,$a:String!){attestations(where:{recipient:{equals:$r,mode:insensitive},schemaId:{equals:$s},attester:{equals:$a}},take:5,orderBy:[{time:desc}]){id revoked time expirationTime recipient decodedDataJson}}';
const ask = async (r) => { const res = await fetch(H, { method: 'POST', headers: { 'content-type': 'application/json', Origin: 'https://inkonchainairdropsimulator.vercel.app' }, body: JSON.stringify({ query: Q, variables: { r, s: SCHEMA, a: ATT } }) }); return { status: res.status, cors: res.headers.get('access-control-allow-origin'), body: await res.json() }; };
(async () => {
  const known = '0xEe8F6759fAB9329EAfEA08C7cDF279d019b79b9b';
  for (const [name, w] of [['known checksum', known], ['known lowercase', known.toLowerCase()], ['gm verified #1', '0xae47622426ae6c74baa8c75c07304b6e53e4c444'], ['user', '0x2ff5131f1f349b8079054cbe23aed21a54810391'], ['zero', '0x0000000000000000000000000000000000000001']]) {
    const r = await ask(w);
    const a = (r.body.data && r.body.data.attestations) || [];
    console.log(name.padEnd(16), 'status', r.status, 'cors', r.cors, 'found', a.length, a.length ? 'revoked=' + a[0].revoked + ' exp=' + a[0].expirationTime + ' ' + a[0].decodedDataJson.slice(0, 80) : '', r.body.errors ? JSON.stringify(r.body.errors).slice(0, 160) : '');
  }
  const o = await fetch(H, { method: 'OPTIONS', headers: { Origin: 'https://inkonchainairdropsimulator.vercel.app', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  console.log('preflight', o.status, o.headers.get('access-control-allow-origin'), o.headers.get('access-control-allow-headers'), o.headers.get('access-control-allow-methods'));
  const tot = await (await fetch(H, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'query($s:String!){active:aggregateAttestation(where:{schemaId:{equals:$s},revoked:{equals:false}}){_count{_all}} revoked:aggregateAttestation(where:{schemaId:{equals:$s},revoked:{equals:true}}){_count{_all}}}', variables: { s: SCHEMA } }) })).json();
  console.log('active vs revoked', JSON.stringify(tot.data));
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
