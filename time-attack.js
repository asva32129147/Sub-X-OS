// time-attack.js — Time Attack Tracker
// Goal: solve under a target time X, Y times in a row (or Y out of last Z)
// Tracks streaks, best runs, and history per goal
// Reads from the active session — no extra storage needed
// Depends on: utils.js, storage.js

'use strict';

const TimeAttack = (() => {
  let goals     = [];   // [{id, target, mode, count, label}]
  let activeGoal= null;

  const MODES = {
    streak:  'Y in a row',
    window:  'Y out of last Z',
    session: 'Y in this session',
  };

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    goals = _loadGoals();
  }

  function show() {
    render();
  }

  // ── Render main ───────────────────────────────────────────────────────────
  function render() {
    const el = document.getElementById('ta-content');
    if (!el) return;

    const sessionId = Storage.getCurrentSessionId();
    const times     = Storage.getEffectiveTimes(sessionId).filter(t => t > 0);
    const meta      = Storage.getCurrentSession();

    el.innerHTML = `
      <div class="ta-header">
        <span class="ta-title">⚡ Time Attack</span>
        <span class="ta-session">${meta?.name || 'Session'} · ${times.length} solves</span>
      </div>

      ${!times.length ? '<div class="ta-empty">Do some solves first, then come back here to track your goals.</div>' : ''}

      <!-- Goal cards -->
      <div class="ta-goals" id="ta-goals">
        ${goals.map(g => _renderGoalCard(g, times)).join('')}
      </div>

      <!-- Add goal -->
      <div class="ta-add-section">
        <div class="ta-add-title">Add Goal</div>
        <div class="ta-add-row">
          <div class="ta-field">
            <label>Target time</label>
            <div style="display:flex;gap:4px;align-items:center">
              <input type="number" id="ta-target" placeholder="13.50" step="0.01" min="0" class="ta-input" style="width:80px">
              <span style="font-size:11px;color:var(--text3)">seconds</span>
            </div>
          </div>
          <div class="ta-field">
            <label>Mode</label>
            <select id="ta-mode" class="ta-select">
              <option value="streak">Streak — Y in a row</option>
              <option value="window">Window — Y out of last Z</option>
              <option value="session">Session — Y total</option>
            </select>
          </div>
          <div class="ta-field">
            <label>Goal count (Y)</label>
            <input type="number" id="ta-count" placeholder="5" min="1" max="100" class="ta-input" style="width:70px">
          </div>
          <div class="ta-field" id="ta-window-field" style="display:none">
            <label>Window size (Z)</label>
            <input type="number" id="ta-window" placeholder="12" min="1" max="200" class="ta-input" style="width:70px">
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <input type="text" id="ta-label" placeholder="Goal name (optional)" class="ta-input" style="flex:1">
          <button class="btn-primary" onclick="TimeAttack.addGoal()">Add Goal</button>
        </div>
      </div>

      <!-- History -->
      ${goals.length ? `
      <div class="ta-history-section">
        <div class="ta-add-title">Session Progress</div>
        ${_renderProgressChart(times)}
      </div>` : ''}
    `;

    // Show/hide window field
    document.getElementById('ta-mode')?.addEventListener('change', function() {
      document.getElementById('ta-window-field').style.display =
        this.value === 'window' ? 'flex' : 'none';
    });
  }

  function _renderGoalCard(goal, times) {
    const result = _evaluate(goal, times);
    const pct    = Math.min(100, Math.round(result.current / goal.count * 100));
    const done   = result.current >= goal.count;
    const col    = done ? 'var(--green)' : pct >= 60 ? 'var(--accent)' : 'var(--text2)';

    return `
      <div class="ta-goal-card ${done ? 'done' : ''}">
        <div class="ta-goal-top">
          <div>
            <div class="ta-goal-name">${goal.label || ('Sub-' + formatTime(goal.target * 100))}</div>
            <div class="ta-goal-mode">
              ${MODES[goal.mode] || goal.mode} · target: ${goal.count}
              ${goal.mode === 'window' ? ` / ${goal.window}` : ''}
            </div>
          </div>
          <div class="ta-goal-status" style="color:${col}">
            ${done ? '✓ DONE' : `${result.current}/${goal.count}`}
          </div>
        </div>
        <div class="ta-bar">
          <div class="ta-bar-fill" style="width:${pct}%;background:${col}"></div>
        </div>
        <div class="ta-goal-detail">
          Best streak: ${result.bestStreak} · Qualifying solves: ${result.qualifying} / ${times.length}
          ${result.remaining > 0 ? ` · Need ${result.remaining} more` : ''}
        </div>
        <button class="ta-del-btn" onclick="TimeAttack.removeGoal('${goal.id}')">✕</button>
      </div>`;
  }

  function _renderProgressChart(times) {
    // Mini sparkline: show last 50 solves, colour by each goal's target
    if (!times.length || !goals.length) return '';
    const last = times.slice(-50);
    const dots = last.map((t, i) => {
      const col = goals.length === 1
        ? (t <= goals[0].target * 100 ? 'var(--green)' : 'var(--red)')
        : 'var(--accent)';
      const h = Math.max(4, Math.min(40, 40 - (t / (Math.max(...last) || 1)) * 36));
      return `<div class="ta-spark-bar" style="height:${h}px;background:${col}" title="${formatTime(t)}"></div>`;
    }).join('');
    return `
      <div class="ta-spark">
        <div class="ta-spark-bars">${dots}</div>
        <div class="ta-spark-label">Last ${last.length} solves</div>
        ${goals.map(g => `
          <div class="ta-spark-line" style="bottom:${Math.max(4, Math.min(40,40-(g.target*100/(Math.max(...last)||1))*36))}px"
            title="Sub-${formatTime(g.target*100)}"></div>`).join('')}
      </div>`;
  }

  // ── Evaluation ────────────────────────────────────────────────────────────
  function _evaluate(goal, times) {
    const target = goal.target * 100; // convert seconds → centiseconds
    const qualifies = t => t > 0 && t <= target;
    const qualifying = times.filter(qualifies).length;

    let current = 0, bestStreak = 0, remaining = 0;

    if (goal.mode === 'streak') {
      // Current streak of consecutive qualifying solves from the end
      let streak = 0;
      for (let i = times.length - 1; i >= 0; i--) {
        if (qualifies(times[i])) streak++;
        else break;
      }
      current = streak;
      // Best streak ever
      let run = 0;
      for (const t of times) {
        if (qualifies(t)) { run++; bestStreak = Math.max(bestStreak, run); }
        else run = 0;
      }
      remaining = Math.max(0, goal.count - current);

    } else if (goal.mode === 'window') {
      const w = goal.window || 12;
      const window = times.slice(-w);
      current = window.filter(qualifies).length;
      bestStreak = current; // not really a streak concept
      remaining = Math.max(0, goal.count - current);

    } else { // session
      current = qualifying;
      bestStreak = current;
      remaining = Math.max(0, goal.count - current);
    }

    return { current, bestStreak, qualifying, remaining };
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  function addGoal() {
    const target = parseFloat(document.getElementById('ta-target')?.value);
    const mode   = document.getElementById('ta-mode')?.value || 'streak';
    const count  = parseInt(document.getElementById('ta-count')?.value) || 5;
    const window = parseInt(document.getElementById('ta-window')?.value) || 12;
    const label  = document.getElementById('ta-label')?.value?.trim() || '';

    if (!target || target <= 0) { alert('Enter a valid target time.'); return; }
    if (!count  || count  <= 0) { alert('Enter a valid goal count.'); return; }

    goals.push({ id: uid(), target, mode, count, window, label });
    _saveGoals();
    render();
  }

  function removeGoal(id) {
    goals = goals.filter(g => g.id !== id);
    _saveGoals();
    render();
  }

  // ── Persistence ───────────────────────────────────────────────────────────
  function _loadGoals() {
    try { return JSON.parse(localStorage.getItem('subx_time_attack_goals') || '[]'); }
    catch { return []; }
  }
  function _saveGoals() {
    try { localStorage.setItem('subx_time_attack_goals', JSON.stringify(goals)); }
    catch {}
  }

  return { init, show, render, addGoal, removeGoal };
})();
