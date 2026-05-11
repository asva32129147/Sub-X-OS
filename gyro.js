// gyro.js — Gyroscope / Orientation Tracking
// Works on ALL platforms:
//   Mobile/Tablet: DeviceOrientationEvent (real gyroscope)
//   Desktop:       Mouse drag simulation (pointer events)
//   Hybrid:        Tries real gyro first, falls back to mouse automatically
//
// Calibration:
//   - Drag the calibration bar to offset yaw (alpha)
//   - Click Reset to set current orientation as zero (GAN-style)
'use strict';

const Gyro = (() => {
  let active       = false;
  let usingReal    = false;  // true = real device gyro, false = mouse simulation
  let calAlpha     = 0, calBeta = 0, calGamma = 0;
  let rawAlpha     = 0, rawBeta  = 0, rawGamma = 0;
  let dragStartX   = null, dragCalStart = null;
  let mouseTracking = false;
  let lastMouseX   = 0, lastMouseY = 0;
  let simAlpha = 0, simBeta = 30, simGamma = 0;

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    _bindCalDrag();
    _bindMouseSim();
  }

  // ── Toggle ────────────────────────────────────────────────────────────────
  async function toggle() {
    if (active) { stop(); return; }
    await start();
  }

  async function start() {
    // Try real gyro first
    if (window.DeviceOrientationEvent) {
      const hasRealGyro = await _tryRealGyro();
      if (hasRealGyro) { usingReal = true; }
      else { usingReal = false; _startMouseSim(); }
    } else {
      usingReal = false;
      _startMouseSim();
    }

    active = true;
    _showPanel(true);
    const btn = document.getElementById('btn-gyro-toggle');
    if (btn) { btn.textContent = 'Gyro ON'; btn.style.color = 'var(--green)'; }

    _updateModeLabel();
  }

  function stop() {
    window.removeEventListener('deviceorientation', _onOrientation, true);
    mouseTracking = false;
    active = false;
    _showPanel(false);
    const btn = document.getElementById('btn-gyro-toggle');
    if (btn) { btn.textContent = 'Gyro'; btn.style.color = ''; }
  }

  // ── Real gyro ─────────────────────────────────────────────────────────────
  async function _tryRealGyro() {
    // iOS 13+ needs explicit permission
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm !== 'granted') return false;
      } catch { return false; }
    }

    return new Promise(resolve => {
      let resolved = false;
      const handler = (e) => {
        if (resolved) return;
        // Check if we actually got real data (not zeros from desktop)
        if (e.alpha !== null && e.beta !== null && e.gamma !== null &&
            (e.alpha !== 0 || e.beta !== 0 || e.gamma !== 0)) {
          resolved = true;
          window.removeEventListener('deviceorientation', handler, true);
          window.addEventListener('deviceorientation', _onOrientation, true);
          resolve(true);
        }
      };
      window.addEventListener('deviceorientation', handler, true);
      // If no real data after 500ms, fall back to mouse
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          window.removeEventListener('deviceorientation', handler, true);
          resolve(false);
        }
      }, 500);
    });
  }

  function _onOrientation(e) {
    rawAlpha = e.alpha || 0;
    rawBeta  = e.beta  || 0;
    rawGamma = e.gamma || 0;
    _update();
  }

  // ── Mouse simulation ───────────────────────────────────────────────────────
  function _startMouseSim() {
    mouseTracking = true;
    // Reset to a nice default viewing angle
    simAlpha = 0; simBeta = 25; simGamma = 0;
    rawAlpha = simAlpha; rawBeta = simBeta; rawGamma = simGamma;
    _update();
  }

  function _bindMouseSim() {
    const wrap = document.getElementById('gyro-cube-wrap');
    if (!wrap) return;

    wrap.style.cursor = 'grab';

    wrap.addEventListener('pointerdown', e => {
      if (!active || usingReal) return;
      e.preventDefault();
      wrap.setPointerCapture(e.pointerId);
      wrap.style.cursor = 'grabbing';
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    });

    wrap.addEventListener('pointermove', e => {
      if (!active || usingReal) return;
      if (!e.buttons) return;
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      // Horizontal drag = yaw (alpha), Vertical drag = pitch (beta)
      simAlpha = (simAlpha + dx * 0.5 + 360) % 360;
      simBeta  = Math.max(-90, Math.min(90, simBeta - dy * 0.4));
      rawAlpha = simAlpha; rawBeta = simBeta; rawGamma = simGamma;
      _update();
    });

    wrap.addEventListener('pointerup', () => { wrap.style.cursor = 'grab'; });

    // Touch: pinch = gamma (tilt)
    wrap.addEventListener('touchmove', e => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        simGamma = Math.atan2(dx, dy) * (180 / Math.PI);
        rawGamma = simGamma;
        _update();
      }
    }, { passive: true });
  }

  // ── Update display ─────────────────────────────────────────────────────────
  function _update() {
    const a = ((rawAlpha - calAlpha) % 360 + 360) % 360;
    const b = rawBeta  - calBeta;
    const g = rawGamma - calGamma;
    _updateCubeVisual(a, b, g);
    _updateVals(a, b, g);
  }

  function _updateCubeVisual(alpha, beta, gamma) {
    const cube = document.getElementById('gyro-cube');
    if (!cube) return;
    cube.style.transform =
      `rotateY(${alpha.toFixed(1)}deg) ` +
      `rotateX(${(-beta).toFixed(1)}deg) ` +
      `rotateZ(${gamma.toFixed(1)}deg)`;
  }

  function _updateVals(a, b, g) {
    const el = document.getElementById('gyro-vals');
    if (el) el.textContent = `α:${a.toFixed(0)}° β:${b.toFixed(0)}° γ:${g.toFixed(0)}°`;
  }

  function _updateModeLabel() {
    const lbl = document.getElementById('gyro-mode-label');
    if (lbl) lbl.textContent = usingReal
      ? 'Using device gyroscope'
      : 'Mouse/touch simulation — drag the cube to rotate';
  }

  function _showPanel(show) {
    const p = document.getElementById('gyro-panel');
    if (p) p.style.display = show ? 'block' : 'none';
  }

  // ── Reset / calibrate ─────────────────────────────────────────────────────
  function reset() {
    calAlpha = rawAlpha; calBeta = rawBeta; calGamma = rawGamma;
    const thumb = document.getElementById('gyro-cal-thumb');
    if (thumb) thumb.style.left = '50%';
    if (active) _update();
  }

  // ── Calibration drag bar (yaw offset) ────────────────────────────────────
  function _bindCalDrag() {
    const bar = document.getElementById('gyro-cal-bar');
    if (!bar) return;
    bar.addEventListener('pointerdown', e => {
      dragStartX   = e.clientX;
      dragCalStart = calAlpha;
      bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener('pointermove', e => {
      if (dragStartX === null) return;
      const pct  = (e.clientX - dragStartX) / (bar.clientWidth || 200);
      calAlpha   = (dragCalStart + pct * 360 + 360) % 360;
      const tp   = Math.max(5, Math.min(95, 50 + pct * 50));
      const thumb = document.getElementById('gyro-cal-thumb');
      if (thumb) thumb.style.left = tp + '%';
      if (active) _update();
    });
    bar.addEventListener('pointerup',     () => { dragStartX = null; });
    bar.addEventListener('pointercancel', () => { dragStartX = null; });
  }

  function getOrientation() {
    return {
      alpha: ((rawAlpha - calAlpha) % 360 + 360) % 360,
      beta:  rawBeta  - calBeta,
      gamma: rawGamma - calGamma,
    };
  }

  function isActive() { return active; }

  return { init, start, stop, toggle, reset, getOrientation, isActive };
})();
