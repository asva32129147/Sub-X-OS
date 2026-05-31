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
    SolveSummary.init();
    SmartCube.init();
    Gyro.init();
    TimeAttack.init();
    VirtualCube.init();
    if (typeof ScrambleDraw !== 'undefined') ScrambleDraw.init();
    // Show smart cube status bar if smartcube input mode is selected
    _updateSmartCubeBar(Storage.getSettings().timerInput);
    // CloudSync and AuthUI wait for deferred Supabase SDK
    window.addEventListener('load', () => {
      if (typeof CloudSync !== 'undefined') CloudSync.init();
      if (typeof AuthUI !== 'undefined') AuthUI.init();
    });

    const meta = Storage.getCurrentSession();
    currentEvent = meta?.event || '333';

    nextScramble();
    // Apply saved appearance settings
    const _s = Storage.getSettings();
    if (_s.timerFont)     Settings.applyFont(_s.timerFont);
    if (_s.scrambleAlign) Settings.applyScrambleAlign(_s.scrambleAlign);
    if (_s.timerSize)     Settings.applyTimerSize(_s.timerSize);
    if (_s.scrambleSize)  Settings.applyScrambleSize(_s.scrambleSize);

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
    // Guard: EVENTS must be loaded (scramble.js) before generating
    if (typeof generateScramble !== 'function') {
      console.warn('scramble.js not loaded yet');
      return;
    }
    try {
      currentScramble = generateScramble(currentEvent);
    } catch(e) {
      console.error('scramble gen failed:', e);
      currentScramble = 'Error generating scramble';
    }
    const el = document.getElementById('scramble-display');
    if (!el) return;
    // Show event label above scramble if enabled
    const labelEl = document.getElementById('scramble-event-label');
    if (labelEl) {
      const s = Storage.getSettings();
      if (s.showEventLabel && typeof getEventName === 'function') {
        labelEl.textContent = getEventName(currentEvent);
        labelEl.style.display = 'block';
      } else {
        labelEl.style.display = 'none';
      }
    }
    // Megaminx is multi-line
    // Apply to virtual cube if active
    const s2 = Storage.getSettings();
    if (s2.timerInput === 'virtual' && typeof VirtualCube !== 'undefined') {
      VirtualCube.applyScramble(currentScramble);
    }
    // Update draw scramble (2D/3D panel)
    _updateSmartCubeBar(s.timerInput);
    if (typeof ScrambleDraw !== 'undefined') {
      ScrambleDraw.update(currentScramble, _eventToPuzzle(currentEvent));
    }
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

  function _updateSmartCubeBar(inputMode) {
    var bar = document.getElementById('sc-status-bar');
    if (bar) bar.style.display = inputMode === 'smartcube' ? 'flex' : 'none';
  }

  function onSettingsChange() {
    const s = Storage.getSettings();
    if (s.hideTime) document.body.classList.add('hide-time');
    else            document.body.classList.remove('hide-time');
    if (s.timerFont)     Settings.applyFont(s.timerFont);
    if (s.scrambleAlign) Settings.applyScrambleAlign(s.scrambleAlign);
    // Virtual cube mode
    if (s.timerInput === 'virtual') {
      VirtualCube.show();
      VirtualCube.applyScramble(currentScramble || '');
    } else {
      VirtualCube.hide();
    }
    nextScramble();
  }

  // ─── PWA service worker ────────────────────────────────────────────────────
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('SW registered'))
        .catch(e => console.warn('SW failed:', e));
    }
  }

  function _eventToPuzzle(ev) {
    var map = { '222':'2x2x2','333':'3x3x3','444':'4x4x4','555':'5x5x5',
                '666':'6x6x6','777':'7x7x7','pyram':'pyraminx','skewb':'skewb',
                'sq1':'square1','minx':'megaminx','clock':'clock',
                '333oh':'3x3x3','333bf':'3x3x3','333fm':'3x3x3' };
    return map[ev] || '3x3x3';
  }

  document.addEventListener('DOMContentLoaded', () => { init(); registerSW(); });

  return { onSolveComplete, onSessionSwitch, onEventChange, onSettingsChange, nextScramble };
})();
