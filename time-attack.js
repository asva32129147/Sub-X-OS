// time-attack.js — Time Attack Tracker (clean rewrite)
'use strict';

(function() {
  var goals = [];

  function init() {
    goals = _load();
  }

  function show() {
    var el = document.getElementById('ta-content');
    if (!el) return;
    try { render(); } catch(e) {
      el.innerHTML = '<div style="padding:20px;color:var(--red)">Error: ' + e.message + ' <button class="btn-sm" onclick="window.TimeAttack.show()">Retry</button></div>';
    }
  }

  function render() {
    var el = document.getElementById('ta-content');
    if (!el) return;

    var sessionId = Storage.getCurrentSessionId();
    var solves    = Storage.getSolves(sessionId) || [];
    var times     = solves.map(function(s) {
      if (s.penalty === 'DNF') return -1;
      return s.penalty === '+2' ? s.time + 200 : s.time;
    }).filter(function(t) { return t > 0; });
    var meta = Storage.getCurrentSession();

    var html = '<div class="ta-header">'
      + '<span class="ta-title">Time Attack</span>'
      + '<span class="ta-session">' + (meta ? meta.name : 'Session') + ' &middot; ' + times.length + ' solves</span>'
      + '</div>';

    if (!times.length) {
      html += '<div class="ta-empty">Do some solves first, then set a goal below.</div>';
    }

    // Render goal cards
    if (goals.length) {
      html += '<div class="ta-goals">';
      goals.forEach(function(g, idx) {
        var res  = _evaluate(g, times);
        var pct  = g.count > 0 ? Math.min(100, Math.round(res.current / g.count * 100)) : 0;
        var done = res.current >= g.count;
        var col  = done ? 'var(--green)' : pct >= 60 ? 'var(--accent)' : 'var(--text2)';
        html += '<div class="ta-goal-card' + (done ? ' done' : '') + '">'
          + '<div class="ta-goal-top"><div>'
          + '<div class="ta-goal-name">' + _esc(g.label || ('Sub-' + g.target.toFixed(2) + 's')) + '</div>'
          + '<div class="ta-goal-mode">' + _modeText(g) + '</div>'
          + '</div>'
          + '<div class="ta-goal-status" style="color:' + col + '">'
          + (done ? '&#10003; DONE' : res.current + '/' + g.count) + '</div></div>'
          + '<div class="ta-bar"><div class="ta-bar-fill" style="width:' + pct + '%;background:' + col + '"></div></div>'
          + '<div class="ta-goal-detail">Best streak: ' + res.bestStreak
          + ' &middot; ' + res.qualifying + ' qualify'
          + (res.remaining > 0 ? ' &middot; Need ' + res.remaining + ' more' : '') + '</div>'
          + '<button class="ta-del-btn" onclick="window.TimeAttack.removeGoal(' + idx + ')">&#10005;</button>'
          + '</div>';
      });
      html += '</div>';
    }

    // Add goal form
    html += '<div class="ta-add-section"><div class="ta-add-title">Add Goal</div>'
      + '<div class="ta-add-row">'
      + '<div class="ta-field"><label>Target (sec)</label>'
      + '<input type="number" id="ta-target" placeholder="13.50" step="0.01" min="0" class="ta-input" style="width:80px"></div>'
      + '<div class="ta-field"><label>Mode</label>'
      + '<select id="ta-mode" class="ta-select" onchange="window.TimeAttack.toggleWindow(this)">'
      + '<option value="streak">Streak (Y in a row)</option>'
      + '<option value="window">Window (Y of last Z)</option>'
      + '<option value="session">Session (Y total)</option>'
      + '</select></div>'
      + '<div class="ta-field"><label>Goal (Y)</label>'
      + '<input type="number" id="ta-count" placeholder="5" min="1" class="ta-input" style="width:70px"></div>'
      + '<div class="ta-field" id="ta-win-wrap" style="display:none"><label>Window (Z)</label>'
      + '<input type="number" id="ta-window" placeholder="12" min="1" class="ta-input" style="width:70px"></div>'
      + '</div>'
      + '<div style="display:flex;gap:6px;margin-top:8px">'
      + '<input type="text" id="ta-label" placeholder="Name (optional)" class="ta-input" style="flex:1">'
      + '<button class="btn-primary" onclick="window.TimeAttack.addGoal()">Add</button>'
      + '</div></div>';

    // Sparkline
    if (times.length > 1) {
      html += '<div class="ta-history-section"><div class="ta-add-title">Last ' + Math.min(times.length, 50) + ' solves</div>'
        + _sparkline(times, goals) + '</div>';
    }

    el.innerHTML = html;
  }

  function toggleWindow(sel) {
    var w = document.getElementById('ta-win-wrap');
    if (w) w.style.display = sel.value === 'window' ? 'flex' : 'none';
  }

  function addGoal() {
    var target = parseFloat(document.getElementById('ta-target').value);
    var mode   = document.getElementById('ta-mode').value;
    var count  = parseInt(document.getElementById('ta-count').value) || 5;
    var win    = parseInt((document.getElementById('ta-window') || {}).value) || 12;
    var label  = (document.getElementById('ta-label').value || '').trim();
    if (!target || target <= 0) { alert('Enter a target time in seconds (e.g. 13.50).'); return; }
    goals.push({ target:target, mode:mode, count:count, window:win, label:label });
    _save(); render();
  }

  function removeGoal(idx) {
    goals.splice(idx, 1);
    _save(); render();
  }

  function _evaluate(g, times) {
    var tgt = g.target * 100;
    var q   = function(t) { return t > 0 && t <= tgt; };
    var qualifying = 0, current = 0, bestStreak = 0, remaining = 0;

    if (g.mode === 'streak') {
      var run = 0;
      for (var i = 0; i < times.length; i++) {
        if (q(times[i])) { run++; if (run > bestStreak) bestStreak = run; qualifying++; }
        else run = 0;
      }
      // Current = streak from the end
      current = 0;
      for (var j = times.length - 1; j >= 0; j--) {
        if (q(times[j])) current++; else break;
      }
      remaining = Math.max(0, g.count - current);
    } else if (g.mode === 'window') {
      var w = times.slice(-(g.window || 12));
      qualifying = times.filter(q).length;
      current    = w.filter(q).length;
      bestStreak = current;
      remaining  = Math.max(0, g.count - current);
    } else {
      qualifying = current = times.filter(q).length;
      bestStreak = current;
      remaining  = Math.max(0, g.count - current);
    }
    return { current:current, bestStreak:bestStreak, qualifying:qualifying, remaining:remaining };
  }

  function _modeText(g) {
    if (g.mode === 'streak')  return 'Streak: ' + g.count + ' in a row';
    if (g.mode === 'window')  return 'Window: ' + g.count + ' of last ' + g.window;
    return 'Session: ' + g.count + ' total';
  }

  function _sparkline(times, goals) {
    var last = times.slice(-50);
    var max  = Math.max.apply(null, last) || 1;
    var html = '<div class="ta-spark"><div class="ta-spark-bars">';
    last.forEach(function(t) {
      var h   = Math.max(4, Math.min(40, Math.round(40 - (t / max) * 36)));
      var col = (goals.length && t <= goals[0].target * 100) ? 'var(--green)' : 'var(--red)';
      html += '<div class="ta-spark-bar" style="height:' + h + 'px;background:' + col + '"></div>';
    });
    html += '</div></div>';
    return html;
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function _load()  { try { return JSON.parse(localStorage.getItem('subx_ta_goals')||'[]'); } catch(e) { return []; } }
  function _save()  { try { localStorage.setItem('subx_ta_goals', JSON.stringify(goals)); } catch(e) {} }

  window.TimeAttack = { init:init, show:show, render:render, addGoal:addGoal, removeGoal:removeGoal, toggleWindow:toggleWindow };
})();
