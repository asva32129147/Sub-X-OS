// app.js — initialisation, event coordination between all modules
// Loaded last. Depends on: all other JS files.

'use strict';

const App = (() => {
  let currentScramble = '';
  let currentEvent    = '333';

  // ─── Boot ─────────────────────────────────────────────────────────────────
  function init() {
    // Initialise all modules
    Sessions.init();
    Stats.refresh();
    Settings.init();
    Timer.init();

    // Load current event from session
    const meta = Storage.getCurrentSession();
    currentEvent = meta?.event || '333';

    // Generate first scramble
    nextScramble();

    // Bind toolbar buttons
    bindToolbar();

    // Keyboard shortcut: Escape closes modals
    document.addEventListener('keydown', e => {
      if (e.code === 'Escape') {
        Settings.close();
        closeScrambleDetail();
      }
    });

    console.log('Sub-X OS ready.');
  }

  // ─── Scramble ─────────────────────────────────────────────────────────────
  function nextScramble() {
    currentScramble = generateScramble(currentEvent);
    const el = document.getElementById('scramble-display');
    if (el) el.textContent = currentScramble;

    // Format multi-line scrambles (Megaminx)
    if (el && currentScramble.includes('\n')) {
      el.innerHTML = currentScramble.split('\n')
        .map(l => `<span>${l}</span>`).join('<br>');
    }
  }

  // ─── Timer callbacks ──────────────────────────────────────────────────────
  /**
   * Called by timer.js when a solve completes.
   * @param {number} time     centiseconds
   * @param {string} penalty  '' | '+2' | 'DNF' (from inspection overshoot)
   */
  function onSolveComplete(time, penalty) {
    // Hide-timer: restore display
    const disp = document.getElementById('timer-display');
    if (disp) disp.style.opacity = '1';

    // Persist the solve
    const solve = Sessions.addSolve(time, penalty, currentScramble);

    // Refresh stats immediately
    Stats.refresh();

    // Generate next scramble
    nextScramble();

    // Flash PB indicator if this was a PB
    checkPBFlash(time, penalty);
  }

  function checkPBFlash(time, penalty) {
    if (penalty === 'DNF') return;
    const sessionId = Storage.getCurrentSessionId();
    const times     = Storage.getEffectiveTimes(sessionId);
    const effective = penalty === '+2' ? time + 200 : time;
    const valid     = times.filter(t => t >= 0);
    if (valid.length >= 2 && effective === Math.min(...valid)) {
      flashPB();
    }
  }

  function flashPB() {
    const el = document.getElementById('pb-flash');
    if (!el) return;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 2500);
  }

  // ─── Session switch ───────────────────────────────────────────────────────
  function onSessionSwitch() {
    const meta = Storage.getCurrentSession();
    currentEvent = meta?.event || '333';
    Settings.syncEventSelector();
    Stats.refresh();
    Sessions.renderSolveList();
    nextScramble();
    Timer.cancelAll();
  }

  // ─── Event change ─────────────────────────────────────────────────────────
  function onEventChange(eventCode) {
    currentEvent = eventCode;
    nextScramble();
    Timer.cancelAll();
  }

  // ─── Settings change ──────────────────────────────────────────────────────
  function onSettingsChange() {
    const s = Storage.getSettings();
    const disp = document.getElementById('timer-display');
    if (disp) disp.dataset.hide = s.hideTime ? 'true' : 'false';
    const scrEl = document.getElementById('scramble-wrap');
    if (scrEl) scrEl.style.display = s.showScramble ? '' : 'none';
  }

  // ─── Toolbar ──────────────────────────────────────────────────────────────
  function bindToolbar() {
    const newScr = document.getElementById('btn-new-scramble');
    if (newScr) newScr.onclick = nextScramble;

    const toggleSolves = document.getElementById('btn-toggle-solves');
    if (toggleSolves) toggleSolves.onclick = () => {
      const panel = document.getElementById('solve-panel');
      if (panel) panel.classList.toggle('hidden');
    };

    // Session controls already bound in sessions.js
  }

  function closeScrambleDetail() {
    const el = document.getElementById('stat-detail-overlay');
    if (el) el.style.display = 'none';
  }

  // ─── PWA service worker ───────────────────────────────────────────────────
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('SW registered'))
        .catch(e => console.warn('SW failed:', e));
    }
  }

  // Boot on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    init();
    registerSW();
  });

  return {
    onSolveComplete,
    onSessionSwitch,
    onEventChange,
    onSettingsChange,
    nextScramble,
  };
})();
