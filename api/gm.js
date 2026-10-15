'use strict';
/* Vercel serverless function + importable helper: looks up a wallet on the gm.ink leaderboard.
   The gm.ink API sends no CORS headers, so browsers must reach it through this same-site function. */
const BASE = 'https://www.gm.ink';
let totalCache = { v: null, t: 0 };

async function getJson(url, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms || 12000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'ink-airdrop-simulator' } });
    if (r.status === 404) return { __notFound: true };
    if (!r.ok) throw new Error('gm.ink HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}

async function totalPlayers() {
  if (totalCache.v && Date.now() - totalCache.t < 10 * 60000) return totalCache.v;
  const j = await getJson(BASE + '/api/leaderboard-pagination?page=1');
  const total = j && j.pagination && Number(j.pagination.total);
  if (total) totalCache = { v: total, t: Date.now() };
  return total || null;
}

async function lookupGm(address) {
  const j = await getJson(BASE + '/api/user-leaderboard?address=' + encodeURIComponent(address.toLowerCase()));
  const u = j && !j.__notFound ? j.user : null;
  const rank = u ? Number(String(u.rank).replace(/[^0-9]/g, '')) : NaN;
  if (!u || !isFinite(rank) || rank < 1) return { ranked: false };
  let total = null;
  try { total = await totalPlayers(); } catch (e) { /* percentile falls back to rank only */ }
  return {
    ranked: true, rank: rank, total: total, streak: Number(u.streak || 0), score: u.score,
    sent: Number(u.sent || 0), received: Number(u.received || 0),
    uniqueSent: Number(u.uniqueSent || 0), uniqueReceived: Number(u.uniqueReceived || 0),
    verified: !!u.verified, updated: j.lastUpdated || null
  };
}

module.exports = async function handler(req, res) {
  const address = String((req.query && req.query.address) || new URL(req.url, 'http://x').searchParams.get('address') || '').trim();
  res.setHeader('content-type', 'application/json');
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'Invalid address' })); }
  try {
    const out = await lookupGm(address);
    res.setHeader('cache-control', 's-maxage=60, stale-while-revalidate=300');
    res.statusCode = 200; res.end(JSON.stringify(out));
  } catch (e) { res.statusCode = 502; res.end(JSON.stringify({ error: e.message })); }
};
module.exports.lookupGm = lookupGm;
