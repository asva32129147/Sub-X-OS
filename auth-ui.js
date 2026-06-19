// auth-ui.js — Login / Account UI
// Renders a modal with email/password + Google OAuth
// Shows sync indicator in sidebar
// Depends on: cloud-sync.js

'use strict';

const AuthUI = (() => {

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    _createModal();
    _createSyncIndicator();
    // Refresh UI once CloudSync restores session from cookie
    setTimeout(_updateAccountUI, 800);
  }

  // ── Sync indicator dot in sidebar ─────────────────────────────────────────
  function _createSyncIndicator() {
    const logo = document.querySelector('.sb-logo');
    if (!logo) return;
    const dot = document.createElement('span');
    dot.id = 'sync-indicator';
    dot.title = 'Sync status';
    dot.dataset.status = 'offline';
    dot.textContent = '–';
    logo.appendChild(dot);
  }

  // ── Modal creation ────────────────────────────────────────────────────────
  function _createModal() {
    const div = document.createElement('div');
    div.id = 'auth-overlay';
    div.className = 'modal-overlay';
    div.addEventListener('click', e => { if (e.target === div) close(); });
    document.body.appendChild(div);
  }

  // ── Open ──────────────────────────────────────────────────────────────────
  function open() {
    const overlay = document.getElementById('auth-overlay');
    if (!overlay) return;
    overlay.classList.add('open');
    _renderModal();
  }

  function close() {
    document.getElementById('auth-overlay')?.classList.remove('open');
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function _renderModal() {
    const overlay = document.getElementById('auth-overlay');
    if (!overlay) return;

    const isConfigured = typeof CloudSync !== 'undefined'
      && CloudSync.isLoggedIn !== undefined;
    const user = isConfigured ? CloudSync.getUser() : null;

    overlay.innerHTML = `
      <div class="modal-box" style="max-width:420px">
        <div class="modal-header">
          <h2>${user ? 'Account' : 'Sign in to Sub-X OS'}</h2>
          <button onclick="AuthUI.close()" aria-label="Close">✕</button>
        </div>
        <div id="auth-content">
          ${user ? _renderAccount(user) : _renderLogin()}
        </div>
      </div>`;
  }

  function _renderLogin() {
    return `
      <div class="auth-intro">
        Sign in to sync your solves across devices automatically.
        All your local solves are safe — sync only adds cloud backup.
      </div>

      <div id="auth-error" class="auth-error" style="display:none"></div>

      <div class="auth-form">
        <div class="auth-field">
          <label>Email</label>
          <input type="email" id="auth-email" placeholder="you@example.com"
            class="auth-input" autocomplete="email">
        </div>
        <div class="auth-field">
          <label>Password</label>
          <input type="password" id="auth-password" placeholder="••••••••"
            class="auth-input" autocomplete="current-password">
        </div>
        <div class="auth-actions">
          <button class="btn-primary auth-submit" onclick="AuthUI.signIn()">Sign In</button>
          <button class="auth-link-btn" onclick="AuthUI.showSignUp()">Create account</button>
        </div>
        <div class="auth-divider"><span>or</span></div>
        <button class="auth-google-btn" onclick="AuthUI.signInWithGoogle()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="margin-right:8px;vertical-align:middle">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>
      </div>`;
  }

  function _renderSignUp() {
    return `
      <div class="auth-intro">
        Create a free account to back up and sync your solves.
      </div>

      <div id="auth-error" class="auth-error" style="display:none"></div>

      <div class="auth-form">
        <div class="auth-field">
          <label>Email</label>
          <input type="email" id="auth-email" placeholder="you@example.com"
            class="auth-input" autocomplete="email">
        </div>
        <div class="auth-field">
          <label>Password</label>
          <input type="password" id="auth-password" placeholder="Min 6 characters"
            class="auth-input" autocomplete="new-password">
        </div>
        <div class="auth-actions">
          <button class="btn-primary auth-submit" onclick="AuthUI.signUp()">Create Account</button>
          <button class="auth-link-btn" onclick="AuthUI.showSignIn()">Already have an account?</button>
        </div>
        <div class="auth-divider"><span>or</span></div>
        <button class="auth-google-btn" onclick="AuthUI.signInWithGoogle()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="margin-right:8px;vertical-align:middle">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>
      </div>`;
  }

  function _renderAccount(user) {
    return `
      <div class="auth-account">
        <div class="auth-avatar">${(user.email || '?')[0].toUpperCase()}</div>
        <div class="auth-user-email">${user.email}</div>
        <div class="auth-user-id" style="font-size:9px;color:var(--text3)">
          ID: ${user.id?.slice(0,8)}…
        </div>

        <div class="auth-sync-status">
          <span id="sync-status-label">Loading sync status…</span>
        </div>

        <div class="auth-account-actions">
          <button class="btn-primary" onclick="CloudSync.signOut().then(()=>{AuthUI._updateAccountUI();AuthUI.close()})">
            Sign Out
          </button>
        </div>

        <div class="auth-account-info">
          <div class="auth-info-row">
            <span>Solves backed up</span>
            <span id="auth-solve-count">—</span>
          </div>
          <div class="auth-info-row">
            <span>Sessions backed up</span>
            <span id="auth-session-count">—</span>
          </div>
        </div>
      </div>`;
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async function signIn() {
    const email = document.getElementById('auth-email')?.value?.trim();
    const pass  = document.getElementById('auth-password')?.value;
    if (!email || !pass) { _showError('Enter your email and password.'); return; }
    _setLoading(true);
    try {
      await CloudSync.signIn(email, pass);
      _updateAccountUI();
      close();
    } catch (e) {
      _showError(e.message || 'Sign in failed. Check your email and password.');
    } finally {
      _setLoading(false);
    }
  }

  async function signUp() {
    const email = document.getElementById('auth-email')?.value?.trim();
    const pass  = document.getElementById('auth-password')?.value;
    if (!email || !pass) { _showError('Enter your email and password.'); return; }
    if (pass.length < 6) { _showError('Password must be at least 6 characters.'); return; }
    _setLoading(true);
    try {
      await CloudSync.signUp(email, pass);
      // Show confirmation — Supabase sends a verification email
      document.getElementById('auth-content').innerHTML = `
        <div class="auth-intro" style="text-align:center;padding:20px">
          <div style="font-size:32px;margin-bottom:8px">📧</div>
          <strong>Check your email</strong><br><br>
          We sent a confirmation link to <strong>${email}</strong>.<br>
          Click it to activate your account, then come back and sign in.
          <br><br>
          <button class="xs-btn" onclick="AuthUI.showSignIn()">Back to sign in</button>
        </div>`;
    } catch (e) {
      _showError(e.message || 'Sign up failed.');
    } finally {
      _setLoading(false);
    }
  }

  async function signInWithGoogle() {
    try {
      await CloudSync.signInWithGoogle();
      // Google OAuth redirects away — user comes back logged in
    } catch (e) {
      _showError(e.message || 'Google sign-in failed.');
    }
  }

  function showSignUp() {
    document.getElementById('auth-content').innerHTML = _renderSignUp();
  }
  function showSignIn() {
    document.getElementById('auth-content').innerHTML = _renderLogin();
  }

  function _showError(msg) {
    const el = document.getElementById('auth-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }
  function _setLoading(on) {
    const btn = document.querySelector('.auth-submit');
    if (btn) { btn.disabled = on; btn.textContent = on ? 'Loading…' : btn.dataset.label || btn.textContent; }
  }

  // ── Update account state in sidebar ──────────────────────────────────────
  function _updateAccountUI() {
    const btn = document.getElementById('btn-account');
    if (!btn) return;
    const user = typeof CloudSync !== 'undefined' ? CloudSync.getUser() : null;
    if (user) {
      btn.textContent = user.email?.split('@')[0] || 'Account';
    } else {
      btn.textContent = 'Sign In';
    }
  }

  return { init, open, close, signIn, signUp, signInWithGoogle, showSignIn, showSignUp, _updateAccountUI };
})();
