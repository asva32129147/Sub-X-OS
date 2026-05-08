// sessions.js — session management UI + solve list rendering
// Depends on: utils.js, storage.js, stats.js (for refresh after changes)

'use strict';

const Sessions = (() => {
  let currentSessionId = null;

  // ─── Init ──────────────────────────────────────────────────────────────────
  function init() {
    currentSessionId = Storage.getCurrentSessionId();
    renderSessionSelector();
    renderSolveList();
    bindNewSessionBtn();
  }

  function refresh() {
    currentSessionId = Storage.getCurrentSessionId();
    renderSessionSelector();
    renderSolveList();
  }

  // ─── Session selector ─────────────────────────────────────────────────────
  function renderSessionSelector() {
    const el = document.getElementById('session-selector');
    if (!el) return;

    const sessions = Storage.getSessionList();
    const cur = Storage.getCurrentSessionId();

    el.innerHTML = '';
    sessions.forEach(meta => {
      const count = Storage.getSolves(meta.id).length;
      const opt = document.createElement('option');
      opt.value = meta.id;
      opt.textContent = `${meta.name} (${count})`;
      opt.selected = meta.id === cur;
      el.appendChild(opt);
    });

    el.onchange = () => {
      Storage.setCurrentSession(el.value);
      currentSessionId = el.value;
      if (typeof App !== 'undefined') App.onSessionSwitch();
    };
  }

  function bindNewSessionBtn() {
    const btn = document.getElementById('btn-new-session');
    if (btn) btn.onclick = () => promptNewSession();

    const renBtn = document.getElementById('btn-rename-session');
    if (renBtn) renBtn.onclick = () => promptRenameSession();

    const delBtn = document.getElementById('btn-delete-session');
    if (delBtn) delBtn.onclick = () => confirmDeleteSession();
  }

  function promptNewSession() {
    const name = prompt('Session name:', `Session ${Storage.getSessionList().length + 1}`);
    if (!name) return;
    const meta = Storage.createSession(name.trim(), getCurrentEvent());
    Storage.setCurrentSession(meta.id);
    refresh();
    if (typeof App !== 'undefined') App.onSessionSwitch();
  }

  function promptRenameSession() {
    const meta = Storage.getCurrentSession();
    if (!meta) return;
    const name = prompt('Rename session:', meta.name);
    if (!name || name === meta.name) return;
    Storage.renameSession(meta.id, name.trim());
    refresh();
  }

  function confirmDeleteSession() {
    const meta = Storage.getCurrentSession();
    if (!meta) return;
    const solveCount = Storage.getSolves(meta.id).length;
    if (!confirm(`Delete "${meta.name}"? (${solveCount} solves will be lost)`)) return;
    Storage.deleteSession(meta.id);
    refresh();
    if (typeof App !== 'undefined') App.onSessionSwitch();
  }

  function getCurrentEvent() {
    const meta = Storage.getCurrentSession();
    return meta?.event || '333';
  }

  // ─── Solve list ───────────────────────────────────────────────────────────
  function renderSolveList() {
    const el = document.getElementById('solve-list');
    if (!el) return;

    const sessionId = Storage.getCurrentSessionId();
    const solves = Storage.getSolves(sessionId);

    if (!solves.length) {
      el.innerHTML = '<div class="solve-empty">No solves yet</div>';
      return;
    }

    const times = Storage.getEffectiveTimes(sessionId);
    const rows = [];

    // Render in reverse (newest first)
    for (let i = solves.length - 1; i >= 0; i--) {
      const s = solves[i];
      const n = i + 1;
      const effective = times[i];
      const isPersonalBest = isPB(times, i);

      rows.push(buildSolveRow(s, n, effective, isPersonalBest, sessionId));
    }

    el.innerHTML = rows.join('');

    // Bind penalty and delete buttons
    el.querySelectorAll('.pen-btn').forEach(btn => {
      btn.onclick = () => {
        const { solveId, pen } = btn.dataset;
        const current = Storage.getSolves(sessionId).find(s => s.id === solveId)?.penalty || '';
        // Toggle: clicking same penalty removes it
        const next = current === pen ? '' : pen;
        Storage.setPenalty(sessionId, solveId, next);
        renderSolveList();
        if (typeof Stats !== 'undefined') Stats.refresh();
      };
    });

    el.querySelectorAll('.del-btn').forEach(btn => {
      btn.onclick = () => {
        if (!confirm('Delete this solve?')) return;
        Storage.deleteSolve(sessionId, btn.dataset.solveId);
        renderSolveList();
        if (typeof Stats !== 'undefined') Stats.refresh();
      };
    });

    el.querySelectorAll('.solve-scramble-toggle').forEach(btn => {
      btn.onclick = () => {
        const row = btn.closest('.solve-row');
        row?.classList.toggle('show-scramble');
      };
    });
  }

  function buildSolveRow(solve, n, effectiveCs, isPb, sessionId) {
    const pen = solve.penalty;
    const timeStr = effectiveCs === -1 ? 'DNF'
      : formatTime(effectiveCs) + (pen === '+2' ? '+' : '');

    const pbBadge = isPb ? '<span class="pb-badge">PB</span>' : '';

    const sessionId2 = Storage.getCurrentSessionId();
    return `
    <div class="solve-row${isPb ? ' is-pb' : ''}" data-id="${solve.id}">
      <div class="solve-num" onclick="SolveSummary.open('${sessionId2}','${solve.id}')" style="cursor:pointer">${n}</div>
      <div class="solve-time ${effectiveCs === -1 ? 'dnf' : ''}" onclick="SolveSummary.open('${sessionId2}','${solve.id}')" style="cursor:pointer">
        ${timeStr}${pbBadge}
      </div>
      <div class="solve-actions">
        <button class="pen-btn${pen === '+2' ? ' active' : ''}" data-solve-id="${solve.id}" data-pen="+2">+2</button>
        <button class="pen-btn${pen === 'DNF' ? ' active' : ''}" data-solve-id="${solve.id}" data-pen="DNF">DNF</button>
        <button class="solve-scramble-toggle" title="Show scramble">☰</button>
        <button class="del-btn" data-solve-id="${solve.id}" title="Delete">✕</button>
      </div>
      <div class="solve-scramble-text">${escapeHtml(solve.scramble || '')}</div>
    </div>`;
  }

  function isPB(times, idx) {
    if (times[idx] === -1 || times[idx] === undefined) return false;
    const t = times[idx];
    for (let i = 0; i < idx; i++) {
      if (times[i] !== -1 && times[i] <= t) return false;
    }
    return true;
  }

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ─── Add solve (called from App after timer stops) ────────────────────────
  function addSolve(time, penalty, scramble) {
    const sessionId = Storage.getCurrentSessionId();
    const solve = Storage.addSolve(sessionId, { time, penalty, scramble });
    // Push to cloud if logged in (runs in background, never blocks UI)
    if (typeof CloudSync !== 'undefined' && CloudSync.isLoggedIn()) {
      CloudSync.pushSolve(sessionId, solve).catch(e => console.warn('sync:', e));
    }
    renderSolveList();
    renderSessionSelector(); // update count
    return solve;
  }

  // ─── Import/Export UI ─────────────────────────────────────────────────────
  function exportCSTimer() {
    const json = Storage.exportCSTimer();
    downloadFile(json, 'subx_export.txt', 'application/json');
  }

  function importCSTimer(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const result = Storage.importCSTimer(e.target.result);
        alert(`Imported ${result.sessions} sessions and ${result.solves} solves.`);
        refresh();
        if (typeof App !== 'undefined') App.onSessionSwitch();
      } catch (err) {
        alert('Import failed: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  return { init, refresh, addSolve, exportCSTimer, importCSTimer, renderSolveList };
})();

// ── Alt+Z: delete last N solves ─────────────────────────────────────────────
document.addEventListener('keydown', function(e) {
  if (e.altKey && e.code === 'KeyZ') {
    e.preventDefault();
    const sessionId = Storage.getCurrentSessionId();
    const solves    = Storage.getSolves(sessionId);
    if (!solves.length) { alert('No solves to delete.'); return; }
    const raw = prompt(
      `Delete how many solves?\n(1 = last solve, 2 = last 2, etc.)\nSession has ${solves.length} solves.`,
      '1'
    );
    if (raw === null) return; // cancelled
    const n = parseInt(raw);
    if (!n || n < 1 || n > solves.length) {
      alert(`Enter a number between 1 and ${solves.length}.`);
      return;
    }
    if (!confirm(`Delete the last ${n} solve${n > 1 ? 's' : ''}?`)) return;
    // Remove last n solves
    const remaining = solves.slice(0, solves.length - n);
    // Write back via internal storage key
    try {
      localStorage.setItem('subx_solves_' + sessionId, JSON.stringify(remaining));
    } catch(err) {
      alert('Storage error: ' + err.message); return;
    }
    renderSolveList();
    if (typeof Stats !== 'undefined') Stats.refresh();
    if (typeof Sessions !== 'undefined') Sessions.refresh?.();
  }
});
