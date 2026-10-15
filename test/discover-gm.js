'use strict';
const base = 'https://www.gm.ink';
const get = (u) => fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
(async () => {
  const pg = await (await get(base + '/api/leaderboard-pagination?page=1')).json();
  console.log('pagination keys:', Object.keys(pg).join(','));
  const u0 = pg.users[0];
  console.log('pagination user[0]:', JSON.stringify(u0).slice(0, 1400));
  console.log('users on page:', pg.users.length, JSON.stringify(Object.fromEntries(Object.entries(pg).filter(([k]) => k !== 'users'))).slice(0, 400));
  const addr = u0.address;
  const r = await get(base + '/api/user-leaderboard?address=' + addr);
  console.log('\nuser-leaderboard', r.status, (await r.text()).slice(0, 1800));
  const g = await get(base + '/api/gm-data?address=' + addr);
  console.log('\ngm-data for top user', g.status, (await g.text()).slice(0, 700));
  const p2 = await (await get(base + '/api/leaderboard-pagination?page=2')).json();
  console.log('\npage2 first address', p2.users && p2.users[0] && p2.users[0].address);
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
