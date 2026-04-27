// timer.js — core timing engine
// Handles: spacebar hold, dual-Ctrl stackmat mode, touch, inspection countdown
// Depends on: utils.js, storage.js
// Calls into app.js via: App.onSolveComplete(time, penalty)

'use strict';

const Timer = (() => {
  // ─── State machine ────────────────────────────────────────────────────────
  // States: IDLE → HOLDING → READY → INSPECTING → RUNNING → STOPPED
  const S = { IDLE:0, HOLDING:1, READY:2, INSPECTING:3, RUNNING:4, STOPPED:5 };
  let state = S.IDLE;

  let startTime   = 0;   // performance.now() when timer started
  let elapsed     = 0;   // centiseconds, updated each frame
  let rafId       = null;
  let holdTimer   = null;
  let inspTimer   = null;
  let inspElapsed = 0;   // seconds counted down
  let inspInterval= null;

  // Stackmat: both Ctrl keys must be held
  let leftCtrl  = false;
  let rightCtrl = false;

  // Settings snapshot (refreshed on each start)
  let cfg = {};

  // DOM refs (set by init)
  let elDisplay, elInsp, elScramble, elState;

  // ─── Init ──────────────────────────────────────────────────────────────────
  function init() {
    elDisplay  = document.getElementById('timer-display');
    elInsp     = document.getElementById('inspection-display');
    elScramble = document.getElementById('scramble-display');
    elState    = document.getElementById('timer-state');

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);

    // Touch support
    const timerArea = document.getElementById('timer-area');
    if (timerArea) {
      timerArea.addEventListener('touchstart', onTouchStart, { passive: false });
      timerArea.addEventListener('touchend',   onTouchEnd,   { passive: false });
    }

    refreshCfg();
    setDisplay(0);
    setState('idle');
  }

  function refreshCfg() {
    cfg = Storage.getSettings();
  }

  // ─── Display helpers ──────────────────────────────────────────────────────
  function setDisplay(cs, color) {
    if (!elDisplay) return;
    elDisplay.textContent = formatTime(cs);
    if (color) elDisplay.dataset.color = color;
    else delete elDisplay.dataset.color;
  }

  function setState(s) {
    if (!elState) return;
    elState.dataset.state = s;
    // Also drive colour directly on the display element for reliability
    if (!elDisplay) return;
    elDisplay.dataset.state = s;
  }

  function setInspDisplay(text) {
    if (!elInsp) return;
    elInsp.textContent = text || '';
    elInsp.style.display = text ? 'block' : 'none';
  }

  // ─── Input routing ────────────────────────────────────────────────────────
  function onKeyDown(e) {
    // Don't intercept if user is typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    refreshCfg();
    const mode = cfg.timerInput;

    if (mode === 'stackmat') {
      // Both Ctrl keys held = stackmat mode
      if (e.code === 'ControlLeft')  leftCtrl  = true;
      if (e.code === 'ControlRight') rightCtrl = true;
      if (leftCtrl && rightCtrl) handleHoldStart(e);
      return;
    }

    // Space bar mode (csTimer default)
    if (e.code === 'Space') {
      e.preventDefault();
      handleHoldStart(e);
    }

    // Escape cancels everything
    if (e.code === 'Escape') cancelAll();
  }

  function onKeyUp(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    refreshCfg();
    const mode = cfg.timerInput;

    if (mode === 'stackmat') {
      const wasDown = leftCtrl && rightCtrl;
      if (e.code === 'ControlLeft')  leftCtrl  = false;
      if (e.code === 'ControlRight') rightCtrl = false;
      if (wasDown && (!leftCtrl || !rightCtrl)) handleHoldRelease(e);
      return;
    }

    if (e.code === 'Space') handleHoldRelease(e);
  }

  function onTouchStart(e) {
    if (e.touches.length >= 2) return; // ignore multi-touch on timer area
    e.preventDefault();
    refreshCfg();
    handleHoldStart(e);
  }

  function onTouchEnd(e) {
    e.preventDefault();
    handleHoldRelease(e);
  }

  // ─── State machine transitions ────────────────────────────────────────────

  function handleHoldStart(e) {
    if (state === S.RUNNING) {
      // Pressing any key while running = stop
      stopTimer();
      return;
    }
    if (state === S.STOPPED) {
      // First press after stop returns to IDLE and resets display
      state = S.IDLE;
      return;
    }
    if (state === S.IDLE) {
      state = S.HOLDING;
      setDisplay(0);
      setState('holding');

      holdTimer = setTimeout(() => {
        if (state === S.HOLDING) {
          state = S.READY;
          setState('ready');
          setDisplay(0, 'green');
        }
      }, cfg.holdDelay || 550);
    }
  }

  function handleHoldRelease(e) {
    if (state === S.HOLDING) {
      // Released too early — cancel
      clearTimeout(holdTimer);
      holdTimer = null;
      state = S.IDLE;
      setState('idle');
      setDisplay(elapsed || 0);
      return;
    }

    if (state === S.READY) {
      clearTimeout(holdTimer);
      holdTimer = null;
      if (cfg.inspection) {
        startInspection();
      } else {
        startTimer();
      }
      return;
    }

    if (state === S.INSPECTING) {
      // Any release during inspection starts the timer
      endInspection();
      startTimer();
    }
  }

  // ─── Inspection ───────────────────────────────────────────────────────────

  function startInspection() {
    state = S.INSPECTING;
    setState('inspecting');
    inspElapsed = 0;
    const limit = cfg.inspectionTime || 15;

    inspInterval = setInterval(() => {
      inspElapsed++;
      const remaining = limit - inspElapsed;

      if (cfg.inspectionVoice) {
        if (remaining === 8 || remaining === 3 || remaining === 2 || remaining === 1) {
          speak(String(remaining));
        } else if (remaining === 0) {
          speak('+2');
        } else if (remaining < 0) {
          speak('DNF');
        }
      }

      if (remaining > 0) {
        setInspDisplay(remaining + 's');
      } else if (remaining === 0) {
        setInspDisplay('+2');
      } else {
        setInspDisplay('DNF');
      }

      // Auto-DNF at limit + 2 seconds
      if (remaining <= -2) {
        endInspection('DNF');
        startTimer(true);
      }
    }, 1000);
  }

  function endInspection(forcePenalty) {
    clearInterval(inspInterval);
    inspInterval = null;
    setInspDisplay('');

    // If inspection went over 15s, mark +2; over 17s, DNF (set in start)
    if (!forcePenalty) {
      const limit = cfg.inspectionTime || 15;
      if (inspElapsed > limit) {
        Timer._inspPenalty = '+2';
      } else {
        Timer._inspPenalty = '';
      }
    } else {
      Timer._inspPenalty = forcePenalty;
    }
  }

  // ─── Timer loop ───────────────────────────────────────────────────────────

  function startTimer(skipHoldCheck) {
    state = S.RUNNING;
    setState('running');
    setDisplay(0);
    startTime = performance.now();
    elapsed = 0;
    rafId = requestAnimationFrame(tick);
  }

  function tick(now) {
    if (state !== S.RUNNING) return;
    elapsed = Math.floor((now - startTime) / 10); // centiseconds
    setDisplay(elapsed);
    rafId = requestAnimationFrame(tick);
  }

  function stopTimer() {
    if (state !== S.RUNNING) return;
    cancelAnimationFrame(rafId);
    rafId = null;

    const finalTime = Math.floor((performance.now() - startTime) / 10);
    elapsed = finalTime;
    state = S.STOPPED;
    setState('stopped');

    setDisplay(finalTime);

    // Resolve inspection penalty
    const penalty = Timer._inspPenalty || '';
    Timer._inspPenalty = '';

    // Notify app
    if (typeof App !== 'undefined' && App.onSolveComplete) {
      App.onSolveComplete(finalTime, penalty);
    }
  }

  // ─── Utility ──────────────────────────────────────────────────────────────

  function cancelAll() {
    clearTimeout(holdTimer);
    clearInterval(inspInterval);
    cancelAnimationFrame(rafId);
    holdTimer = null;
    inspInterval = null;
    rafId = null;
    state = S.IDLE;
    setState('idle');
    setDisplay(elapsed || 0);
    setInspDisplay('');
    leftCtrl = false;
    rightCtrl = false;
  }

  function speak(text) {
    if (!window.speechSynthesis) return;
    const utt = new SpeechSynthesisUtterance(text);
    utt.volume = 1;
    utt.rate   = 1.2;
    speechSynthesis.speak(utt);
  }

  /** Force the timer input mode without going through settings UI. */
  function setInputMode(mode) {
    Storage.setSetting('timerInput', mode);
    refreshCfg();
    cancelAll();
  }

  /** Get current elapsed time in centiseconds (for live display reads). */
  function getElapsed() { return elapsed; }
  function isRunning()  { return state === S.RUNNING; }

  return { init, cancelAll, setInputMode, getElapsed, isRunning, refreshCfg };
})();
