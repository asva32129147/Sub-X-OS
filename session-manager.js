// session-manager.js — Session Manager
// Two session types:
//   "practice"    = time-bounded sessions (like "Wednesday practice", "comp warmup")
//                   Have a start/end date. These are what you think of as solvng sessions.
//   "collection"  = algorithm/drill collections (like "3x3 best solves", "OH PBs")
//                   Used for curating specific solves, not time-based.
//
// Event groups: WCA Big (3x3/2x2/4x4/5x5), WCA Small (Pyra/Skewb/Clock/SQ1/Minx),
//               Big Cubes (6x6/7x7), Blind (3BLD/4BLD/5BLD), One-Handed, FMC
// Depends on: utils.js, storage.js, scramble.js

'use strict';

const SessionManager = (() => {
  const EVENT_GROUPS = {
    'Speed'     : ['333','222','444','555'],
    'Big Cubes' : ['666','777'],
    'WCA Misc'  : ['pyram','skewb','clock','sq1','minx'],
    'Blind'     : ['333bf','444bf','555bf'],
    'One-Handed': ['333oh'],
    'Fewest Moves': ['333fm'],
    'Custom'    : [],
  };

  // ── Open modal ─────────────────────────────────────────────────────────────
  function open() {
    let el = document.getElementById('session-manager-overlay');
    if (!el) _createModal();
    document.getElementById('session-manager-overlay').classList.add('open');
    render();
  }

  function close() {
    document.getElementById('session-manager-overlay')?.classList.remove('open');
  }

  function _createModal() {
    const div = document.createElement('div');
    div.id = 'session-manager-overlay';
    div.className = 'modal-overlay';
    div.setAttribute('role', 'dialog');
    div.addEventListener('click', e => { if (e.target === div) close(); });
    div.innerHTML = `
      <div class="modal-box sm-box">
        <div class="modal-header">
          <h2>Session Manager</h2>
          <button onclick="SessionManager.close()" aria-label="Close">✕</button>
        </div>
        <div id="sm-content"></div>
      </div>`;
    document.body.appendChild(div);
  }

  // ── Main render ────────────────────────────────────────────────────────────
  function render() {
    const el = document.getElementById('sm-content');
    if (!el) return;
    const sessions = Storage.getSessionList();
    const cur      = Storage.getCurrentSessionId();

    // Group sessions by event group
    const groups = {};
    const noGroup = [];
    sessions.forEach(meta => {
      const ev    = meta.event || '333';
      const group = _groupForEvent(ev);
      if (group) {
        if (!groups[group]) groups[group] = [];
        groups[group].push(meta);
      } else noGroup.push(meta);
    });

    el.innerHTML = `
      <div class="sm-toolbar">
        <button class="sm-btn-primary" onclick="SessionManager.newSession('practice')">
          + New Practice Session
        </button>
        <button class="sm-btn-sec" onclick="SessionManager.newSession('collection')">
          + New Collection
        </button>
        <div style="flex:1"></div>
        <input type="text" id="sm-search" placeholder="Search sessions…"
          oninput="SessionManager.filter(this.value)"
          style="font-size:11px;padding:3px 8px;background:var(--bg3);border:1px solid var(--border);color:var(--text);border-radius:3px;outline:none;width:140px">
      </div>

      <div class="sm-type-legend">
        <span class="sm-type-pill practice">● Practice session</span>
        <span class="sm-type-pill collection">◆ Collection</span>
      </div>

      <div id="sm-session-list">
        ${Object.entries({ ...groups, 'Other': noGroup })
          .filter(([,list]) => list.length)
          .map(([group, list]) => `
            <div class="sm-group">
              <div class="sm-group-header">${group}</div>
              ${list.map(meta => _renderRow(meta, cur)).join('')}
            </div>`).join('')}
      </div>

      <div class="sm-footer">
        <button class="sm-btn-sec" onclick="SessionManager.mergePrompt()">Merge sessions</button>
        <button class="sm-btn-sec" onclick="SessionManager.archiveAll()">Archive all</button>
      </div>`;
  }

  function _renderRow(meta, cur) {
    const solves = Storage.getSolves(meta.id);
    const times  = Storage.getEffectiveTimes(meta.id).filter(t => t > 0);
    const pb     = times.length ? Math.min(...times) : null;
    const isCur  = meta.id === cur;
    const type   = meta.sessionType || 'practice';
    const eventLabel = getEventName(meta.event || '333');

    return `
      <div class="sm-row ${isCur?'active':''}" data-id="${meta.id}">
        <div class="sm-row-left" onclick="SessionManager.switchTo('${meta.id}')">
          <div class="sm-type-dot ${type}"></div>
          <div class="sm-row-info">
            <div class="sm-row-name">${_esc(meta.name)}</div>
            <div class="sm-row-meta">
              ${eventLabel} · ${solves.length} solves
              ${pb ? '· PB: ' + formatTime(pb) : ''}
              ${meta.sessionType === 'collection' ? ' · <em>Collection</em>' : ''}
            </div>
          </div>
        </div>
        <div class="sm-row-actions">
          <button class="sm-row-btn" onclick="SessionManager.rename('${meta.id}')" title="Rename">✎</button>
          <button class="sm-row-btn" onclick="SessionManager.changeEvent('${meta.id}')" title="Change event">⇄</button>
          <button class="sm-row-btn" onclick="SessionManager.toggleType('${meta.id}')" title="Switch type">
            ${type === 'practice' ? '◆' : '●'}
          </button>
          <button class="sm-row-btn danger" onclick="SessionManager.deleteSession('${meta.id}')" title="Delete">🗑</button>
        </div>
      </div>`;
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  function switchTo(id) {
    Storage.setCurrentSession(id);
    close();
    if (typeof App !== 'undefined') App.onSessionSwitch();
    if (typeof Sessions !== 'undefined') Sessions.refresh();
  }

  function newSession(type) {
    const count = Storage.getSessionList().length + 1;
    const defaultName = type === 'collection'
      ? `Collection ${count}` : `Session ${count}`;
    const name = prompt(`New ${type} session name:`, defaultName);
    if (!name) return;
    const ev = prompt('Event code (333, 222, 444, etc):', '333') || '333';
    const meta = Storage.createSession(name.trim(), ev);
    // Store session type in a metadata field
    const sessions = Storage.getSessions();
    sessions[meta.id].sessionType = type;
    try { localStorage.setItem('subx_sessions', JSON.stringify(sessions)); } catch (e) { console.error('SM write error', e); }
    Storage.setCurrentSession(meta.id);
    render();
    if (typeof App !== 'undefined') App.onSessionSwitch();
    if (typeof Sessions !== 'undefined') Sessions.refresh();
  }

  function rename(id) {
    const meta = Storage.getSession(id);
    const name = prompt('Rename session:', meta?.name || '');
    if (!name) return;
    Storage.renameSession(id, name.trim());
    render();
    if (typeof Sessions !== 'undefined') Sessions.refresh();
  }

  function changeEvent(id) {
    const events = Object.keys(EVENTS).join(', ');
    const ev = prompt(`Event (${events}):`, Storage.getSession(id)?.event || '333');
    if (!ev || !EVENTS[ev]) { alert('Unknown event code.'); return; }
    Storage.setSessionEvent(id, ev);
    render();
  }

  function toggleType(id) {
    const sessions = Storage.getSessions();
    const cur = sessions[id]?.sessionType || 'practice';
    sessions[id].sessionType = cur === 'practice' ? 'collection' : 'practice';
    try { localStorage.setItem('subx_sessions', JSON.stringify(sessions)); } catch (e) { console.error('SM write error', e); }
    render();
  }

  function deleteSession(id) {
    const meta = Storage.getSession(id);
    const count = Storage.getSolves(id).length;
    if (!confirm(`Delete "${meta?.name}"? (${count} solves lost)`)) return;
    Storage.deleteSession(id);
    render();
    if (typeof Sessions !== 'undefined') Sessions.refresh();
    if (typeof App !== 'undefined') App.onSessionSwitch();
  }

  function mergePrompt() {
    alert('Merge: Select two sessions below by clicking their names while holding Shift.\n(Full merge UI coming soon — for now, use Export/Import to combine.)');
  }

  function archiveAll() {
    if (!confirm('Archive all sessions? This will move them to a "Archived" prefix.')) return;
    const sessions = Storage.getSessions();
    Object.values(sessions).forEach(s => {
      if (!s.name.startsWith('[Archive]')) s.name = '[Archive] ' + s.name;
    });
    try { localStorage.setItem('subx_sessions', JSON.stringify(sessions)); } catch (e) { console.error('SM write error', e); }
    render();
    if (typeof Sessions !== 'undefined') Sessions.refresh();
  }

  function filter(query) {
    const q = query.toLowerCase();
    document.querySelectorAll('.sm-row').forEach(row => {
      const name = row.querySelector('.sm-row-name')?.textContent?.toLowerCase() || '';
      row.style.display = name.includes(q) ? '' : 'none';
    });
    document.querySelectorAll('.sm-group').forEach(group => {
      const visible = [...group.querySelectorAll('.sm-row')].some(r => r.style.display !== 'none');
      group.style.display = visible ? '' : 'none';
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _groupForEvent(ev) {
    for (const [group, events] of Object.entries(EVENT_GROUPS)) {
      if (events.includes(ev)) return group;
    }
    return 'Other';
  }

  function _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { open, close, render, switchTo, newSession, rename, changeEvent, toggleType, deleteSession, mergePrompt, archiveAll, filter };
})();
