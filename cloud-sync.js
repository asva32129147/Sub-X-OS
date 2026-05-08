// cloud-sync.js — Sub-X OS Cloud Sync
// Uses Supabase (free tier) for auth + database
// Design: localStorage = source of truth locally. Supabase = background sync.
// App works 100% offline whether logged in or not.
//
// SETUP (one-time, takes ~5 minutes):
//   1. Go to supabase.com → New project → copy Project URL + anon key below
//   2. Run the SQL in SCHEMA SETUP at the bottom of this file in Supabase SQL editor
//   3. Done — sync is automatic on every solve
//
// Depends on: utils.js, storage.js
// Supabase JS loaded via CDN in index.html

'use strict';

const CloudSync = (() => {

  // ── CONFIG — fill these in from your Supabase project ──────────────────────
  // Dashboard → Project Settings → API
  const SUPABASE_URL  = 'YOUR_SUPABASE_URL';   // e.g. https://abcdef.supabase.co
  const SUPABASE_ANON = 'YOUR_SUPABASE_ANON_KEY';

  let supabase = null;
  let currentUser = null;
  let syncQueue = [];
  let syncing = false;

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    if (SUPABASE_URL === 'YOUR_SUPABASE_URL') {
      console.info('CloudSync: not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in cloud-sync.js.');
      return;
    }
    if (typeof window.supabase === 'undefined') {
      console.warn('CloudSync: Supabase SDK not loaded. Add the CDN script to index.html.');
      return;
    }
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
    _restoreSession();
  }

  async function _restoreSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      currentUser = session.user;
      _onLogin(currentUser);
    }
    // Listen for auth changes (login, logout, token refresh)
    supabase.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
      if (currentUser) _onLogin(currentUser);
      else _onLogout();
      _updateSyncUI();
    });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  async function signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname }
    });
    if (error) throw error;
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  function getUser() { return currentUser; }
  function isLoggedIn() { return !!currentUser; }

  // ── On login: pull remote data and merge ──────────────────────────────────
  async function _onLogin(user) {
    _setSyncStatus('syncing');
    try {
      await _pullAndMerge(user.id);
      _setSyncStatus('synced');
    } catch (e) {
      console.error('CloudSync pull failed:', e);
      _setSyncStatus('error');
    }
    _updateSyncUI();
  }

  function _onLogout() {
    _setSyncStatus('offline');
  }

  // ── Pull remote → merge into localStorage ─────────────────────────────────
  async function _pullAndMerge(userId) {
    // Fetch all remote sessions
    const { data: remoteSessions, error: se } = await supabase
      .from('sessions')
      .select('*')
      .eq('user_id', userId);
    if (se) throw se;

    // Fetch all remote solves
    const { data: remoteSolves, error: sv } = await supabase
      .from('solves')
      .select('*')
      .eq('user_id', userId);
    if (sv) throw sv;

    // Get local data
    const localSessions = Storage.getSessionList();
    const localSessionIds = new Set(localSessions.map(s => s.id));

    // Merge sessions: add any remote sessions not in local
    for (const rs of (remoteSessions || [])) {
      if (!localSessionIds.has(rs.id)) {
        // Create session locally with the remote ID
        Storage.createSessionWithId(rs.id, rs.name, rs.event, rs.session_type);
      }
    }

    // Merge solves: add any remote solves not already local
    for (const rs of (remoteSolves || [])) {
      const localSolves = Storage.getSolves(rs.session_id);
      const alreadyHas = localSolves.some(s => s.id === rs.id);
      if (!alreadyHas) {
        Storage.addSolveWithId(rs.session_id, {
          id:        rs.id,
          time:      rs.time,
          penalty:   rs.penalty || '',
          scramble:  rs.scramble || '',
          comment:   rs.comment || '',
          moves:     rs.moves ? JSON.parse(rs.moves) : null,
          timestamp: rs.timestamp,
        });
      }
    }

    // Refresh UI
    if (typeof Sessions !== 'undefined') Sessions.refresh();
    if (typeof Stats    !== 'undefined') Stats.refresh();
    if (typeof App      !== 'undefined') App.onSessionSwitch();
  }

  // ── Push local → remote (called after every solve) ───────────────────────
  async function pushSolve(sessionId, solve) {
    if (!isLoggedIn() || !supabase) return;

    // Ensure session exists in Supabase
    const meta = Storage.getSession(sessionId);
    if (meta) {
      await supabase.from('sessions').upsert({
        id:           sessionId,
        user_id:      currentUser.id,
        name:         meta.name,
        event:        meta.event || '333',
        session_type: meta.sessionType || 'practice',
        created_at:   meta.created || new Date().toISOString(),
      }, { onConflict: 'id' });
    }

    // Push solve
    const { error } = await supabase.from('solves').upsert({
      id:         solve.id,
      session_id: sessionId,
      user_id:    currentUser.id,
      time:       solve.time,
      penalty:    solve.penalty || '',
      scramble:   solve.scramble || '',
      comment:    solve.comment || '',
      moves:      solve.moves ? JSON.stringify(solve.moves) : null,
      timestamp:  solve.timestamp || Date.now(),
    }, { onConflict: 'id' });

    if (error) {
      console.error('CloudSync push failed:', error);
      _setSyncStatus('error');
    } else {
      _setSyncStatus('synced');
    }
  }

  async function pushSession(sessionId) {
    if (!isLoggedIn() || !supabase) return;
    const meta = Storage.getSession(sessionId);
    if (!meta) return;
    await supabase.from('sessions').upsert({
      id:           sessionId,
      user_id:      currentUser.id,
      name:         meta.name,
      event:        meta.event || '333',
      session_type: meta.sessionType || 'practice',
      created_at:   meta.created || new Date().toISOString(),
    }, { onConflict: 'id' });
  }

  async function deleteRemoteSolve(solveId) {
    if (!isLoggedIn() || !supabase) return;
    await supabase.from('solves').delete().eq('id', solveId).eq('user_id', currentUser.id);
  }

  // ── Sync status indicator ─────────────────────────────────────────────────
  function _setSyncStatus(status) {
    const el = document.getElementById('sync-indicator');
    if (!el) return;
    const labels = { synced:'✓', syncing:'↻', error:'!', offline:'–' };
    el.textContent    = labels[status] || '–';
    el.dataset.status = status;
  }

  function _updateSyncUI() {
    const loginBtn  = document.getElementById('btn-cloud-login');
    const logoutBtn = document.getElementById('btn-cloud-logout');
    const userLabel = document.getElementById('cloud-user-label');

    if (loginBtn)  loginBtn.style.display  = isLoggedIn() ? 'none' : 'block';
    if (logoutBtn) logoutBtn.style.display = isLoggedIn() ? 'block' : 'none';
    if (userLabel) userLabel.textContent   = currentUser?.email || '';
  }

  return {
    init,
    signUp, signIn, signInWithGoogle, signOut,
    getUser, isLoggedIn,
    pushSolve, pushSession, deleteRemoteSolve,
  };
})();

/* ═══════════════════════════════════════════════════════════════════════════
   SUPABASE SCHEMA SETUP
   Run this once in your Supabase project → SQL Editor → New Query

   CREATE TABLE sessions (
     id           TEXT PRIMARY KEY,
     user_id      UUID REFERENCES auth.users NOT NULL,
     name         TEXT NOT NULL,
     event        TEXT DEFAULT '333',
     session_type TEXT DEFAULT 'practice',
     created_at   TIMESTAMPTZ DEFAULT NOW()
   );
   ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "Users see own sessions" ON sessions
     FOR ALL USING (auth.uid() = user_id);

   CREATE TABLE solves (
     id         TEXT PRIMARY KEY,
     session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
     user_id    UUID REFERENCES auth.users NOT NULL,
     time       INTEGER NOT NULL,
     penalty    TEXT DEFAULT '',
     scramble   TEXT DEFAULT '',
     comment    TEXT DEFAULT '',
     moves      JSONB,
     timestamp  BIGINT DEFAULT extract(epoch from now()) * 1000
   );
   ALTER TABLE solves ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "Users see own solves" ON solves
     FOR ALL USING (auth.uid() = user_id);

   -- Speed up queries
   CREATE INDEX ON solves(session_id);
   CREATE INDEX ON solves(user_id);
   CREATE INDEX ON sessions(user_id);
═══════════════════════════════════════════════════════════════════════════ */
