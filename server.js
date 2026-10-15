'use strict';
/*
 * Ink Airdrop Checker (unofficial) - zero-dependency Node 18+ server.
 * GET /api/check?address=0x..&github=handle&x=handle[&xf=1234&xyears=2]
 * Looks the wallet up on Ink (JSON-RPC + Blockscout API), GitHub (REST search) and,
 * if X_BEARER_TOKEN is set, X (API v2), then scores it with an Arbitrum-style points model.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const EXPLORER = (process.env.INK_EXPLORER || 'https://explorer.inkonchain.com').replace(/\/$/, '');
const RPC = process.env.INK_RPC || 'https://rpc-gel.inkonchain.com';
const GH_TOKEN = process.env.GITHUB_TOKEN || '';
const X_TOKEN = process.env.X_BEARER_TOKEN || '';
const INK_ORGS = (process.env.INK_GITHUB_ORGS || 'inkonchain').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
const MAINNET_LAUNCH = Date.parse(process.env.INK_MAINNET_LAUNCH || '2024-12-09T00:00:00Z');
const MAX_PAGES = Number(process.env.MAX_TX_PAGES || 20);
const DAY = 86400000;

/* ---------- scoring table (edit these to change the model) ---------- */
const TIERS_TX = [[1, 2], [10, 5], [25, 8], [100, 11], [500, 13], [2000, 14]];
const TIERS_MONTHS = [[1, 1], [2, 2], [3, 3], [4, 4], [6, 6], [9, 8], [12, 10]];
const TIERS_APPS = [[1, 1], [3, 3], [5, 5], [10, 7], [20, 8]];
const TIERS_VALUE = [[1, 1], [100, 3], [1000, 5], [10000, 7], [100000, 8]];
const TIERS_COMMITS = [[1, 3], [5, 6], [20, 9], [50, 11]];
const TIERS_PRS = [[1, 2], [3, 4], [10, 6]];
const TIERS_DEPLOYED = [[1, 1], [3, 3]];
const TIERS_FOLLOWERS = [[50, 1], [200, 2], [1000, 4], [5000, 6], [20000, 8], [100000, 9]];
const TIERS_LABELS = [{ n: 'Droplet', min: 8 }, { n: 'Quill', min: 20 }, { n: 'Nib', min: 35 }, { n: 'Inkwell', min: 55 }];

function tier(v, t) { var p = 0; for (var i = 0; i < t.length; i++) if (v >= t[i][0]) p = t[i][1]; return p; }
function maxOf(t) { return t[t.length - 1][1]; }

/* ---------- helpers ---------- */
async function getJson(url, opts, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(function () { ctl.abort(); }, ms || 12000);
  try {
    const res = await fetch(url, Object.assign({ signal: ctl.signal }, opts || {}));
    if (!res.ok) { const e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
    return await res.json();
  } finally { clearTimeout(timer); }
}
async function rpc(method, params) {
  const j = await getJson(RPC, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params })
  });
  if (j.error) throw new Error(j.error.message || 'rpc error');
  return j.result;
}
function item(id, label, value, display, pts, max, note) {
  return { id: id, label: label, value: value, display: display, pts: pts, max: max, note: note || '' };
}
function unavailable(id, label, max, note) { return item(id, label, null, 'unavailable', 0, max, note); }

/* ---------- on-chain (Ink) ---------- */
async function checkChain(address, warnings) {
  const out = { txCount: null, months: null, apps: null, deployed: null, firstTs: null, valueUsd: null, sampled: false };

  try { out.txCount = parseInt(await rpc('eth_getTransactionCount', [address, 'latest']), 16); }
  catch (e) { warnings.push('Ink RPC lookup failed (' + e.message + '). Transaction count is unavailable.'); }

  try {
    const base = EXPLORER + '/api/v2/addresses/' + address;
    let usd = 0;
    const info = await getJson(base);
    const rate = Number(info.exchange_rate || 0);
    usd += (Number(info.coin_balance || 0) / 1e18) * rate;
    try {
      const toks = await getJson(base + '/token-balances');
      (Array.isArray(toks) ? toks : []).forEach(function (t) {
        const tk = t.token || {};
        if (tk.type && tk.type !== 'ERC-20') return;
        usd += (Number(t.value || 0) / Math.pow(10, Number(tk.decimals || 18))) * Number(tk.exchange_rate || 0);
      });
    } catch (e) { warnings.push('Token balances could not be read, so holdings count ETH only.'); }
    out.valueUsd = usd;

    const months = new Set(), apps = new Set();
    let deployed = 0, first = Infinity, pages = 0, next = null, count = 0;
    do {
      const qs = next ? '&' + new URLSearchParams(next).toString() : '';
      const j = await getJson(base + '/transactions?filter=from' + qs);
      (j.items || []).forEach(function (t) {
        count++;
        const ts = Date.parse(t.timestamp);
        if (!isNaN(ts)) { months.add(t.timestamp.slice(0, 7)); if (ts < first) first = ts; }
        const to = t.to && t.to.hash;
        if (t.created_contract || !t.to) deployed++;
        else if (to && (t.to.is_contract || t.method)) apps.add(to.toLowerCase());
      });
      next = j.next_page_params || null;
      pages++;
    } while (next && pages < MAX_PAGES);
    out.sampled = !!next;
    out.months = months.size; out.apps = apps.size; out.deployed = deployed;
    out.firstTs = isFinite(first) ? first : null;
    if (out.sampled) {
      warnings.push('Very active wallet: history was read up to ' + count + ' transactions, so months, apps and join date may be understated.');
      try {
        const a = await getJson(base + '/transactions?filter=from&sort=block_number&order=asc');
        const f = a.items && a.items[0] && Date.parse(a.items[0].timestamp);
        if (f && !isNaN(f)) out.firstTs = f;
      } catch (e) { /* keep sampled value */ }
    }
  } catch (e) {
    warnings.push('Ink explorer lookup failed (' + e.message + '). Months active, apps used, holdings, deployments and join date are not scored.');
  }
  return out;
}

/* ---------- GitHub ---------- */
function ghHeaders() {
  const h = { 'User-Agent': 'ink-airdrop-checker', Accept: 'application/vnd.github+json' };
  if (GH_TOKEN) h.Authorization = 'Bearer ' + GH_TOKEN;
  return h;
}
async function checkGithub(handle, warnings) {
  if (!handle) return null;
  const out = { found: false, commits: 0, prs: 0 };
  try {
    await getJson('https://api.github.com/users/' + encodeURIComponent(handle), { headers: ghHeaders() });
    out.found = true;
  } catch (e) {
    if (e.status === 404) return out;
    warnings.push('GitHub lookup failed (' + e.message + '). Add GITHUB_TOKEN on the server if you are being rate limited.');
    out.error = true; return out;
  }
  for (const org of INK_ORGS) {
    try {
      const c = await getJson('https://api.github.com/search/commits?per_page=1&q=' + encodeURIComponent('author:' + handle + ' org:' + org), { headers: ghHeaders() });
      out.commits += Number(c.total_count || 0);
      const p = await getJson('https://api.github.com/search/issues?per_page=1&q=' + encodeURIComponent('is:pr is:merged author:' + handle + ' org:' + org), { headers: ghHeaders() });
      out.prs += Number(p.total_count || 0);
    } catch (e) { warnings.push('GitHub search for org "' + org + '" failed (' + e.message + ').'); }
  }
  return out;
}

/* ---------- X ---------- */
async function checkX(handle, manualFollowers, manualYears, warnings) {
  if (X_TOKEN && handle) {
    try {
      const j = await getJson('https://api.x.com/2/users/by/username/' + encodeURIComponent(handle) + '?user.fields=public_metrics,created_at', { headers: { Authorization: 'Bearer ' + X_TOKEN } });
      if (j.data) {
        return { available: true, found: true, followers: j.data.public_metrics.followers_count, years: (Date.now() - Date.parse(j.data.created_at)) / (365.25 * DAY), source: 'X API' };
      }
      return { available: true, found: false };
    } catch (e) { warnings.push('X lookup failed (' + e.message + '). Using the follower numbers you typed, if any.'); }
  }
  if (manualFollowers != null) return { available: false, found: true, followers: manualFollowers, years: manualYears || 0, source: 'typed by user' };
  return { available: !!X_TOKEN, found: false, none: true };
}

/* ---------- scoring ---------- */
function score(chain, gh, x, hasX) {
  const cats = [];

  const c = [];
  c.push(chain.txCount == null ? unavailable('tx', 'Transactions on Ink', maxOf(TIERS_TX), 'RPC unreachable')
    : item('tx', 'Transactions on Ink', chain.txCount, String(chain.txCount), tier(chain.txCount, TIERS_TX), maxOf(TIERS_TX), 'Outgoing transactions (account nonce)'));
  c.push(chain.months == null ? unavailable('months', 'Active months', maxOf(TIERS_MONTHS), 'Explorer unreachable')
    : item('months', 'Active months', chain.months, String(chain.months), tier(chain.months, TIERS_MONTHS), maxOf(TIERS_MONTHS), 'Distinct calendar months with a transaction'));
  c.push(chain.apps == null ? unavailable('apps', 'Different apps used', maxOf(TIERS_APPS), 'Explorer unreachable')
    : item('apps', 'Different apps used', chain.apps, String(chain.apps), tier(chain.apps, TIERS_APPS), maxOf(TIERS_APPS), 'Unique contracts you called'));
  c.push(chain.valueUsd == null ? unavailable('value', 'Value held on Ink', maxOf(TIERS_VALUE), 'Explorer unreachable')
    : item('value', 'Value held on Ink', chain.valueUsd, '$' + Math.round(chain.valueUsd).toLocaleString('en-US'), tier(chain.valueUsd, TIERS_VALUE), maxOf(TIERS_VALUE), 'ETH plus priced ERC-20s now, used in place of bridged volume'));
  let early;
  if (chain.firstTs == null) early = unavailable('early', 'Early adopter', 4, chain.months == null ? 'Explorer unreachable' : 'No transactions found');
  else {
    const d = (chain.firstTs - MAINNET_LAUNCH) / DAY;
    const p = d <= 30 ? 4 : d <= 180 ? 3 : 2;
    early = item('early', 'Early adopter', chain.firstTs, new Date(chain.firstTs).toISOString().slice(0, 10), p, 4, 'Date of your first transaction');
  }
  c.push(early);
  cats.push({ id: 'chain', name: 'Wallet activity', note: 'Read live from Ink.', items: c });

  const g = [];
  if (!gh) {
    g.push(unavailable('commits', 'Commits to Ink repos', maxOf(TIERS_COMMITS), 'No GitHub username entered'));
    g.push(unavailable('prs', 'Merged pull requests', maxOf(TIERS_PRS), 'No GitHub username entered'));
  } else if (!gh.found) {
    g.push(unavailable('commits', 'Commits to Ink repos', maxOf(TIERS_COMMITS), gh.error ? 'GitHub unreachable' : 'GitHub user not found'));
    g.push(unavailable('prs', 'Merged pull requests', maxOf(TIERS_PRS), gh.error ? 'GitHub unreachable' : 'GitHub user not found'));
  } else {
    g.push(item('commits', 'Commits to Ink repos', gh.commits, String(gh.commits), tier(gh.commits, TIERS_COMMITS), maxOf(TIERS_COMMITS), 'Across ' + INK_ORGS.join(', ')));
    g.push(item('prs', 'Merged pull requests', gh.prs, String(gh.prs), tier(gh.prs, TIERS_PRS), maxOf(TIERS_PRS), 'Across ' + INK_ORGS.join(', ')));
  }
  g.push(chain.deployed == null ? unavailable('deployed', 'Contracts deployed on Ink', maxOf(TIERS_DEPLOYED), 'Explorer unreachable')
    : item('deployed', 'Contracts deployed on Ink', chain.deployed, String(chain.deployed), tier(chain.deployed, TIERS_DEPLOYED), maxOf(TIERS_DEPLOYED), 'Contract creations from this wallet'));
  cats.push({ id: 'dev', name: 'GitHub', note: 'Contributions to Ink organisations, plus contracts you deployed.', items: g });

  const s = [];
  if (x && x.found) {
    s.push(item('followers', 'X followers', x.followers, x.followers.toLocaleString('en-US'), tier(x.followers, TIERS_FOLLOWERS), maxOf(TIERS_FOLLOWERS), 'Source: ' + x.source));
    const yp = x.years >= 3 ? 2 : x.years >= 1 ? 1 : 0;
    s.push(item('xage', 'X account age', Math.round(x.years * 10) / 10, (Math.round(x.years * 10) / 10) + ' yrs', yp, 2, 'Source: ' + x.source));
  } else {
    const why = !hasX ? 'No X username entered' : (x && x.available === false ? 'Server has no X API key. Type your follower count instead.' : 'X user not found');
    s.push(unavailable('followers', 'X followers', maxOf(TIERS_FOLLOWERS), why));
    s.push(unavailable('xage', 'X account age', 2, why));
  }
  cats.push({ id: 'social', name: 'X reach', note: 'Follower count and account age.', items: s });

  cats.forEach(function (k) {
    k.score = k.items.reduce(function (a, i) { return a + i.pts; }, 0);
    k.max = k.items.reduce(function (a, i) { return a + i.max; }, 0);
  });
  return cats;
}

function sybil(chain) {
  const flags = []; let f = 1;
  if (chain.txCount != null && chain.apps != null && chain.txCount >= 200 && chain.apps <= 2) { f *= 0.5; flags.push('Many transactions to very few apps, a common farming pattern.'); }
  if (chain.txCount != null && chain.firstTs && chain.txCount >= 100 && (Date.now() - chain.firstTs) < 7 * DAY) { f *= 0.5; flags.push('Over 100 transactions in the first week of wallet life.'); }
  return { factor: f, flags: flags };
}

const cache = new Map();
async function check(q) {
  const key = JSON.stringify(q);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < 5 * 60000) return hit.v;
  const warnings = [];
  const address = q.address.toLowerCase();
  const [chain, gh, x] = await Promise.all([
    checkChain(address, warnings), checkGithub(q.github, warnings), checkX(q.x, q.xf, q.xyears, warnings)
  ]);
  const cats = score(chain, gh, x, !!q.x || q.xf != null);
  const raw = cats.reduce(function (a, c) { return a + c.score; }, 0);
  const sy = sybil(chain);
  const out = {
    address: address, categories: cats, rawScore: raw, sybil: sy,
    score: Math.round(raw * sy.factor * 10) / 10,
    totalMax: cats.reduce(function (a, c) { return a + c.max; }, 0),
    tiers: TIERS_LABELS, warnings: warnings, xApiConfigured: !!X_TOKEN,
    generatedAt: new Date().toISOString()
  };
  cache.set(key, { t: Date.now(), v: out });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return out;
}

/* ---------- http ---------- */
const hits = new Map();
function limited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter(function (t) { return now - t < 60000; });
  arr.push(now); hits.set(ip, arr);
  return arr.length > 20;
}
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const PUB = path.join(__dirname, 'public');

http.createServer(async function (req, res) {
  const u = new URL(req.url, 'http://localhost');
  const send = function (code, body, type) { res.writeHead(code, { 'content-type': type || 'application/json', 'cache-control': 'no-store' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };

  if (u.pathname === '/api/check') {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?';
    if (limited(String(ip).split(',')[0])) return send(429, { error: 'Too many checks. Wait a minute and try again.' });
    const address = (u.searchParams.get('address') || '').trim();
    const github = (u.searchParams.get('github') || '').trim().replace(/^@/, '');
    const xh = (u.searchParams.get('x') || '').trim().replace(/^@/, '');
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return send(400, { error: 'Enter a valid wallet address: 0x followed by 40 characters.' });
    if (github && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(github)) return send(400, { error: 'That GitHub username is not valid.' });
    if (xh && !/^[A-Za-z0-9_]{1,15}$/.test(xh)) return send(400, { error: 'That X username is not valid.' });
    const xfRaw = u.searchParams.get('xf'), xyRaw = u.searchParams.get('xyears');
    const xf = xfRaw !== null && xfRaw !== '' && isFinite(Number(xfRaw)) && Number(xfRaw) >= 0 ? Math.floor(Number(xfRaw)) : null;
    const xy = xyRaw !== null && xyRaw !== '' && isFinite(Number(xyRaw)) ? Math.max(0, Number(xyRaw)) : 0;
    try { return send(200, await check({ address: address, github: github, x: xh, xf: xf, xyears: xy })); }
    catch (e) { return send(500, { error: 'The check failed: ' + e.message }); }
  }

  const rel = u.pathname === '/' ? '/index.html' : u.pathname;
  const file = path.normalize(path.join(PUB, rel));
  if (file.indexOf(PUB) !== 0) return send(403, 'Forbidden', 'text/plain');
  fs.readFile(file, function (err, data) {
    if (err) return send(404, 'Not found', 'text/plain');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, function () { console.log('Ink Airdrop Checker on http://localhost:' + PORT); });
