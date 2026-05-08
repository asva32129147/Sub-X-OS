// solve-summary.js — Solve Summary Modal
// Shows: time, scramble, date/time, reconstruction (smart cube moves), share, copy
// Triggered by clicking a solve row in the solve list
// Depends on: utils.js, storage.js

'use strict';

const SolveSummary = (() => {
  let currentSolve = null;
  let currentSessionId = null;

  // ── Open ──────────────────────────────────────────────────────────────────
  function open(sessionId, solveId) {
    currentSessionId = sessionId;
    const solves = Storage.getSolves(sessionId);
    const solve  = solves.find(s => s.id === solveId);
    if (!solve) return;
    currentSolve = solve;
    _renderModal(solve, sessionId);
    document.getElementById('solve-summary-overlay').classList.add('open');
  }

  function close() {
    document.getElementById('solve-summary-overlay')?.classList.remove('open');
    currentSolve = null;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function _renderModal(solve, sessionId) {
    const el = document.getElementById('solve-summary-content');
    if (!el) return;

    const session    = Storage.getSession(sessionId);
    const times      = Storage.getEffectiveTimes(sessionId);
    const solves     = Storage.getSolves(sessionId);
    const idx        = solves.findIndex(s => s.id === solve.id);
    const solveNum   = idx + 1;
    const effective  = solve.penalty === 'DNF' ? -1
                     : solve.penalty === '+2'  ? solve.time + 200
                     : solve.time;
    const timeStr    = formatTime(effective) + (solve.penalty === '+2' ? ' (+2)' : '');
    const dateStr    = new Date(solve.timestamp).toLocaleDateString(undefined, {
      weekday:'long', year:'numeric', month:'long', day:'numeric'
    });
    const timeOfDay  = new Date(solve.timestamp).toLocaleTimeString(undefined, {
      hour:'2-digit', minute:'2-digit', second:'2-digit'
    });

    // Stats context: what was Ao5/Ao12 at this point
    const sliceTimes = times.slice(0, idx + 1);
    const ao5  = sliceTimes.length >= 5  ? wcaAverage(sliceTimes, 5)  : null;
    const ao12 = sliceTimes.length >= 12 ? wcaAverage(sliceTimes, 12) : null;

    // Reconstruction moves (smart cube data if available)
    const moves = solve.moves || null;
    const recon = moves ? _renderReconstruction(moves, solve.scramble) : null;

    el.innerHTML = `
      <div class="ss-header">
        <div class="ss-solve-num">Solve #${solveNum}</div>
        <div class="ss-session">${session?.name || 'Session'}</div>
      </div>

      <!-- Main time display -->
      <div class="ss-time ${solve.penalty==='DNF'?'dnf':''}">${timeStr}</div>
      ${solve.penalty === 'DNF' ? '<div class="ss-penalty-badge dnf">DNF</div>' : ''}
      ${solve.penalty === '+2'  ? '<div class="ss-penalty-badge plus2">+2 (raw: '+formatTime(solve.time)+')</div>' : ''}

      <!-- Date / time -->
      <div class="ss-meta">
        <span>📅 ${dateStr}</span>
        <span>🕐 ${timeOfDay}</span>
      </div>

      <!-- Session context -->
      <div class="ss-context">
        ${ao5  !== null ? `<div class="ss-ctx-item"><span class="ss-ctx-label">Ao5 at this point</span><span class="ss-ctx-val">${ao5 === -1 ? 'DNF' : formatTime(ao5)}</span></div>` : ''}
        ${ao12 !== null ? `<div class="ss-ctx-item"><span class="ss-ctx-label">Ao12 at this point</span><span class="ss-ctx-val">${ao12 === -1 ? 'DNF' : formatTime(ao12)}</span></div>` : ''}
        <div class="ss-ctx-item"><span class="ss-ctx-label">Solve</span><span class="ss-ctx-val">${solveNum} / ${solves.length}</span></div>
      </div>

      <!-- Scramble -->
      <div class="ss-section">
        <div class="ss-section-label">Scramble</div>
        <div class="ss-scramble">${_escHtml(solve.scramble || '(no scramble)')}</div>
        <button class="ss-copy-btn" onclick="SolveSummary.copyScramble()">Copy scramble</button>
      </div>

      <!-- Comment -->
      <div class="ss-section">
        <div class="ss-section-label">Comment</div>
        <textarea class="ss-comment-input" id="ss-comment"
          placeholder="Add a note about this solve…"
          onchange="SolveSummary.saveComment(this.value)">${_escHtml(solve.comment || '')}</textarea>
      </div>

      ${recon ? `
      <!-- Reconstruction (smart cube) -->
      <div class="ss-section">
        <div class="ss-section-label">Reconstruction <span class="ss-badge">Smart Cube</span></div>
        <div class="ss-recon">${recon}</div>
        <button class="ss-copy-btn" onclick="SolveSummary.copyRecon()">Copy reconstruction</button>
      </div>` : ''}

      <!-- Actions -->
      <div class="ss-actions">
        <button class="ss-btn" onclick="SolveSummary.copyData()">📋 Copy data</button>
        <button class="ss-btn" onclick="SolveSummary.share()">🔗 Share</button>
        <button class="ss-btn danger" onclick="SolveSummary.deleteSolve()">🗑 Delete</button>
      </div>

      <!-- Penalty buttons -->
      <div class="ss-penalty-row">
        <span class="ss-pen-label">Penalty:</span>
        <button class="ss-pen-btn ${solve.penalty===''?'active':''}" onclick="SolveSummary.setPenalty('')">OK</button>
        <button class="ss-pen-btn ${solve.penalty==='+2'?'active':''}" onclick="SolveSummary.setPenalty('+2')">+2</button>
        <button class="ss-pen-btn ${solve.penalty==='DNF'?'active':''}" onclick="SolveSummary.setPenalty('DNF')">DNF</button>
      </div>`;
  }

  function _renderReconstruction(moves, scramble) {
    // moves: array of {move, time} objects from smart cube
    if (!Array.isArray(moves) || !moves.length) return null;
    const htm = moves.map((m, i) => {
      const t = m.time !== undefined ? `<span class="recon-time">${(m.time/100).toFixed(2)}s</span>` : '';
      return `<span class="recon-move">${m.move}${t}</span>`;
    }).join(' ');
    return `<div class="recon-moves">${htm}</div>`;
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  function copyScramble() {
    copyToClipboard(currentSolve?.scramble || '');
    _toast('Scramble copied!');
  }

  function copyRecon() {
    if (!currentSolve?.moves) return;
    const text = currentSolve.moves.map(m => m.move).join(' ');
    copyToClipboard(text);
    _toast('Reconstruction copied!');
  }

  function copyData() {
    if (!currentSolve) return;
    const eff = currentSolve.penalty === 'DNF' ? 'DNF'
              : currentSolve.penalty === '+2'  ? formatTime(currentSolve.time + 200) + '+'
              : formatTime(currentSolve.time);
    const text = [
      `Sub-X OS Solve Export`,
      `Time:     ${eff}`,
      `Date:     ${new Date(currentSolve.timestamp).toLocaleString()}`,
      `Scramble: ${currentSolve.scramble || '(none)'}`,
      currentSolve.comment ? `Comment:  ${currentSolve.comment}` : '',
      currentSolve.moves ? `Moves:    ${currentSolve.moves.map(m=>m.move).join(' ')}` : '',
    ].filter(Boolean).join('\n');
    copyToClipboard(text);
    _toast('Solve data copied!');
  }

  function share() {
    if (!currentSolve) return;
    const eff = currentSolve.penalty === 'DNF' ? 'DNF'
              : formatTime(currentSolve.penalty === '+2' ? currentSolve.time + 200 : currentSolve.time);
    const text = `${eff} — ${currentSolve.scramble || ''} [Sub-X OS]`;
    if (navigator.share) {
      navigator.share({ title: 'Sub-X OS Solve', text })
        .catch(() => { copyToClipboard(text); _toast('Copied to clipboard!'); });
    } else {
      copyToClipboard(text);
      _toast('Share text copied!');
    }
  }

  function saveComment(val) {
    if (!currentSolve || !currentSessionId) return;
    Storage.setComment(currentSessionId, currentSolve.id, val);
    currentSolve.comment = val;
  }

  function setPenalty(pen) {
    if (!currentSolve || !currentSessionId) return;
    Storage.setPenalty(currentSessionId, currentSolve.id, pen);
    currentSolve.penalty = pen;
    // Re-render
    open(currentSessionId, currentSolve.id);
    // Refresh solve list
    if (typeof Sessions !== 'undefined') Sessions.renderSolveList();
    if (typeof Stats    !== 'undefined') Stats.refresh();
  }

  function deleteSolve() {
    if (!currentSolve || !currentSessionId) return;
    if (!confirm('Delete this solve?')) return;
    Storage.deleteSolve(currentSessionId, currentSolve.id);
    close();
    if (typeof Sessions !== 'undefined') Sessions.renderSolveList();
    if (typeof Stats    !== 'undefined') Stats.refresh();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function _toast(msg) {
    const t = document.getElementById('ss-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('visible');
    setTimeout(() => t.classList.remove('visible'), 2000);
  }

  // WCA average inline helper
  function wcaAverage(times, n) {
    if (!times || times.length < n) return null;
    const w = times.slice(-n);
    const dnf = w.filter(t => t === -1).length;
    if (n === 3) { if (dnf > 0) return -1; return Math.round(w.reduce((a,b)=>a+b,0)/3); }
    const trim = n <= 12 ? 1 : Math.floor(n * 0.05);
    if (dnf > trim) return -1;
    const sorted = w.map(t => t === -1 ? Number.MAX_SAFE_INTEGER : t).sort((a,b)=>a-b);
    const trimmed = sorted.slice(trim, sorted.length - trim);
    return Math.round(trimmed.reduce((a,b)=>a+b,0) / trimmed.length);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    document.getElementById('solve-summary-overlay')
      ?.addEventListener('click', e => {
        if (e.target.id === 'solve-summary-overlay') close();
      });
  }

  return { init, open, close, copyScramble, copyRecon, copyData, share, saveComment, setPenalty, deleteSolve };
})();
