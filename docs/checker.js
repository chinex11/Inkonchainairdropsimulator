/* Browser-side Ink airdrop checker. Reads Ink (RPC + Blockscout), the gm.ink leaderboard and Ink's EAS attestations from the visitor's browser. */
(function (root) {
  'use strict';
  var EXPLORER = 'https://explorer.inkonchain.com';
  var RPC = 'https://rpc-gel.inkonchain.com';
  var MAINNET_LAUNCH = Date.parse('2024-12-09T00:00:00Z');
  var MAX_PAGES = 6, TIME_BUDGET = 10000, DAY = 86400000;

  var TIERS_TX = [[1, 2], [10, 5], [25, 8], [100, 11], [500, 13], [2000, 14]];
  var TIERS_MONTHS = [[1, 1], [2, 2], [3, 3], [4, 4], [6, 6], [9, 8], [12, 10]];
  var TIERS_APPS = [[1, 1], [3, 3], [5, 5], [10, 7], [20, 8]];
  var TIERS_VALUE = [[1, 1], [100, 3], [1000, 5], [10000, 7], [100000, 8]];
  var TIERS_DEPLOYED = [[1, 1], [3, 3]];
  var TIERS_STREAK = [[7, 1], [30, 2], [100, 3]];
  var TIERS_GM_PEOPLE = [[5, 1], [25, 2]];
  var GM_RANK_MAX = 10;
  var TIERS_DOMAINS = [[1, 3], [3, 4]];
  var TIERS_NFTS = [[1, 1], [3, 2], [8, 3]];
  var TIERS_TRANSFERS = [[10, 1], [50, 2], [200, 3]];
  var TIERS_GAS = [[1e6, 1], [1e7, 2], [5e7, 3]];
  var EAS_GQL = 'https://ink.easscan.org/graphql';
  var KRAKEN_SCHEMA = '0x8ffa68bde25f7b88e042ea3dff55ff27217b7d1c4bf24f57967b285c5ffe4c8b'; // 'bool verified' on Ink's EAS
  var KRAKEN_ATTESTER = '0xfDB645Fe7868064bF3934f307A918C817e759fF6';
  var ZNS_ADDR = '0xfb2cd41a8aec89efbb19575c6c48d872ce97a0a5';      // ZNS Connect, the .ink domain NFT
  var TIERS_LABELS = [{ n: 'Droplet', min: 8 }, { n: 'Quill', min: 20 }, { n: 'Nib', min: 37 }, { n: 'Inkwell', min: 57 }];

  function tier(v, t) { var p = 0; for (var i = 0; i < t.length; i++) if (v >= t[i][0]) p = t[i][1]; return p; }
  function maxOf(t) { return t[t.length - 1][1]; }
  function fmtNum(n) { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n * 100) / 100); }
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

  function within(p, ms, fallback) { return Promise.race([p, new Promise(function (r) { setTimeout(function () { r(fallback); }, ms); })]); }

  async function checkChain(address, warnings, out) {
    var started = Date.now();
    try { out.txCount = parseInt(await rpc('eth_getTransactionCount', [address, 'latest']), 16); }
    catch (e) { warnings.push('Ink RPC lookup failed (' + e.message + '). Transaction count is unavailable.'); }
    var base = EXPLORER + '/api/v2/addresses/' + address;
    var big = out.txCount == null || out.txCount > 150;

    var holdings = (async function () {
      try {
        var info = await getJson(base), usd = (Number(info.coin_balance || 0) / 1e18) * Number(info.exchange_rate || 0);
        try {
          var toks = await getJson(base + '/token-balances'), domains = 0;
          (Array.isArray(toks) ? toks : []).forEach(function (t) {
            var tk = t.token || {}, dec = Number(tk.decimals || 18), amt = Number(t.value || 0);
            var addr = String(tk.address_hash || tk.address || '').toLowerCase(), name = String(tk.name || '');
            if (addr === ZNS_ADDR) { domains += amt; return; }
            if (tk.type && tk.type !== 'ERC-20') return;
            usd += (amt / Math.pow(10, dec)) * Number(tk.exchange_rate || 0);
          });
          out.domains = domains;
        } catch (e) { warnings.push('Token balances could not be read, so holdings and domains are missing.'); }
        out.valueUsd = usd;
      } catch (e) { warnings.push('Holdings could not be read (' + e.message + ').'); }
    })();

    var extras = (async function () {
      try { var c = await getJson(base + '/counters'); out.tokenTransfers = Number(c.token_transfers_count || 0); out.gasUsed = Number(c.gas_usage_count || 0); } catch (e) { /* items show unavailable */ }
      try {
        var n = await getJson(base + '/nft/collections');
        out.nftCollections = (n.items || []).filter(function (x) { return String((x.token && x.token.address_hash) || '').toLowerCase() !== ZNS_ADDR; }).length;
      } catch (e) { /* item shows unavailable */ }
    })();

    var history = (async function () {
      try {
        var months = {}, apps = {}, deployed = 0, first = Infinity, pages = 0, next = null;
        do {
          var qs = next ? '&' + new URLSearchParams(next).toString() : '';
          var j = await getJson(base + '/transactions?filter=from' + qs);
          (j.items || []).forEach(function (t) {
            var ts = Date.parse(t.timestamp);
            if (!isNaN(ts)) { months[t.timestamp.slice(0, 7)] = 1; if (ts < first) first = ts; }
            var to = t.to && t.to.hash;
            if (t.created_contract || !t.to) deployed++;
            else if (to && (t.to.is_contract || t.method)) apps[to.toLowerCase()] = 1;
          });
          next = j.next_page_params || null; pages++;
        } while (next && pages < MAX_PAGES && Date.now() - started < TIME_BUDGET);
        out.sampled = !!next;
        out.months = Object.keys(months).length; out.apps = Object.keys(apps).length; out.deployed = deployed;
        out.firstTs = isFinite(first) ? first : null;
      } catch (e) { warnings.push('Ink explorer history failed (' + e.message + '). Months active, apps used, deployments and join date are not scored.'); }
    })();

    var oldest = big ? getJson(base + '/transactions?filter=from&sort=block_number&order=asc').then(function (a) {
      var f = a.items && a.items[0] && Date.parse(a.items[0].timestamp); return f && !isNaN(f) ? f : null;
    }).catch(function () { return null; }) : Promise.resolve(null);

    var res = await Promise.all([holdings, extras, history, oldest]);
    if (out.sampled) {
      warnings.push('Large wallet: only the newest ' + (MAX_PAGES * 50) + ' transactions were read to keep this fast, so months active, apps used and deployments are estimates.');
      if (res[3]) { out.firstTs = res[3]; if (out.months != null) out.months = Math.max(out.months, Math.round((Date.now() - res[3]) / (30.4 * DAY))); }
    }
    return out;
  }

  async function checkKraken(address) {
    var query = 'query($r:String!,$s:String!,$a:String!){attestations(where:{recipient:{equals:$r,mode:insensitive},schemaId:{equals:$s},attester:{equals:$a}},take:5,orderBy:[{time:desc}]){revoked time expirationTime decodedDataJson}}';
    var j = await getJson(EAS_GQL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: query, variables: { r: address, s: KRAKEN_SCHEMA, a: KRAKEN_ATTESTER } }) });
    if (j.errors) throw new Error('attestation service error');
    var now = Date.now() / 1000;
    var live = ((j.data && j.data.attestations) || []).filter(function (a) { return !a.revoked && (!Number(a.expirationTime) || Number(a.expirationTime) > now); });
    return { verified: live.length > 0, since: live.length ? Number(live[live.length - 1].time) * 1000 : null };
  }

  function score(chain, gm, kraken) {
    var cats = [], c = [], m = [], idn = [], df = [];
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

    idn.push(chain.domains == null ? na('domains', '.ink domain owned', maxOf(TIERS_DOMAINS), 'Token balances unreachable')
      : item('domains', '.ink domain owned', chain.domains, String(chain.domains), tier(chain.domains, TIERS_DOMAINS), maxOf(TIERS_DOMAINS), chain.domains ? 'ZNS Connect names held by this wallet' : 'Get one at zns.bio to score here'));
    idn.push(chain.nftCollections == null ? na('nfts', 'Ink NFT collections held', maxOf(TIERS_NFTS), 'NFT list unreachable')
      : item('nfts', 'Ink NFT collections held', chain.nftCollections, String(chain.nftCollections), tier(chain.nftCollections, TIERS_NFTS), maxOf(TIERS_NFTS), 'Different collections, not counting .ink domains'));
    idn.push(!kraken ? na('kraken', 'Kraken verified wallet', 3, 'Attestation service unreachable')
      : kraken.verified ? item('kraken', 'Kraken verified wallet', 1, 'Verified', 3, 3, 'Onchain verification record on Ink' + (kraken.since ? ', issued ' + new Date(kraken.since).toISOString().slice(0, 10) : ''))
      : item('kraken', 'Kraken verified wallet', 0, 'Not verified', 0, 3, 'No active record found. Link this wallet to a verified Kraken account to get one'));
    cats.push({ id: 'ident', name: 'Ink identity', note: 'Domains and collectibles come from your token balances. Kraken verification is read from the onchain record.', items: idn });

    df.push(chain.tokenTransfers == null ? na('xfers', 'Token transfers', maxOf(TIERS_TRANSFERS), 'Explorer counters unreachable')
      : item('xfers', 'Token transfers', chain.tokenTransfers, String(chain.tokenTransfers), tier(chain.tokenTransfers, TIERS_TRANSFERS), maxOf(TIERS_TRANSFERS), 'Swaps, sends and mints that moved tokens'));
    df.push(chain.gasUsed == null ? na('gas', 'Gas used', maxOf(TIERS_GAS), 'Explorer counters unreachable')
      : item('gas', 'Gas used', chain.gasUsed, fmtNum(chain.gasUsed), tier(chain.gasUsed, TIERS_GAS), maxOf(TIERS_GAS), 'Total gas your transactions consumed'));
    df.push(chain.deployed == null ? na('deployed', 'Contracts deployed on Ink', maxOf(TIERS_DEPLOYED), 'Explorer unreachable')
      : item('deployed', 'Contracts deployed on Ink', chain.deployed, String(chain.deployed), tier(chain.deployed, TIERS_DEPLOYED), maxOf(TIERS_DEPLOYED), 'Contract creations from this wallet'));
    cats.push({ id: 'usage', name: 'Ink usage', note: 'How much you use the chain, from the explorer, including contracts you deployed.', items: df });

    if (!gm) {
      var gw = 'GM data unavailable right now';
      m.push(na('gmrank', 'GM leaderboard rank', GM_RANK_MAX, gw)); m.push(na('gmstreak', 'GM streak', maxOf(TIERS_STREAK), gw)); m.push(na('gmpeople', 'People you greeted', maxOf(TIERS_GM_PEOPLE), gw));
    } else if (!gm.ranked) {
      var gn = 'Tap GM daily at gm.ink to get ranked';
      m.push(item('gmrank', 'GM leaderboard rank', null, 'Not ranked', 0, GM_RANK_MAX, gn)); m.push(item('gmstreak', 'GM streak', 0, '0 days', 0, maxOf(TIERS_STREAK), gn)); m.push(item('gmpeople', 'People you greeted', 0, '0', 0, maxOf(TIERS_GM_PEOPLE), gn));
    } else {
      var pct = gm.total ? gm.rank / gm.total : null;
      var rp = pct == null ? 1 : pct <= 0.01 ? 10 : pct <= 0.05 ? 8 : pct <= 0.10 ? 6 : pct <= 0.25 ? 4 : pct <= 0.5 ? 2 : 1;
      m.push(item('gmrank', 'GM leaderboard rank', gm.rank, '#' + gm.rank.toLocaleString('en-US') + (gm.total ? ' of ' + gm.total.toLocaleString('en-US') : ''), rp, GM_RANK_MAX, (pct == null ? 'Ranked' : 'Top ' + (pct * 100 < 0.01 ? '0.01' : pct * 100 < 1 ? (pct * 100).toFixed(2) : Math.round(pct * 100)) + '%') + (gm.score ? ', gm.ink score ' + gm.score : '')));
      m.push(item('gmstreak', 'GM streak', gm.streak, gm.streak + (gm.streak === 1 ? ' day' : ' days'), tier(gm.streak, TIERS_STREAK), maxOf(TIERS_STREAK), 'Consecutive daily check-ins'));
      m.push(item('gmpeople', 'People you greeted', gm.uniqueSent, String(gm.uniqueSent), tier(gm.uniqueSent, TIERS_GM_PEOPLE), maxOf(TIERS_GM_PEOPLE), gm.sent + ' GMs sent, ' + gm.received + ' received'));
    }
    cats.push({ id: 'gm', name: 'Ink GM', note: 'Your rank on the gm.ink leaderboard, read live.', items: m });

    cats.forEach(function (k) { k.score = k.items.reduce(function (a, i) { return a + i.pts; }, 0); k.max = k.items.reduce(function (a, i) { return a + i.max; }, 0); });
    return cats;
  }

  // snapshot.nonces is sorted high to low, so the rank is one more than the number of wallets with more transactions.
  // Activity index = transactions sent + token transfers + gas used (millions); the snapshot builder uses the same formula.
  function activityIndex(c) { return (c.txCount || 0) + (c.tokenTransfers || 0) + Math.round((c.gasUsed || 0) / 1e6); }
  function rankAmong(snapshot, n, useActivity) {
    var a = useActivity ? snapshot.activity : snapshot.nonces, lo = 0, hi = a.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (a[mid] > n) lo = mid + 1; else hi = mid; }
    var k = (useActivity ? snapshot.activitySampled : snapshot.sampled) || a.length, scale = k > 0 ? (snapshot.total || k) / k : 1;
    return Math.max(1, Math.round((lo + 1) * scale));
  }

  function sybil(chain) {
    var flags = [], f = 1;
    if (chain.txCount != null && chain.apps != null && chain.txCount >= 200 && chain.apps <= 2) { f *= 0.5; flags.push('Many transactions to very few apps, a common farming pattern.'); }
    if (chain.txCount != null && chain.firstTs && chain.txCount >= 100 && (Date.now() - chain.firstTs) < 7 * DAY) { f *= 0.5; flags.push('Over 100 transactions in the first week of wallet life.'); }
    return { factor: f, flags: flags };
  }

  async function check(q) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(q.address || '')) throw new Error('Enter a valid wallet address: 0x followed by 40 characters.');
    var warnings = [], address = q.address.toLowerCase();
    var gmP = (q.gmLookup ? q.gmLookup(address) : (typeof location !== 'undefined' ? getJson('/api/gm?address=' + address) : Promise.reject(new Error('no GM endpoint'))))
      .catch(function (e) { warnings.push('Ink GM lookup failed (' + e.message + ').'); return null; });
    var chainOut = { txCount: null, months: null, apps: null, deployed: null, firstTs: null, valueUsd: null, sampled: false, domains: null, nftCollections: null, tokenTransfers: null, gasUsed: null };
    var chainP = within(checkChain(address, warnings, chainOut).then(function () { return 'ok'; }, function (e) { warnings.push('Ink lookup failed (' + e.message + ').'); return 'ok'; }), 25000, 'slow')
      .then(function (v) { if (v === 'slow') warnings.push('The Ink explorer was slow, so some wallet activity items are missing. Try again in a minute.'); return chainOut; });
    gmP = within(gmP, 15000, null);
    var krP = within(checkKraken(address).catch(function (e) { warnings.push('Kraken verification lookup failed (' + e.message + ').'); return null; }), 15000, null);
    var done = 0, step = function (label) { return function (v) { done++; if (q.onProgress) q.onProgress(done, 3, label); return v; }; };
    var statsP = getJson(EXPLORER + '/api/v2/stats').then(function (st) {
      var a = Number(st.total_addresses), t = Number(st.total_transactions);
      return a > 0 && t > 0 ? { addresses: a, transactions: t } : null;
    }).catch(function () { return null; });
    var snapP = q.snapshot ? Promise.resolve(q.snapshot) : within(getJson('verified-snapshot.json', {}, 12000).catch(function () { return null; }), 14000, null);
    var r = await Promise.all([chainP.then(step('Ink activity')), gmP.then(step('GM rank')), within(statsP, 10000, null), krP.then(step('Kraken Verify')), snapP]);
    var cats = score(r[0], r[1], r[3]);
    var raw = cats.reduce(function (a, c) { return a + c.score; }, 0), sy = sybil(r[0]);
    var snap = r[4], verifiedRank = null;
    if (snap && snap.nonces && snap.nonces.length && r[0].txCount != null) {
      var isV = !!(r[3] && r[3].verified), useAct = !!(snap.activity && snap.activity.length && r[0].tokenTransfers != null && r[0].gasUsed != null), rk = useAct ? rankAmong(snap, activityIndex(r[0]), true) : rankAmong(snap, r[0].txCount, false), tot = snap.total + (isV ? 0 : 1);
      verifiedRank = { rank: rk, total: tot, verified: isV, asOf: snap.generatedAt, pct: 100 * rk / tot, known: r[3] != null, basis: useAct ? 'activity' : 'transactions' };
    }
    var stats = r[2], txRank = null;
    if (stats && r[0].txCount > 0) {
      var m = stats.transactions / stats.addresses;
      var alpha = m > 1.05 ? Math.min(2.5, Math.max(0.8, m / (m - 1))) : 2.5;
      var P = Math.min(1, Math.pow(r[0].txCount, -alpha));
      txRank = { rank: Math.max(1, Math.round(stats.addresses * P)), pct: P * 100 };
    }
    return { address: address, categories: cats, rawScore: raw, sybil: sy, score: Math.round(raw * sy.factor * 10) / 10,
      totalMax: cats.reduce(function (a, c) { return a + c.max; }, 0), tiers: TIERS_LABELS, warnings: warnings, chainStats: stats, txRank: txRank, verifiedRank: verifiedRank, generatedAt: new Date().toISOString() };
  }

  var api = { check: check };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.InkChecker = api;
})(typeof window !== 'undefined' ? window : globalThis);
