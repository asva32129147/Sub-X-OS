// app.js — init + event coordination, updated for sidebar layout
// Loaded last. Depends on: all other JS files.
'use strict';

const App = (() => {
  let currentScramble = '';
  let currentEvent    = '333';

  // ─── Boot ──────────────────────────────────────────────────────────────────
  function init() {
    Sessions.init();
    Stats.refresh();
    Settings.init();
    Timer.init();
    AlgTrainer.init();

    const meta = Storage.getCurrentSession();
    currentEvent = meta?.event || '333';

    nextScramble();

    // Escape closes any open modal/overlay
    document.addEventListener('keydown', e => {
      if (e.code === 'Escape') {
        Settings.close();
        document.getElementById('stat-detail-overlay').style.display = 'none';
      }
    });

    console.log('Sub-X OS ready.');
  }

  // ─── Scramble ──────────────────────────────────────────────────────────────
  function nextScramble() {
    currentScramble = generateScramble(currentEvent);
    const el = document.getElementById('scramble-display');
    if (!el) return;
    // Megaminx is multi-line
    if (currentScramble.includes('\n')) {
      el.innerHTML = currentScramble.split('\n')
        .map(l => `<span>${escHtml(l)}</span>`).join('<br>');
    } else {
      el.textContent = currentScramble;
    }
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ─── Timer callback (called by timer.js) ───────────────────────────────────
  function onSolveComplete(time, penalty) {
    Sessions.addSolve(time, penalty, currentScramble);
    Stats.refresh();
    nextScramble();
    checkPBFlash(time, penalty);
  }

  function checkPBFlash(time, penalty) {
    if (penalty === 'DNF') return;
    const times   = Storage.getEffectiveTimes(Storage.getCurrentSessionId());
    const eff     = penalty === '+2' ? time + 200 : time;
    const valid   = times.filter(t => t >= 0);
    if (valid.length >= 2 && eff === Math.min(...valid)) flashPB();
  }

  function flashPB() {
    const el = document.getElementById('pb-flash');
    if (!el) return;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 2500);
  }

  // ─── Session / event switches ──────────────────────────────────────────────
  function onSessionSwitch() {
    const meta   = Storage.getCurrentSession();
    currentEvent = meta?.event || '333';
    Settings.syncEventSelector();
    Stats.refresh();
    Sessions.renderSolveList();
    nextScramble();
    Timer.cancelAll();
    Timer.syncInspBtn();
  }

  function onEventChange(eventCode) {
    currentEvent = eventCode;
    nextScramble();
    Timer.cancelAll();
    Timer.syncInspBtn(); // re-evaluate except-bld mode
    // Keep mobile selectors in sync
    ['event-sel-mob','event-sel-drawer'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = eventCode;
    });
  }

  function onSettingsChange() {
    const s = Storage.getSettings();
    if (s.hideTime) document.body.classList.add('hide-time');
    else            document.body.classList.remove('hide-time');
  }

  // ─── PWA service worker ────────────────────────────────────────────────────
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('SW registered'))
        .catch(e => console.warn('SW failed:', e));
    }
  }

  document.addEventListener('DOMContentLoaded', () => { init(); registerSW(); });

  return { onSolveComplete, onSessionSwitch, onEventChange, onSettingsChange, nextScramble };
})();
