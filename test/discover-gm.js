'use strict';
const H = 'https://ink.easscan.org/graphql', EX = 'https://explorer.inkonchain.com';
const SCHEMA = '0x8ffa68bde25f7b88e042ea3dff55ff27217b7d1c4bf24f57967b285c5ffe4c8b';
const ATT = '0xfDB645Fe7868064bF3934f307A918C817e759fF6';
const gql = async (query, variables) => { const r = await fetch(H, { method: 'POST', headers: { 'content-type': 'application/json', 'User-Agent': 'Mozilla/5.0' }, body: JSON.stringify({ query, variables }) }); const t = await r.text(); try { return JSON.parse(t); } catch (e) { return { raw: t.slice(0, 300) }; } };
const j = async (u) => { try { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }); return await r.json(); } catch (e) { return { err: e.message }; } };
(async () => {
  const sc = await gql('query($id:String!){getSchema(where:{id:$id}){id index schema creator resolver revocable time txid}}', { id: SCHEMA });
  console.log('SCHEMA', JSON.stringify(sc.data || sc).slice(0, 700));
  const total = await gql('query($s:String!,$a:String!){aggregateAttestation(where:{schemaId:{equals:$s}}){_count{_all}} other:aggregateAttestation(where:{schemaId:{equals:$s},attester:{not:{equals:$a}}}){_count{_all}}}', { s: SCHEMA, a: ATT });
  console.log('COUNTS (all with schema / by other attesters):', JSON.stringify(total.data || total).slice(0, 300));
  const at = await j(EX + '/api/v2/addresses/' + ATT);
  console.log('\nATTESTER explorer:', JSON.stringify({ name: at.name, ens: at.ens_domain_name, tags: at.metadata && at.metadata.tags, contract: at.is_contract, tagsPublic: at.public_tags, private: at.private_tags, watchlist: at.watchlist_names }));
  const ac = await j(EX + '/api/v2/addresses/' + ATT + '/counters'); console.log('attester counters', JSON.stringify(ac));
  const sample = await gql('query($s:String!){attestations(where:{schemaId:{equals:$s}},take:3,orderBy:[{time:asc}]){id attester recipient revoked time expirationTime refUID txid}}', { s: SCHEMA });
  console.log('OLDEST with this schema', JSON.stringify(sample.data || sample).slice(0, 700));
  const sc2 = await gql('query($id:String!){getSchema(where:{id:$id}){creator}}', { id: SCHEMA });
  const creator = sc2.data && sc2.data.getSchema && sc2.data.getSchema.creator;
  if (creator) { const cr = await j(EX + '/api/v2/addresses/' + creator); console.log('SCHEMA CREATOR', creator, JSON.stringify({ name: cr.name, ens: cr.ens_domain_name, tags: cr.metadata && cr.metadata.tags })); }
  const search = await j(EX + '/api/v2/search?q=' + ATT);
  console.log('explorer search for attester:', JSON.stringify(search.items && search.items.slice(0, 3)).slice(0, 400));
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
