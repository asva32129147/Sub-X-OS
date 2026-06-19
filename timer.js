// timer.js — timing engine
// Inspection modes (matches csTimer):
//   'always'      — always show inspection
//   'except-bld'  — skip for BLD events (333bf, 444bf, 555bf, 333fm)
//   'updown'      — Up arrow starts inspection, Down starts timer (csTimer up/down)
//   'off'         — no inspection
// Input modes: 'space' (default) | 'virtual' (virtual cube on-screen)
// Both Ctrl keys always work as a trigger alongside spacebar
// Key change from v1: inspection starts with a SINGLE TAP (no hold needed)
// Red colour (insp-ending state) shown the moment you press to stop inspection

'use strict';

const Timer = (() => {
  const S = {
    IDLE: 0, HOLDING: 1, READY: 2,
    INSPECTING: 3, INSP_ENDING: 4,  // INSP_ENDING = pressed space to end, brief red flash
    RUNNING: 5, STOPPED: 6
  };
  let state = S.IDLE;
  let startTime = 0, elapsed = 0, rafId = null;
  let holdTimer = null, inspInterval = null;
  let inspElapsed = 0, _inspPenalty = '';
  let leftCtrl = false, rightCtrl = false;
  let cfg = {};

  // DOM
  let elDisplay, elInsp;

  // BLD events — skip inspection in 'except-bld' mode
  const BLD_EVENTS = new Set(['333bf', '444bf', '555bf', '333fm']);

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    elDisplay = document.getElementById('timer-display');
    elInsp    = document.getElementById('inspection-display');

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);

    const area = document.getElementById('timer-area');
    if (area) {
      area.addEventListener('touchstart', onTouchStart, { passive: false });
      area.addEventListener('touchend',   onTouchEnd,   { passive: false });
    }

    refreshCfg();
    setState('idle');
    setDisplay(0);
    syncInspBtn();
  }

  function refreshCfg() { cfg = Storage.getSettings(); }

  // ─── Inspection toggle (toolbar button) ──────────────────────────────────
  function toggleInspection() {
    const s = Storage.getSettings();
    // Cycle: always → except-bld → updown → off → always
    const cycle = ['always','except-bld','updown','off'];
    const idx = cycle.indexOf(s.inspectionMode ?? (s.inspection ? 'always' : 'off'));
    const next = cycle[(idx + 1) % cycle.length];
    Storage.setSetting('inspectionMode', next);
    // Keep legacy bool in sync
    Storage.setSetting('inspection', next !== 'off');
    refreshCfg();
    syncInspBtn();
    cancelAll();
  }

  function syncInspBtn() {
    const s = Storage.getSettings();
    const mode = s.inspectionMode ?? (s.inspection ? 'always' : 'off');
    const labels = { 'always':'INSP: ON','except-bld':'INSP: -BLD','updown':'INSP: ↑↓','off':'INSP: OFF' };
    const on = mode !== 'off';
    document.querySelectorAll('#btn-inspection-toggle, #insp-toggle-mob').forEach(b => {
      if (!b) return;
      b.classList.toggle('insp-on', on);
      if (b.id === 'btn-inspection-toggle') b.textContent = labels[mode] || 'INSP';
      if (b.id === 'insp-toggle-mob') b.textContent = on ? 'INSP✓' : 'INSP';
    });
    // Update hint
    updateHint(mode);
  }

  function updateHint(mode) {
    const el = document.getElementById('timer-hint');
    if (!el) return;
    const m = cfg.timerInput;
    if (mode === 'off') {
      el.innerHTML = 'Hold <kbd>Space</kbd> to start &nbsp;·&nbsp; <kbd>Space</kbd> to stop &nbsp;·&nbsp; <kbd>Esc</kbd> cancel';
    } else {
      el.innerHTML = 'Tap <kbd>Space</kbd> → inspection &nbsp;·&nbsp; Hold <kbd>Space</kbd> → start timing &nbsp;·&nbsp; <kbd>Space</kbd> stop';
    }
  }

  function shouldInspect() {
    const s = Storage.getSettings();
    const mode = s.inspectionMode ?? (s.inspection ? 'always' : 'off');
    if (mode === 'off') return false;
    if (mode === 'always') return true;
    if (mode === 'except-bld') {
      const meta = Storage.getCurrentSession();
      return !BLD_EVENTS.has(meta?.event || '');
    }
    // 'updown' handled separately via arrow keys
    return false;
  }

  // ─── Display ──────────────────────────────────────────────────────────────
  function setDisplay(cs) {
    if (!elDisplay) return;
    elDisplay.textContent = cs === 0 && state === S.IDLE ? '0.00' : formatTime(cs);
  }

  function setState(s) {
    if (elDisplay) elDisplay.dataset.state = s;
  }

  function setInspDisplay(text, ending) {
    if (!elInsp) return;
    elInsp.textContent   = text || '';
    elInsp.style.display = text ? 'block' : 'none';
    elInsp.classList.toggle('ending', !!ending);
  }

  // ─── Key / touch handlers ─────────────────────────────────────────────────
  function isTyping(t) {
    return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
  }

  function onKeyDown(e) {
    if (isTyping(e.target)) return;
    // Only handle timer keys when the timer view is actually active
    // (prevents space/ctrl from firing timer while in Alg Trainer, Time Attack, etc.)
    const timerView = document.getElementById('view-timer');
    if (timerView && !timerView.classList.contains('active')) return;
    refreshCfg();
    const s = Storage.getSettings();
    const mode = s.inspectionMode ?? (s.inspection ? 'always' : 'off');

    // Up/Down mode (csTimer up/down)
    if (mode === 'updown') {
      if (e.code === 'ArrowUp')   { e.preventDefault(); handleUpDown('up'); }
      if (e.code === 'ArrowDown') { e.preventDefault(); handleUpDown('down'); }
      if (e.code === 'Escape')    cancelAll();
      return;
    }

    // Both Ctrl keys always work as a timer trigger (no separate stackmat mode)
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
      e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'ControlLeft')  leftCtrl  = true;
      if (e.code === 'ControlRight') rightCtrl = true;
      if (leftCtrl && rightCtrl) handlePress();
      return;
    }

    if (e.code === 'Space') { e.preventDefault(); handlePress(); }
    if (e.code === 'Escape') cancelAll();
  }

  function onKeyUp(e) {
    if (isTyping(e.target)) return;
    const timerView = document.getElementById('view-timer');
    if (timerView && !timerView.classList.contains('active')) return;
    refreshCfg();
    const s = Storage.getSettings();
    const mode = s.inspectionMode ?? (s.inspection ? 'always' : 'off');
    if (mode === 'updown') return;

    if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
      const was = leftCtrl && rightCtrl;
      if (e.code === 'ControlLeft')  leftCtrl  = false;
      if (e.code === 'ControlRight') rightCtrl = false;
      if (was) handleRelease();
      return;
    }
    if (e.code === 'Space') handleRelease();
  }

  function onTouchStart(e) {
    if (e.touches.length >= 2) return;
    e.preventDefault();
    refreshCfg();
    handlePress();
  }
  function onTouchEnd(e) {
    e.preventDefault();
    handleRelease();
  }

  // ─── Up/Down mode (csTimer style) ─────────────────────────────────────────
  function handleUpDown(dir) {
    if (state === S.RUNNING && dir === 'down') { stopTimer(); return; }
    if (state === S.RUNNING) return;
    if (state === S.STOPPED) { state = S.IDLE; setState('idle'); return; }
    if (dir === 'up' && state === S.IDLE) {
      if (shouldUDInspect()) startInspection();
      else { state = S.READY; setState('ready'); setDisplay(0); }
    }
    if (dir === 'down' && (state === S.IDLE || state === S.READY || state === S.INSPECTING)) {
      if (state === S.INSPECTING) { stopInspectionUI(); }
      startTimer();
    }
  }

  function shouldUDInspect() {
    const s = Storage.getSettings();
    const mode = s.inspectionMode ?? 'always';
    if (mode === 'off') return false;
    if (mode === 'except-bld') {
      const meta = Storage.getCurrentSession();
      return !BLD_EVENTS.has(meta?.event || '');
    }
    return true;
  }

  // ─── Press / Release state machine ────────────────────────────────────────
  // Flow with inspection ON:
  //   TAP (quick press+release) → INSPECTING (countdown starts)
  //   During inspection, HOLD → red (HOLDING) → green (READY) → release → starts timer
  // Flow with inspection OFF:
  //   HOLD → red → green → release → starts timer
  // Running: any press → stop timer

  function handlePress() {
    // Manual mode: show text input for time entry instead
    if (cfg.timerInput === 'manual') {
      _showManualInput();
      return;
    }
    if (state === S.RUNNING) { stopTimer(); return; }
    if (state === S.STOPPED) { state = S.IDLE; setState('idle'); return; }

    // IDLE + inspection on: single tap starts inspection (no hold needed here)
    if (state === S.IDLE && shouldInspect()) {
      state = S.INSPECTING;
      setState('inspecting');
      startInspection();
      return;
    }

    // IDLE + no inspection: begin hold-to-ready sequence
    if (state === S.IDLE) {
      _beginHold();
      return;
    }

    // INSPECTING: user presses to start timing — begin hold-to-ready from inspection
    // inspInterval still running; we check it in handleRelease to know we came from inspection
    if (state === S.INSPECTING) {
      _beginHold();
      return;
    }
  }

  function _beginHold() {
    state = S.HOLDING;
    setState('holding');   // red
    setDisplay(0);
    holdTimer = setTimeout(() => {
      if (state === S.HOLDING) {
        state = S.READY;
        setState('ready'); // green — release now to start
      }
    }, cfg.holdDelay || 550);
  }

  function handleRelease() {
    if (state === S.HOLDING) {
      clearTimeout(holdTimer); holdTimer = null;
      // Released too early — go back to wherever we came from
      if (inspInterval) {
        // We were in inspection — return to it
        state = S.INSPECTING;
        setState('inspecting');
      } else {
        state = S.IDLE;
        setState('idle');
        setDisplay(elapsed || 0);
      }
      return;
    }

    if (state === S.READY) {
      clearTimeout(holdTimer); holdTimer = null;
      if (inspInterval) {
        // Coming from inspection — stop countdown, brief red flash, start timer
        stopInspectionUI();
        setState('insp-ending');
      }
      startTimer();
    }
  }

  // ─── Inspection ───────────────────────────────────────────────────────────
  function startInspection() {
    inspElapsed = 0; _inspPenalty = '';
    const s = Storage.getSettings();
    const iiMode = s.infiniteInspection || 'off';

    // Infinite inspection modes (oneloooking, cross+1, free) — no countdown limit
    if (iiMode !== 'off') {
      _runInfiniteInspection(iiMode);
      return;
    }

    const limit = cfg.inspectionTime || 15;
    setInspDisplay(limit + 's');

    inspInterval = setInterval(() => {
      inspElapsed++;
      const rem = limit - inspElapsed;
      if (cfg.inspectionVoice) {
        if ([8,3,2,1].includes(rem)) speak(String(rem));
        else if (rem === 0) speak('+2');
        else if (rem === -1) speak('DNF');
      }
      if (rem > 0)      setInspDisplay(rem + 's', false);
      else if (rem > -2) { setInspDisplay('+2', false); _inspPenalty = '+2'; }
      else              { setInspDisplay('DNF', false); }
      if (rem <= -2) { stopInspectionUI(); startTimer(true); }
    }, 1000);
  }

  // Infinite inspection mode — no limit, space moves to next scramble
  let _iiStart = 0;
  function _runInfiniteInspection(mode) {
    _iiStart = performance.now();
    const labels = {
      onelook: 'Oneloooking — plan full solve',
      crossp1: 'Plan Cross + 1',
      free:    'Free inspection',
    };
    setInspDisplay(labels[mode] || 'Inspection…', false);
    // Tick elapsed time
    if (inspInterval) clearInterval(inspInterval);
    inspInterval = setInterval(() => {
      const elapsed = ((performance.now() - _iiStart) / 1000).toFixed(1);
      setInspDisplay(`${labels[mode] || 'Inspection'} · ${elapsed}s`, false);
    }, 100);
    // Space will call handlePress() which enters HOLDING state from INSPECTING
    // That's fine — it works the same as normal inspection
  }

  function stopInspectionUI() {
    clearInterval(inspInterval); inspInterval = null;
    setInspDisplay(null, false);
  }

  // ─── Timer ────────────────────────────────────────────────────────────────
  function startTimer() {
    state = S.RUNNING; setState('running');
    startTime = performance.now(); elapsed = 0;
    setDisplay(0);
    rafId = requestAnimationFrame(tick);
  }

  function tick(now) {
    if (state !== S.RUNNING) return;
    elapsed = Math.floor((now - startTime) / 10);
    if (!cfg.hideTime) setDisplay(elapsed);
    rafId = requestAnimationFrame(tick);
  }

  // ── Multi-phase split tracking ─────────────────────────────────────────────
  let phases = [];  // array of split times in cs

  function stopTimer() {
    cancelAnimationFrame(rafId); rafId = null;
    const t = Math.floor((performance.now() - startTime) / 10);
    elapsed = t; state = S.STOPPED; setState('stopped');
    setDisplay(t);
    const pen = _inspPenalty; _inspPenalty = '';

    // Multi-phase: record split and continue if phases not done
    const s = Storage.getSettings();
    if (s.multiPhase && phases.length < (s.phaseCount || 4) - 1) {
      phases.push(t);
      _showPhaseSplit(t, phases.length);
      // Restart timer for next phase
      state = S.IDLE; setState('idle');
      startTime = performance.now();
      elapsed = 0;
      rafId = requestAnimationFrame(tick);
      state = S.RUNNING; setState('running');
      return;
    }

    // Final phase — save total elapsed time (last phase timestamp = total time from start)
    const allPhases = phases.length ? [...phases, t] : null;
    const totalTime = allPhases ? allPhases[allPhases.length - 1] : t; // last phase IS the total
    phases = [];
    if (typeof App !== 'undefined') App.onSolveComplete(totalTime, pen, allPhases);
  }

  function _showPhaseSplit(t, phaseNum) {
    const s   = Storage.getSettings();
    const lbl = (s.phaseLabels || '').split(',')[phaseNum - 1]?.trim() || ('Phase ' + phaseNum);
    const el  = document.getElementById('inspection-display');
    if (el) {
      el.textContent   = lbl + ': ' + formatTime(t);
      el.style.display = 'block';
      setTimeout(() => { if (el) el.style.display = 'none'; }, 1500);
    }
  }

  // ─── Cancel ───────────────────────────────────────────────────────────────
  function cancelAll() {
    clearTimeout(holdTimer); stopInspectionUI();
    cancelAnimationFrame(rafId);
    holdTimer = null; rafId = null;
    state = S.IDLE; setState('idle');
    setDisplay(elapsed || 0);
    leftCtrl = false; rightCtrl = false;
  }

  // ─── TTS ──────────────────────────────────────────────────────────────────
  function speak(t) {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(t);
    u.volume = 1; u.rate = 1.3;
    speechSynthesis.speak(u);
  }

  function getElapsed() { return elapsed; }
  function isRunning()  { return state === S.RUNNING; }

  // External input modes (virtual cube, smart cube) call this when they
  // independently detect the cube has reached a solved state. Guarded so it
  // only acts while actually timing — a spurious "solved" check while idle,
  // inspecting, or already stopped is a safe no-op.
  function _triggerSolved() {
    if (state !== S.RUNNING) return;
    stopTimer();
  }

  // External timer device hooks (GAN Smart Timer / Stackmat)
  // _externalStart: called when a hardware timer starts running
  // _externalStop(ms): called when a hardware timer stops; ms is the device-
  //   measured time in milliseconds, or null to use our own elapsed clock
  function _externalStart() {
    if (state === S.RUNNING) return;
    // Reset and start immediately — inspection is skipped for hardware timers
    state = S.RUNNING; setState('running');
    startTime = performance.now(); elapsed = 0;
    rafId = requestAnimationFrame(tick);
  }
  function _externalStop(ms) {
    if (state !== S.RUNNING) return;
    cancelAnimationFrame(rafId); rafId = null;
    // Use device time if provided and sane, otherwise fall back to our clock
    var t = (ms && ms > 0 && ms < 3600000) ? Math.floor(ms/10) : Math.floor((performance.now()-startTime)/10);
    elapsed = t; state = S.STOPPED; setState('stopped');
    setDisplay(t);
    phases = [];
    if (typeof App !== 'undefined') App.onSolveComplete(t, '', null);
  }

  return { init, cancelAll, refreshCfg, getElapsed, isRunning, toggleInspection, syncInspBtn, _triggerSolved, _externalStart, _externalStop };
})();
