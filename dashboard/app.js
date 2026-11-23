/* Rug Radar dashboard: board, rug detail and live peers. No network: it reads
   window.RADAR from data.js, written by main.ts from the sealed snapshot. */
(function () {
  'use strict';
  var D = window.RADAR;
  var app = document.getElementById('app');
  var meta = document.getElementById('meta');
  if (!D || !D.rows) { app.innerHTML = '<p class="empty">No radar data.</p>'; return; }

  var state = { q: '', tier: 'All', cat: 'All', sort: 'rank', watchlist: false };
  var TIERS = ['All', 'Low', 'Guarded', 'Elevated', 'High'];
  var TIER_COLOR = { Low: '#34d399', Guarded: '#fbbf24', Elevated: '#fb923c', High: '#f87171' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtInt(n) {
    var s = String(Math.round(n)), out = '';
    for (var i = 0; i < s.length; i++) { var j = s.length - i; out += s[i]; if (j > 1 && j % 3 === 1) out += ','; }
    return out;
  }
  function fmtUsd(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) { return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function fmtAge(d) {
    if (d == null) return '—';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return d + 'd';
  }
  function fmtChains(chains) {
    if (!chains || !chains.length) return '—';
    if (chains.length <= 2) return chains.join(', ');
    return chains[0] + ', ' + chains[1] + ' +' + (chains.length - 2);
  }
  function tierBadge(tier) { return '<span class="badge ' + tier + '">' + tier + '</span>'; }

  meta.textContent = 'Snapshot ' + D.as_of + ' · ' + fmtInt(D.protocols_total) + ' protocols in the snapshot · watchlist floor ' + fmtUsd(D.floor_usd) + ' · model ' + D.model_version;

  var categories = [];
  D.rows.forEach(function (r) { if (r.category && categories.indexOf(r.category) < 0) categories.push(r.category); });
  categories.sort();

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = D.rows.filter(function (r) {
      if (state.tier !== 'All' && r.rug_tier !== state.tier) return false;
      if (state.cat !== 'All' && r.category !== state.cat) return false;
      if (state.watchlist && !r.on_watchlist) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var s = state.sort;
    rows.sort(function (a, b) {
      if (s === 'implied') return b.implied_value_usd - a.implied_value_usd;
      if (s === 'tvl') return b.tvl_usd - a.tvl_usd;
      if (s === 'rug_desc') return b.rug_score - a.rug_score || a.rank - b.rank;
      if (s === 'rug_asc') return a.rug_score - b.rug_score || a.rank - b.rank;
      if (s === 'age') return (b.age_days == null ? -1 : b.age_days) - (a.age_days == null ? -1 : a.age_days);
      return a.rank - b.rank;
    });
    return rows;
  }

  function statsHtml() {
    return '<section class="stats">' +
      '<div class="stat"><b>' + D.watchlist_size + '</b><span>Watchlist protocols</span><div class="sub">TVL at or above the ' + fmtUsd(D.floor_usd) + ' floor, no token recorded</div></div>' +
      '<div class="stat"><b>' + D.board_size + '</b><span>Board rows</span><div class="sub">every rankable pre-token protocol</div></div>' +
      '<div class="stat"><b>' + D.median_rug + '</b><span>Median rug score</span><div class="sub">0–100, higher is riskier</div></div>' +
      '<div class="stat"><b>' + D.tier_counts.High + ' high-risk</b><span>' + D.tier_counts.Low + ' low · ' + D.tier_counts.Guarded + ' guarded · ' + D.tier_counts.Elevated + ' elevated</span><div class="sub">rug tiers across the board</div></div>' +
      '</section>';
  }

  function methodHtml() {
    return '<section class="method"><h2>How the rug screen works</h2>' +
      '<p>Each protocol is scored 0–100 on six signals read from the snapshot alone — never a name, never an outside list. ' +
      'The implied value is its TVL priced off its own category&rsquo;s tokened peers, then growth and maturity, then a haircut of up to 60% from the rug score.</p>' +
      '<p><code>implied = TVL × peer multiple × growth × maturity × (1 − rug/100 × 0.6)</code></p>' +
      '<div class="sig"><span>Capital flight · 25</span><span>Youth at scale · 25</span><span>Chain concentration · 15</span><span>Volatility · 15</span><span>Category class · 10</span><span>Ghost TVL · 10</span></div>' +
      '<p>Tiers: 0–24 Low, 25–44 Guarded, 45–64 Elevated, 65–100 High. A high tier farms small and carries a hard exit trigger.</p>' +
      '</section>';
  }

  function controlsHtml() {
    var pills = TIERS.map(function (t) {
      var n = t === 'All' ? D.board_size : D.tier_counts[t];
      return '<button class="pill' + (state.tier === t ? ' on' : '') + '" data-tier="' + t + '">' + t + ' · ' + n + '</button>';
    }).join('');
    var cats = '<option value="All">All categories</option>' + categories.map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var sorts = [['rank', 'Sort: rank'], ['implied', 'Sort: implied value'], ['tvl', 'Sort: TVL'], ['rug_desc', 'Sort: rug score, high first'], ['rug_asc', 'Sort: rug score, low first'], ['age', 'Sort: age, oldest first']];
    var sortOpts = sorts.map(function (s) { return '<option value="' + s[0] + '"' + (state.sort === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('');
    return '<div class="controls">' +
      '<input type="search" id="q" placeholder="Search name or slug…" value="' + esc(state.q) + '">' +
      '<div class="pills">' + pills + '</div>' +
      '<select id="cat">' + cats + '</select>' +
      '<select id="sort">' + sortOpts + '</select>' +
      '<label class="check"><input type="checkbox" id="wl"' + (state.watchlist ? ' checked' : '') + '> Watchlist only</label>' +
      '</div>';
  }

  function boardHtml(rows) {
    var body = rows.map(function (r) {
      var color = TIER_COLOR[r.rug_tier];
      return '<tr data-slug="' + esc(r.slug) + '"><td class="num">' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span> <span class="sub2">' + esc(r.slug) + '</span>' + (r.on_watchlist ? ' <span class="badge watch">Watchlist</span>' : '') + '</td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + esc(fmtChains(r.chains)) + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num">' + (r.change_7d == null ? '—' : fmtPct(r.change_7d)) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td><b>' + r.rug_score + '</b> ' + tierBadge(r.rug_tier) + '<div class="rugbar"><i style="width:' + r.rug_score + '%;background:' + color + '"></i></div></td>' +
        '<td class="num"><b>$' + fmtInt(r.implied_value_usd) + '</b></td></tr>';
    }).join('');
    return '<p class="count">Showing ' + rows.length + ' of ' + D.board_size + ' rows' + (state.tier !== 'All' ? ' · rug tier: ' + state.tier : '') + '. Click a row for its rug breakdown and farm plan.</p>' +
      '<table><thead><tr><th class="num">#</th><th>Protocol</th><th>Category</th><th>Chains</th><th class="num">TVL</th><th class="num">7d</th><th class="num">Age</th><th>Rug score</th><th class="num">Implied value</th></tr></thead>' +
      '<tbody>' + (body || '<tr><td colspan="9" class="empty">No protocol matches this filter.</td></tr>') + '</tbody></table>';
  }

  function liveHtml() {
    var body = D.live.map(function (p) {
      var mult = (p.mcap_usd != null && p.tvl_usd > 0) ? (p.mcap_usd / p.tvl_usd).toFixed(2) + '×' : '—';
      return '<tr><td><span class="name">' + esc(p.name) + '</span> <span class="sub2">' + esc(p.slug) + '</span></td>' +
        '<td>' + esc(p.category || '—') + '</td>' +
        '<td class="num">' + fmtUsd(p.tvl_usd) + '</td>' +
        '<td class="num">' + (p.mcap_usd == null ? '—' : fmtUsd(p.mcap_usd)) + '</td>' +
        '<td class="num">' + mult + '</td></tr>';
    }).join('');
    return '<h2 class="sec">Already trading — the peer set</h2>' +
      '<p class="note">These protocols already have a token, so they are never ranked. Their market caps price the board: each category&rsquo;s peer multiple is the median market-cap/TVL of its tokened protocols.</p>' +
      '<table><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Mcap / TVL</th></tr></thead><tbody>' + body + '</tbody></table>';
  }

  function renderBoard() {
    var rows = filteredRows();
    app.innerHTML = statsHtml() + methodHtml() + controlsHtml() + boardHtml(rows) + liveHtml();
    bindControls();
    var tb = app.querySelector('tbody');
    tb.addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-slug]');
      if (tr) location.hash = '#/p/' + tr.getAttribute('data-slug');
    });
  }

  function bindControls() {
    var q = document.getElementById('q');
    q.addEventListener('input', function () { state.q = q.value; renderBoardKeepFocus(); });
    document.querySelectorAll('.pill').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = b.getAttribute('data-tier');
        location.hash = t === 'All' ? '#/' : '#/risk/' + t;
      });
    });
    document.getElementById('cat').addEventListener('change', function (e) { state.cat = e.target.value; renderBoard(); });
    document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; renderBoard(); });
    document.getElementById('wl').addEventListener('change', function (e) { state.watchlist = e.target.checked; renderBoard(); });
  }

  function renderBoardKeepFocus() {
    var pos = document.getElementById('q').selectionStart;
    renderBoard();
    var q = document.getElementById('q');
    q.focus();
    q.setSelectionRange(pos, pos);
  }

  function renderDetail(slug) {
    var r = null;
    D.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) {
      app.innerHTML = '<div class="detail"><span class="back" id="back">← Back to the board</span><p class="empty">No protocol with that slug is on the board.</p></div>';
      document.getElementById('back').addEventListener('click', function () { location.hash = '#/'; });
      return;
    }
    var color = TIER_COLOR[r.rug_tier];
    var base = Math.round(r.tvl_usd * r.peer_multiple);
    var preDiscount = Math.round(base * r.growth_multiplier * r.maturity_multiplier);
    var haircut = preDiscount - r.implied_value_usd;
    var sigRows = r.rug_signals.map(function (s) {
      var w = Math.round((s.points / s.max) * 100);
      return '<div class="sigrow"><span>' + esc(s.label) + '</span><span class="bar"><i style="width:' + w + '%;background:' + (s.points === 0 ? '#34d399' : s.points >= s.max * 0.6 ? '#f87171' : '#fbbf24') + '"></i></span><span class="pts">' + s.points + ' / ' + s.max + '</span><span class="read">' + esc(s.reading) + '</span></div>';
    }).join('');
    var steps = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    app.innerHTML = '<div class="detail">' +
      '<span class="back" id="back">← Back to the board</span>' +
      '<div class="dhead"><div><h2>' + esc(r.name) + '</h2><p class="note">' + esc(r.slug) + ' · ' + esc(r.category || 'No category') + ' · ' + esc(fmtChains(r.chains)) + ' · rank #' + r.rank + (r.on_watchlist ? ' · <span class="badge watch">Watchlist</span>' : '') + '</p></div>' +
      '<div class="gauge"><b style="color:' + color + '">' + r.rug_score + '</b><div>' + tierBadge(r.rug_tier) + ' rug risk</div></div></div>' +
      '<div class="dgrid"><div><h3>Rug breakdown</h3>' + sigRows + '</div>' +
      '<div><h3>Implied value</h3><p class="math">TVL <b>' + fmtUsd(r.tvl_usd) + '</b> × peer multiple <b>' + r.peer_multiple.toFixed(2) + '</b> = base <b>' + fmtUsd(base) + '</b><br>' +
      '× growth <b>' + r.growth_multiplier.toFixed(2) + '</b> × maturity <b>' + r.maturity_multiplier.toFixed(2) + '</b> = <b>' + fmtUsd(preDiscount) + '</b><br>' +
      '− rug haircut <b>' + Math.round(r.risk_discount * 100) + '%</b> (' + fmtUsd(haircut) + ') = <b>$' + fmtInt(r.implied_value_usd) + '</b></p>' +
      '<dl class="kv"><dt>TVL</dt><dd>' + fmtUsd(r.tvl_usd) + '</dd><dt>7-day change</dt><dd>' + (r.change_7d == null ? 'not reported' : fmtPct(r.change_7d)) + '</dd><dt>Listed</dt><dd>' + esc(r.listed_at || 'not reported') + ' (' + fmtAge(r.age_days) + ' old)</dd><dt>Token</dt><dd>records no token</dd></dl>' +
      '</div></div>' +
      '<h3 style="margin-top:18px">Farm plan — ' + esc(r.rug_tier) + ' tier</h3><ol class="steps">' + steps + '</ol>' +
      '</div>';
    document.getElementById('back').addEventListener('click', function () { location.hash = '#/'; });
  }

  function route() {
    var h = location.hash || '#/';
    if (h.indexOf('#/p/') === 0) { renderDetail(decodeURIComponent(h.slice(4))); return; }
    if (h.indexOf('#/risk/') === 0) {
      var t = decodeURIComponent(h.slice(7));
      state.tier = TIERS.indexOf(t) >= 0 ? t : 'All';
      renderBoard();
      return;
    }
    state.tier = 'All';
    renderBoard();
  }

  window.addEventListener('hashchange', route);
  route();
})();
