// time-attack.js — Algorithm Time Attack
// Run ALL algorithms in a set consecutively without stopping.
// Timer runs the whole time. Space/tap marks each algorithm done (records split).
// Tracks total time, per-alg splits, personal bests, and run history.
// Exposes window.TimeAttack
'use strict';

(function () {

  var sets       = {};
  var activeKey  = '';
  var activeSet  = null;
  var order      = [];      // custom order: array of case indices
  var runIdx     = 0;       // which alg we're currently on
  var splits     = [];      // [ms, ms, ...] one per alg, elapsed from run start
  var totalStart = 0;       // performance.now() when run started
  var running    = false;
  var rafId      = null;
  var history    = {};      // { setKey: [ {splits:[...], total:ms, date:timestamp}, ... ] }

  // ── Init ────────────────────────────────────────────────────────────────────
  function init() {
    _loadHistory();
    document.addEventListener('keydown', function (e) {
      var view = document.getElementById('view-timeattack');
      if (!view || !view.classList.contains('active')) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space')  { e.preventDefault(); markAlg(); }
      if (e.code === 'Escape') { cancelRun(); }
    });
  }

  // ── show ────────────────────────────────────────────────────────────────────
  function show() {
    var el = document.getElementById('ta-content');
    if (!el) return;
    try { sets = typeof getAllSets === 'function' ? getAllSets() : {}; } catch (e) { sets = {}; }
    if (!activeSet || !running) { renderSetPicker(el); }
  }

  // ── Set picker ──────────────────────────────────────────────────────────────
  function renderSetPicker(el) {
    var html = '<div class="ta-header">'
      + '<span class="ta-title">Algorithm Time Attack</span>'
      + '<div class="ta-subtitle">Run every algorithm in a set consecutively. '
      + 'Space marks each one done. Timer runs the whole time.</div></div>'
      + '<div class="ta-set-list">';

    Object.keys(sets).forEach(function (key) {
      var s = sets[key];
      if (!s.cases || !s.cases.length) return;
      var runs  = history[key] || [];
      var pb    = runs.length ? Math.min.apply(null, runs.map(function (r) { return r.total; })) : null;
      html += '<div class="ta-set-card" onclick="window.TimeAttack.selectSet(\'' + key + '\')">'
        + '<div class="ta-set-name">' + _esc(s.name || key) + '</div>'
        + '<div class="ta-set-info">' + s.cases.length + ' algorithms'
        + (pb ? ' &middot; PB: ' + _fmt(pb) : ' &middot; No runs yet')
        + (runs.length ? ' &middot; ' + runs.length + ' runs' : '')
        + '</div></div>';
    });
    html += '</div>';
    el.innerHTML = html;
  }

  // ── Select set → show pre-run screen ───────────────────────────────────────
  function selectSet(key) {
    activeKey = key;
    activeSet = sets[key];
    order     = activeSet.cases.map(function (_, i) { return i; });
    renderPreRun(document.getElementById('ta-content'));
  }

  function renderPreRun(el) {
    if (!el) return;
    var runs = history[activeKey] || [];
    var pb   = runs.length ? Math.min.apply(null, runs.map(function (r) { return r.total; })) : null;
    var html = '<div class="ta-header">'
      + '<button class="btn-sm" onclick="window.TimeAttack.exitRun()">&#8592; Sets</button>'
      + '<span class="ta-title">' + _esc(activeSet.name) + ' Time Attack</span>'
      + '</div>'
      + '<div class="ta-prerun-info">'
      + '<div class="ta-stat-big"><span>' + activeSet.cases.length + '</span><label>algorithms</label></div>'
      + (pb ? '<div class="ta-stat-big"><span>' + _fmt(pb) + '</span><label>PB</label></div>' : '')
      + (runs.length ? '<div class="ta-stat-big"><span>' + runs.length + '</span><label>runs</label></div>' : '')
      + '</div>'
      + '<div class="ta-alg-order"><div class="ta-order-label">Order</div>'
      + '<div class="ta-order-chips">'
      + order.map(function (i) {
          return '<span class="ta-chip">' + _esc(activeSet.cases[i].id) + '</span>';
        }).join('')
      + '</div>'
      + '<button class="btn-sm" style="margin-top:6px" onclick="window.TimeAttack.shuffleOrder()">Shuffle order</button>'
      + '</div>'
      + '<div class="ta-hint">Press <kbd>Space</kbd> or tap to start</div>'
      + '<div class="ta-big-start" onclick="window.TimeAttack.startRun()">START</div>'
      + _renderRunHistory()
      + '</div>';
    el.innerHTML = html;
  }

  function _renderRunHistory() {
    var runs = (history[activeKey] || []).slice(-5).reverse();
    if (!runs.length) return '';
    var html = '<div class="ta-hist-section"><div class="ta-order-label">Recent runs</div>';
    runs.forEach(function (r, i) {
      var date = new Date(r.date).toLocaleDateString();
      html += '<div class="ta-hist-row">'
        + '<span class="ta-hist-n">#' + (runs.length - i) + '</span>'
        + '<span class="ta-hist-time">' + _fmt(r.total) + '</span>'
        + '<span class="ta-hist-date">' + date + '</span>'
        + '</div>';
    });
    html += '</div>';
    return html;
  }

  // ── Start run ───────────────────────────────────────────────────────────────
  function startRun() {
    running    = true;
    runIdx     = 0;
    splits     = [];
    totalStart = performance.now();
    renderRunView(document.getElementById('ta-content'));
    _tick();
  }

  function renderRunView(el) {
    if (!el) return;
    var c = activeSet.cases[order[runIdx]];
    var imgUrl = activeSet.imgFn ? activeSet.imgFn(c.alg) : (c.imageUrl || '');

    var html = '<div class="ta-run-top">'
      + '<span class="ta-run-pos">' + (runIdx + 1) + ' / ' + order.length + '</span>'
      + '<span class="ta-run-timer" id="ta-total-timer">0.00</span>'
      + '<button class="btn-sm" style="color:var(--red)" onclick="window.TimeAttack.cancelRun()">Cancel</button>'
      + '</div>'
      // Progress bar
      + '<div class="ta-prog-bar"><div class="ta-prog-fill" id="ta-prog" style="width:' + Math.round(runIdx / order.length * 100) + '%"></div></div>'
      // Current alg
      + '<div class="ta-run-case">'
      + (imgUrl ? '<img class="ta-case-img" src="' + imgUrl + '" alt="' + c.id + '" onerror="this.style.display=\'none\'">' : '')
      + '<div class="ta-run-info">'
      + '<div class="ta-case-id">' + _esc(c.id) + '</div>'
      + (c.group ? '<div class="ta-case-group">' + _esc(c.group) + '</div>' : '')
      + '<div class="ta-case-alg">' + _esc(c.alg || '') + '</div>'
      + (c.auf   ? '<div class="ta-case-auf">AUF: ' + _esc(c.auf) + '</div>' : '')
      + '</div></div>'
      // Next alg preview
      + (runIdx + 1 < order.length ? '<div class="ta-next-preview">Up next: <strong>'
          + _esc(activeSet.cases[order[runIdx + 1]].id) + '</strong></div>' : '')
      // Splits so far
      + '<div class="ta-splits-live" id="ta-splits-live">' + _buildSplitsHTML() + '</div>'
      // Tap area
      + '<div class="ta-tap-hint">Space / tap when done &rarr; starts next alg</div>'
      + '<div class="ta-big-tap" id="ta-tap-area" onclick="window.TimeAttack.markAlg()">'
      + (runIdx === order.length - 1 ? 'FINISH' : 'NEXT') + '</div>';

    el.innerHTML = html;
  }

  function _buildSplitsHTML() {
    if (!splits.length) return '';
    var html = '<div class="ta-splits-header">Splits</div>';
    splits.forEach(function (elapsed, i) {
      var split = i === 0 ? elapsed : elapsed - splits[i - 1];
      html += '<div class="ta-split-row">'
        + '<span class="ta-split-id">' + _esc(activeSet.cases[order[i]].id) + '</span>'
        + '<span class="ta-split-t">' + _fmt(split) + '</span>'
        + '<span class="ta-split-cum">' + _fmt(elapsed) + '</span>'
        + '</div>';
    });
    return html;
  }

  // ── Mark algorithm done ─────────────────────────────────────────────────────
  function markAlg() {
    if (!running) { startRun(); return; }
    var elapsed = Math.round(performance.now() - totalStart);
    splits.push(elapsed);

    if (runIdx >= order.length - 1) {
      finishRun(elapsed);
    } else {
      runIdx++;
      renderRunView(document.getElementById('ta-content'));
    }
  }

  // ── Finish run ──────────────────────────────────────────────────────────────
  function finishRun(total) {
    running = false;
    cancelAnimationFrame(rafId);

    var run = { splits: splits.slice(), total: total, date: Date.now() };
    if (!history[activeKey]) history[activeKey] = [];
    history[activeKey].push(run);
    if (history[activeKey].length > 50) history[activeKey] = history[activeKey].slice(-50);
    _saveHistory();

    renderResults(document.getElementById('ta-content'), run);
  }

  function renderResults(el, run) {
    if (!el) return;
    var allRuns = history[activeKey] || [];
    var pb      = Math.min.apply(null, allRuns.map(function (r) { return r.total; }));
    var isPB    = run.total === pb;

    var html = '<div class="ta-header">'
      + (isPB ? '<div class="ta-pb-badge">NEW PB!</div>' : '')
      + '<span class="ta-title">' + _esc(activeSet.name) + ' Time Attack</span>'
      + '</div>'
      + '<div class="ta-result-total' + (isPB ? ' is-pb' : '') + '">'
      + _fmt(run.total)
      + '</div>'
      + '<div class="ta-stats-row">'
      + '<div class="ta-stat"><span>PB</span><strong>' + _fmt(pb) + '</strong></div>'
      + '<div class="ta-stat"><span>Runs</span><strong>' + allRuns.length + '</strong></div>'
      + '<div class="ta-stat"><span>Avg</span><strong>' + _fmt(Math.round(allRuns.reduce(function(a,r){return a+r.total;},0)/allRuns.length)) + '</strong></div>'
      + '</div>'
      // Per-alg splits
      + '<div class="ta-splits-section"><div class="ta-order-label">Splits</div>'
      + '<div class="ta-splits-table">';

    run.splits.forEach(function (elapsed, i) {
      var split = i === 0 ? elapsed : elapsed - run.splits[i - 1];
      var c     = activeSet.cases[order[i]];
      // Compare to PB splits if available
      var pbRun = allRuns.reduce(function(best, r) { return r.total < (best ? best.total : Infinity) ? r : best; }, null);
      var pbSplit = pbRun && pbRun.splits[i]
        ? (i === 0 ? pbRun.splits[i] : pbRun.splits[i] - pbRun.splits[i-1]) : null;
      var diff = pbSplit ? split - pbSplit : null;
      html += '<div class="ta-split-row">'
        + '<span class="ta-split-n">' + (i+1) + '</span>'
        + '<span class="ta-split-id">' + _esc(c.id) + '</span>'
        + '<span class="ta-split-t">' + _fmt(split) + '</span>'
        + '<span class="ta-split-cum">' + _fmt(elapsed) + '</span>'
        + (diff !== null ? '<span class="ta-split-diff ' + (diff <= 0 ? 'faster' : 'slower') + '">'
            + (diff > 0 ? '+' : '') + _fmt(Math.abs(diff)) + '</span>' : '')
        + '</div>';
    });

    html += '</div></div>'
      + '<div class="ta-nav-btns">'
      + '<button class="btn-primary" onclick="window.TimeAttack.startRun()">Run Again</button>'
      + '<button class="btn-sm" onclick="window.TimeAttack.renderPreRun(document.getElementById(\'ta-content\'))">Change Order</button>'
      + '<button class="btn-sm" onclick="window.TimeAttack.exitRun()">&#8592; Sets</button>'
      + '</div>';
    el.innerHTML = html;
  }

  // ── Cancel ──────────────────────────────────────────────────────────────────
  function cancelRun() {
    running = false;
    cancelAnimationFrame(rafId);
    renderPreRun(document.getElementById('ta-content'));
  }

  // ── Order ────────────────────────────────────────────────────────────────────
  function shuffleOrder() {
    for (var i = order.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = order[i]; order[i] = order[j]; order[j] = t;
    }
    renderPreRun(document.getElementById('ta-content'));
  }

  function exitRun() {
    running   = false;
    activeSet = null;
    activeKey = '';
    cancelAnimationFrame(rafId);
    show();
  }

  // ── Tick ────────────────────────────────────────────────────────────────────
  function _tick() {
    if (!running) return;
    var elapsed = Math.round(performance.now() - totalStart);
    var el = document.getElementById('ta-total-timer');
    if (el) el.textContent = _fmt(elapsed);
    rafId = requestAnimationFrame(_tick);
  }

  // ── Persistence ──────────────────────────────────────────────────────────────
  function _saveHistory() {
    try { localStorage.setItem('subx_ta_history', JSON.stringify(history)); } catch(e) {}
  }
  function _loadHistory() {
    try { history = JSON.parse(localStorage.getItem('subx_ta_history') || '{}'); }
    catch(e) { history = {}; }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function _fmt(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return '—';
    var s = ms / 1000;
    if (s < 60) return s.toFixed(2) + 's';
    return Math.floor(s / 60) + ':' + (s % 60).toFixed(2).padStart(5, '0');
  }
  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  window.TimeAttack = {
    init: init, show: show,
    selectSet: selectSet, exitRun: exitRun,
    startRun: startRun, markAlg: markAlg, cancelRun: cancelRun,
    shuffleOrder: shuffleOrder, renderPreRun: renderPreRun,
  };

})();
