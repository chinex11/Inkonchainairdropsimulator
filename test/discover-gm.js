'use strict';
const EX = 'https://explorer.inkonchain.com';
const ZNS = '0xFb2Cd41a8aeC89EFBb19575C6c48d872cE97A0A5';
const j = async (u) => { try { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }); const t = await r.text(); try { return { s: r.status, j: JSON.parse(t) }; } catch (e) { return { s: r.status, t: t.slice(0, 150) }; } } catch (e) { return { s: 'ERR', t: e.message }; } };
const show = (o) => JSON.stringify(o).slice(0, 700);
(async () => {
  const W = '0x2ff5131f1f349b8079054cbe23aed21a54810391';
  const c = await j(EX + '/api/v2/addresses/' + W + '/counters'); console.log('COUNTERS', c.s, show(c.j || c.t));
  const tb = await j(EX + '/api/v2/addresses/' + W + '/token-balances');
  console.log('TOKEN-BALANCES', tb.s, 'count', Array.isArray(tb.j) ? tb.j.length : '-');
  (Array.isArray(tb.j) ? tb.j : []).slice(0, 15).forEach((x) => console.log('  ', x.token && x.token.type, '|', x.token && x.token.name, '|', x.token && x.token.symbol, '|', x.value, '|', x.token && x.token.address_hash));
  const nft = await j(EX + '/api/v2/addresses/' + W + '/nft/collections');
  console.log('NFT-COLLECTIONS', nft.s, 'items', ((nft.j && nft.j.items) || []).length);
  ((nft.j && nft.j.items) || []).slice(0, 10).forEach((x) => console.log('  ', x.token && x.token.name, '|', x.token && x.token.symbol, '| amount', x.amount, '|', x.token && x.token.address_hash));
  const z = await j(EX + '/api/v2/tokens/' + ZNS); console.log('\nZNS TOKEN', z.s, show({ name: z.j && z.j.name, symbol: z.j && z.j.symbol, holders: z.j && (z.j.holders_count || z.j.holders), supply: z.j && z.j.total_supply, type: z.j && z.j.type }));
  const zh = await j(EX + '/api/v2/tokens/' + ZNS + '/holders');
  const holders = (zh.j && zh.j.items) || [];
  console.log('ZNS HOLDERS', zh.s, holders.length, 'first', holders[0] && holders[0].address && holders[0].address.hash, 'value', holders[0] && holders[0].value);
  if (holders[0]) {
    const h = holders[0].address.hash;
    const t2 = await j(EX + '/api/v2/addresses/' + h + '/token-balances');
    const hit = (Array.isArray(t2.j) ? t2.j : []).filter((x) => x.token && x.token.address_hash && x.token.address_hash.toLowerCase() === ZNS.toLowerCase());
    console.log('  holder', h, 'token-balances sees ZNS?', hit.length, hit[0] && hit[0].value);
    const n2 = await j(EX + '/api/v2/addresses/' + h + '/nft?type=ERC-721');
    console.log('  nft list', n2.s, ((n2.j && n2.j.items) || []).slice(0, 3).map((x) => [x.token && x.token.symbol, x.id, x.metadata && x.metadata.name].join('|')).join(' ; '));
  }
  const aave = await j(EX + '/api/v2/tokens?q=InkWhitelabel&type=ERC-20');
  console.log('\nAAVE/TYDRO TOKENS', aave.s);
  ((aave.j && aave.j.items) || []).forEach((x) => console.log('  ', x.name, '|', x.symbol, '|', x.address_hash, '| holders', x.holders_count));
  const tp = await j(EX + '/api/v2/tokens/0x40aBd730Cc9dA34a8EE9823fEaBDBa35E50c4ac7');
  console.log('\nTYDRO INK POINTS', tp.s, show({ name: tp.j && tp.j.name, holders: tp.j && tp.j.holders_count, decimals: tp.j && tp.j.decimals, supply: tp.j && tp.j.total_supply }));
  const usdc = await j(EX + '/api/v2/tokens/0x70A38B0c90441e991346B7A0Cd98C8528dD1c234/holders');
  const dep = (usdc.j && usdc.j.items) || [];
  if (dep[0]) {
    const a = dep[0].address.hash; const t3 = await j(EX + '/api/v2/addresses/' + a + '/token-balances');
    console.log('aUSDC top holder', a, 'sees aInkWl token?', (Array.isArray(t3.j) ? t3.j : []).filter((x) => x.token && /InkWhitelabel/.test(x.token.name || '')).map((x) => x.token.symbol + ':' + x.value).join(', '));
  }
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
