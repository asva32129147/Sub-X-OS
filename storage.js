// storage.js — localStorage data model, CRUD for sessions and solves
// Depends on: utils.js (uid, formatDate)

'use strict';

// ─── Data Schema ──────────────────────────────────────────────────────────────
// Storage layout (all under localStorage):
//   subx_sessions   → { [sessionId]: SessionMeta }
//   subx_solves_[sessionId] → Solve[]
//   subx_settings   → Settings
//   subx_current    → sessionId string
//
// SessionMeta: { id, name, event, createdAt }
// Solve:       { id, time, penalty, scramble, comment, timestamp, sessionId }
//              time in centiseconds (raw, before penalty)
//              penalty: '' | '+2' | 'DNF'

const KEYS = {
  sessions:  'subx_sessions',
  settings:  'subx_settings',
  current:   'subx_current',
  solvePfx:  'subx_solves_',
};

// ─── Low-level helpers ────────────────────────────────────────────────────────
function lsGet(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch { console.error('Storage write failed:', key); return false; }
}

// ─── Session CRUD ─────────────────────────────────────────────────────────────
const Storage = {
  /** Return all sessions as a map {id → meta}. */
  getSessions() {
    return lsGet(KEYS.sessions, {});
  },

  /** Return sessions as a sorted array (newest first). */
  getSessionList() {
    const map = this.getSessions();
    return Object.values(map).sort((a, b) => b.createdAt - a.createdAt);
  },

  /** Get a single session meta by id. */
  getSession(id) {
    return this.getSessions()[id] || null;
  },

  /** Create a new session. Returns the new SessionMeta. */
  createSession(name, event = '333') {
    const id = uid();
    const meta = { id, name, event, createdAt: Date.now() };
    const map = this.getSessions();
    map[id] = meta;
    lsSet(KEYS.sessions, map);
    lsSet(KEYS.solvePfx + id, []);
    return meta;
  },

  /** Rename a session. */
  renameSession(id, name) {
    const map = this.getSessions();
    if (!map[id]) return false;
    map[id].name = name;
    return lsSet(KEYS.sessions, map);
  },

  /** Change the event for a session. */
  setSessionEvent(id, event) {
    const map = this.getSessions();
    if (!map[id]) return false;
    map[id].event = event;
    return lsSet(KEYS.sessions, map);
  },

  /** Delete a session and all its solves. */
  deleteSession(id) {
    const map = this.getSessions();
    delete map[id];
    lsSet(KEYS.sessions, map);
    localStorage.removeItem(KEYS.solvePfx + id);
    // If deleted session was current, reset
    if (this.getCurrentSessionId() === id) {
      const remaining = Object.keys(map);
      lsSet(KEYS.current, remaining[0] || null);
    }
    return true;
  },

  /** Get or create the active session id. */
  getCurrentSessionId() {
    let id = lsGet(KEYS.current, null);
    // Validate it still exists
    if (id && this.getSession(id)) return id;
    // Fall back to first session or create default
    const list = this.getSessionList();
    if (list.length) {
      lsSet(KEYS.current, list[0].id);
      return list[0].id;
    }
    const def = this.createSession('Session 1', '333');
    lsSet(KEYS.current, def.id);
    return def.id;
  },

  setCurrentSession(id) {
    lsSet(KEYS.current, id);
  },

  getCurrentSession() {
    return this.getSession(this.getCurrentSessionId());
  },

  // ─── Solve CRUD ─────────────────────────────────────────────────────────────

  /** Return all solves for a session (array, chronological). */
  getSolves(sessionId) {
    return lsGet(KEYS.solvePfx + sessionId, []);
  },

  /** Add a new solve. Returns the Solve object. */
  addSolve(sessionId, { time, penalty = '', scramble = '', comment = '' }) {
    const solve = {
      id: uid(),
      time,       // centiseconds, raw
      penalty,    // '', '+2', 'DNF'
      scramble,
      comment,
      timestamp: Date.now(),
      sessionId,
    };
    const solves = this.getSolves(sessionId);
    solves.push(solve);
    lsSet(KEYS.solvePfx + sessionId, solves);
    return solve;
  },

  /** Update penalty for a solve. */
  setPenalty(sessionId, solveId, penalty) {
    const solves = this.getSolves(sessionId);
    const s = solves.find(s => s.id === solveId);
    if (!s) return false;
    s.penalty = penalty;
    return lsSet(KEYS.solvePfx + sessionId, solves);
  },

  /** Update comment for a solve. */
  setComment(sessionId, solveId, comment) {
    const solves = this.getSolves(sessionId);
    const s = solves.find(s => s.id === solveId);
    if (!s) return false;
    s.comment = comment;
    return lsSet(KEYS.solvePfx + sessionId, solves);
  },

  /** Delete a solve by id. */
  deleteSolve(sessionId, solveId) {
    const solves = this.getSolves(sessionId).filter(s => s.id !== solveId);
    return lsSet(KEYS.solvePfx + sessionId, solves);
  },

  /** Delete all solves in a session. */
  clearSession(sessionId) {
    return lsSet(KEYS.solvePfx + sessionId, []);
  },

  /**
   * Get effective times array for stats (applies penalties).
   * Returns centiseconds; -1 = DNF.
   */
  getEffectiveTimes(sessionId) {
    return this.getSolves(sessionId).map(s => {
      if (s.penalty === 'DNF') return -1;
      if (s.penalty === '+2') return s.time + 200; // +2 seconds = +200cs
      return s.time;
    });
  },

  // ─── Settings ────────────────────────────────────────────────────────────────

  defaultSettings() {
    return {
      inspection:       true,
      inspectionTime:   15,      // seconds
      inspectionVoice:  true,
      holdDelay:        550,     // ms to hold space before timer goes green
      timerInput:       'space', // 'space' | 'stackmat' | 'keyboard'
      theme:            'dark',
      font:             'mono',
      showScramble:     true,
      scrambleSize:     'medium',
      timeFormat:       'auto',  // 'auto' | 'always_minutes'
      hideTime:         false,
    };
  },

  getSettings() {
    const defaults = this.defaultSettings();
    const saved = lsGet(KEYS.settings, {});
    return { ...defaults, ...saved };
  },

  setSetting(key, value) {
    const s = this.getSettings();
    s[key] = value;
    return lsSet(KEYS.settings, s);
  },

  // ─── csTimer Import/Export ───────────────────────────────────────────────────

  /**
   * Export all sessions to csTimer-compatible JSON string.
   */
  exportCSTimer() {
    const out = { properties: { sessionData: {} } };
    const sessions = this.getSessionList();
    sessions.forEach((meta, i) => {
      const key = `session${i + 1}`;
      out[key] = this.getSolves(meta.id).map(s => {
        const pen = s.penalty === 'DNF' ? -1 : s.penalty === '+2' ? 2000 : 0;
        const ms = pen === 2000 ? s.time * 10 - 2000 : s.time * 10;
        return [[pen, ms], s.scramble, s.comment, Math.floor(s.timestamp / 1000)];
      });
      out.properties.sessionData[i + 1] = { name: meta.name, opt: {} };
    });
    out.properties.sessionData = JSON.stringify(out.properties.sessionData);
    return JSON.stringify(out);
  },

  /**
   * Import from csTimer JSON string.
   * Returns { sessions: number, solves: number } summary.
   */
  importCSTimer(jsonStr) {
    const data = JSON.parse(jsonStr);
    let sd = null;
    try {
      const raw = data.properties?.sessionData;
      sd = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (_) {}

    let totalSessions = 0, totalSolves = 0;

    for (const key in data) {
      if (key === 'properties' || !Array.isArray(data[key])) continue;
      const lk = key.replace(/^session/i, '');
      const name = sd?.[lk]?.name?.trim() || key;
      const evCode = sd?.[lk]?.opt?.scrType ?? '333';
      const meta = this.createSession(name, String(evCode));
      totalSessions++;

      for (const entry of data[key]) {
        try {
          const pen = entry[0][0];
          const ms  = entry[0][1];
          if (ms <= 0 && pen !== -1) continue;
          let time, penalty = '';
          if (pen === -1)       { time = 0; penalty = 'DNF'; }
          else if (pen === 2000){ time = Math.round((ms + 2000) / 10); penalty = '+2'; }
          else                  { time = Math.round(ms / 10); }
          this.addSolve(meta.id, {
            time,
            penalty,
            scramble: entry[1] || '',
            comment:  entry[2] || '',
          });
          totalSolves++;
        } catch (_) {}
      }
    }
    return { sessions: totalSessions, solves: totalSolves };
  },
};
