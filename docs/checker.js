/* Browser-side Ink airdrop checker. Reads Ink (RPC + Blockscout) and GitHub directly from the visitor's browser. */
(function (root) {
  'use strict';
  var EXPLORER = 'https://explorer.inkonchain.com';
  var RPC = 'https://rpc-gel.inkonchain.com';
  var INK_ORGS = ['inkonchain'];
  var MAINNET_LAUNCH = Date.parse('2024-12-09T00:00:00Z');
  var MAX_PAGES = 20, DAY = 86400000;

  var TIERS_TX = [[1, 2], [10, 5], [25, 8], [100, 11], [500, 13], [2000, 14]];
  var TIERS_MONTHS = [[1, 1], [2, 2], [3, 3], [4, 4], [6, 6], [9, 8], [12, 10]];
  var TIERS_APPS = [[1, 1], [3, 3], [5, 5], [10, 7], [20, 8]];
  var TIERS_VALUE = [[1, 1], [100, 3], [1000, 5], [10000, 7], [100000, 8]];
  var TIERS_COMMITS = [[1, 3], [5, 6], [20, 9], [50, 11]];
  var TIERS_PRS = [[1, 2], [3, 4], [10, 6]];
  var TIERS_DEPLOYED = [[1, 1], [3, 3]];
  var TIERS_FOLLOWERS = [[50, 1], [200, 2], [1000, 4], [5000, 6], [20000, 8], [100000, 9]];
  var TIERS_LABELS = [{ n: 'Droplet', min: 8 }, { n: 'Quill', min: 20 }, { n: 'Nib', min: 35 }, { n: 'Inkwell', min: 55 }];

  function tier(v, t) { var p = 0; for (var i = 0; i < t.length; i++) if (v >= t[i][0]) p = t[i][1]; return p; }
  function maxOf(t) { return t[t.length - 1][1]; }
  function item(id, label, value, display, pts, max, note) { return { id: id, label: label, value: value, display: display, pts: pts, max: max, note: note || '' }; }
  function na(id, label, max, note) { return item(id, label, null, 'unavailable', 0, max, note); }

  function getJson(url, opts, ms) {
    var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, ms || 15000);
    return fetch(url, Object.assign({ signal: ctl.signal }, opts || {})).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) { var e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
      return res.json();
    }, function (e) { clearTimeout(timer); throw e; });
  }
  function rpc(method, params) {
    return getJson(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: method, params: params }) })
      .then(function (j) { if (j.error) throw new Error(j.error.message || 'rpc error'); return j.result; });
  }

  async function checkChain(address, warnings) {
    var out = { txCount: null, months: null, apps: null, deployed: null, firstTs: null, valueUsd: null, sampled: false };
    try { out.txCount = parseInt(await rpc('eth_getTransactionCount', [address, 'latest']), 16); }
    catch (e) { warnings.push('Ink RPC lookup failed (' + e.message + '). Transaction count is unavailable.'); }
    try {
      var base = EXPLORER + '/api/v2/addresses/' + address, usd = 0;
      var info = await getJson(base);
      usd += (Number(info.coin_balance || 0) / 1e18) * Number(info.exchange_rate || 0);
      try {
        var toks = await getJson(base + '/token-balances');
        (Array.isArray(toks) ? toks : []).forEach(function (t) {
          var tk = t.token || {};
          if (tk.type && tk.type !== 'ERC-20') return;
          usd += (Number(t.value || 0) / Math.pow(10, Number(tk.decimals || 18))) * Number(tk.exchange_rate || 0);
        });
      } catch (e) { warnings.push('Token balances could not be read, so holdings count ETH only.'); }
      out.valueUsd = usd;

      var months = {}, apps = {}, deployed = 0, first = Infinity, pages = 0, next = null, count = 0;
      do {
        var qs = next ? '&' + new URLSearchParams(next).toString() : '';
        var j = await getJson(base + '/transactions?filter=from' + qs);
        (j.items || []).forEach(function (t) {
          count++;
          var ts = Date.parse(t.timestamp);
          if (!isNaN(ts)) { months[t.timestamp.slice(0, 7)] = 1; if (ts < first) first = ts; }
          var to = t.to && t.to.hash;
          if (t.created_contract || !t.to) deployed++;
          else if (to && (t.to.is_contract || t.method)) apps[to.toLowerCase()] = 1;
        });
        next = j.next_page_params || null; pages++;
      } while (next && pages < MAX_PAGES);
      out.sampled = !!next;
      out.months = Object.keys(months).length; out.apps = Object.keys(apps).length; out.deployed = deployed;
      out.firstTs = isFinite(first) ? first : null;
      if (out.sampled) {
        warnings.push('Very active wallet: history was read up to ' + count + ' transactions, so months, apps and deployments may be understated.');
        try {
          var a = await getJson(base + '/transactions?filter=from&sort=block_number&order=asc');
          var f = a.items && a.items[0] && Date.parse(a.items[0].timestamp);
          if (f && !isNaN(f)) { out.firstTs = f; out.months = Math.max(out.months, Math.round((Date.now() - f) / (30.4 * DAY))); }
        } catch (e) { /* keep sampled value */ }
      }
    } catch (e) {
      warnings.push('Ink explorer lookup failed (' + e.message + '). Months active, apps used, holdings, deployments and join date are not scored.');
    }
    return out;
  }

  async function checkGithub(handle, warnings) {
    if (!handle) return null;
    var out = { found: false, commits: 0, prs: 0 };
    var H = { Accept: 'application/vnd.github+json' };
    try { await getJson('https://api.github.com/users/' + encodeURIComponent(handle), { headers: H }); out.found = true; }
    catch (e) {
      if (e.status === 404) return out;
      warnings.push('GitHub lookup failed (' + e.message + '). GitHub limits anonymous browser requests, so wait a minute and retry.');
      out.error = true; return out;
    }
    for (var k = 0; k < INK_ORGS.length; k++) {
      var org = INK_ORGS[k];
      try {
        var c = await getJson('https://api.github.com/search/commits?per_page=1&q=' + encodeURIComponent('author:' + handle + ' org:' + org), { headers: H });
        out.commits += Number(c.total_count || 0);
        var p = await getJson('https://api.github.com/search/issues?per_page=1&q=' + encodeURIComponent('is:pr is:merged author:' + handle + ' org:' + org), { headers: H });
        out.prs += Number(p.total_count || 0);
      } catch (e) { warnings.push('GitHub search for org "' + org + '" failed (' + e.message + ').'); }
    }
    return out;
  }

  function score(chain, gh, xf, xyears, hasX) {
    var cats = [], c = [], g = [], s = [];
    c.push(chain.txCount == null ? na('tx', 'Transactions on Ink', maxOf(TIERS_TX), 'RPC unreachable')
      : item('tx', 'Transactions on Ink', chain.txCount, String(chain.txCount), tier(chain.txCount, TIERS_TX), maxOf(TIERS_TX), 'Outgoing transactions (account nonce)'));
    c.push(chain.months == null ? na('months', 'Active months', maxOf(TIERS_MONTHS), 'Explorer unreachable')
      : item('months', 'Active months', chain.months, String(chain.months), tier(chain.months, TIERS_MONTHS), maxOf(TIERS_MONTHS), 'Distinct calendar months with a transaction'));
    c.push(chain.apps == null ? na('apps', 'Different apps used', maxOf(TIERS_APPS), 'Explorer unreachable')
      : item('apps', 'Different apps used', chain.apps, String(chain.apps), tier(chain.apps, TIERS_APPS), maxOf(TIERS_APPS), 'Unique contracts you called'));
    c.push(chain.valueUsd == null ? na('value', 'Value held on Ink', maxOf(TIERS_VALUE), 'Explorer unreachable')
      : item('value', 'Value held on Ink', chain.valueUsd, '$' + Math.round(chain.valueUsd).toLocaleString('en-US'), tier(chain.valueUsd, TIERS_VALUE), maxOf(TIERS_VALUE), 'ETH plus priced tokens now, used in place of bridged volume'));
    if (chain.firstTs == null) c.push(na('early', 'Early adopter', 4, chain.months == null ? 'Explorer unreachable' : 'No transactions found'));
    else { var d = (chain.firstTs - MAINNET_LAUNCH) / DAY; c.push(item('early', 'Early adopter', chain.firstTs, new Date(chain.firstTs).toISOString().slice(0, 10), d <= 30 ? 4 : d <= 180 ? 3 : 2, 4, 'Date of your first transaction')); }
    cats.push({ id: 'chain', name: 'Wallet activity', note: 'Read live from Ink.', items: c });

    if (!gh) { g.push(na('commits', 'Commits to Ink repos', maxOf(TIERS_COMMITS), 'No GitHub username entered')); g.push(na('prs', 'Merged pull requests', maxOf(TIERS_PRS), 'No GitHub username entered')); }
    else if (!gh.found) { var why = gh.error ? 'GitHub unreachable' : 'GitHub user not found'; g.push(na('commits', 'Commits to Ink repos', maxOf(TIERS_COMMITS), why)); g.push(na('prs', 'Merged pull requests', maxOf(TIERS_PRS), why)); }
    else {
      g.push(item('commits', 'Commits to Ink repos', gh.commits, String(gh.commits), tier(gh.commits, TIERS_COMMITS), maxOf(TIERS_COMMITS), 'Across ' + INK_ORGS.join(', ')));
      g.push(item('prs', 'Merged pull requests', gh.prs, String(gh.prs), tier(gh.prs, TIERS_PRS), maxOf(TIERS_PRS), 'Across ' + INK_ORGS.join(', ')));
    }
    g.push(chain.deployed == null ? na('deployed', 'Contracts deployed on Ink', maxOf(TIERS_DEPLOYED), 'Explorer unreachable')
      : item('deployed', 'Contracts deployed on Ink', chain.deployed, String(chain.deployed), tier(chain.deployed, TIERS_DEPLOYED), maxOf(TIERS_DEPLOYED), 'Contract creations from this wallet'));
    cats.push({ id: 'dev', name: 'GitHub', note: 'Contributions to Ink organisations, plus contracts you deployed.', items: g });

    if (xf != null) {
      var yrs = xyears || 0, yp = yrs >= 3 ? 2 : yrs >= 1 ? 1 : 0;
      s.push(item('followers', 'X followers', xf, xf.toLocaleString('en-US'), tier(xf, TIERS_FOLLOWERS), maxOf(TIERS_FOLLOWERS), 'Typed by you'));
      s.push(item('xage', 'X account age', yrs, yrs + ' yrs', yp, 2, 'Typed by you'));
    } else {
      var w = 'X cannot be read without an API key. Type your followers to score this.';
      s.push(na('followers', 'X followers', maxOf(TIERS_FOLLOWERS), w)); s.push(na('xage', 'X account age', 2, w));
    }
    cats.push({ id: 'social', name: 'X reach', note: 'Follower count and account age.', items: s });
    cats.forEach(function (k) { k.score = k.items.reduce(function (a, i) { return a + i.pts; }, 0); k.max = k.items.reduce(function (a, i) { return a + i.max; }, 0); });
    return cats;
  }

  function sybil(chain) {
    var flags = [], f = 1;
    if (chain.txCount != null && chain.apps != null && chain.txCount >= 200 && chain.apps <= 2) { f *= 0.5; flags.push('Many transactions to very few apps, a common farming pattern.'); }
    if (chain.txCount != null && chain.firstTs && chain.txCount >= 100 && (Date.now() - chain.firstTs) < 7 * DAY) { f *= 0.5; flags.push('Over 100 transactions in the first week of wallet life.'); }
    return { factor: f, flags: flags };
  }

  async function check(q) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(q.address || '')) throw new Error('Enter a valid wallet address: 0x followed by 40 characters.');
    var github = (q.github || '').replace(/^@/, '');
    if (github && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(github)) throw new Error('That GitHub username is not valid.');
    var warnings = [], address = q.address.toLowerCase();
    var r = await Promise.all([checkChain(address, warnings), checkGithub(github, warnings)]);
    var cats = score(r[0], r[1], q.xf != null && isFinite(q.xf) ? Math.max(0, Math.floor(q.xf)) : null, q.xyears, false);
    var raw = cats.reduce(function (a, c) { return a + c.score; }, 0), sy = sybil(r[0]);
    return { address: address, categories: cats, rawScore: raw, sybil: sy, score: Math.round(raw * sy.factor * 10) / 10,
      totalMax: cats.reduce(function (a, c) { return a + c.max; }, 0), tiers: TIERS_LABELS, warnings: warnings, generatedAt: new Date().toISOString() };
  }

  var api = { check: check };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.InkChecker = api;
})(typeof window !== 'undefined' ? window : globalThis);
