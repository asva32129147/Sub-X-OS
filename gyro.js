// gyro.js — Phone Gyroscope Tracking
// Approach: DeviceOrientationEvent (alpha/beta/gamma) + quaternion calibration
// Calibration: drag-to-offset, zero-point reset button (GAN app style)
// iOS requires explicit permission request
// Depends on: nothing

'use strict';

const Gyro = (() => {
  let active    = false;
  let supported = false;

  // Calibration offsets (Euler, degrees)
  let calAlpha = 0, calBeta = 0, calGamma = 0;

  // Last raw reading
  let rawAlpha = 0, rawBeta = 0, rawGamma = 0;

  // Drag calibration state
  let dragStart = null;
  let dragCalStart = null;

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    supported = !!window.DeviceOrientationEvent;
    _bindCalDrag();
  }

  // ── Toggle ────────────────────────────────────────────────────────────────
  async function toggle() {
    if (active) { stop(); return; }
    await start();
  }

  async function start() {
    if (!supported) {
      alert('Gyroscope not supported on this device/browser.');
      return;
    }

    // iOS 13+ requires permission
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm !== 'granted') { alert('Gyroscope permission denied.'); return; }
      } catch (e) {
        alert('Could not request gyroscope permission: ' + e.message);
        return;
      }
    }

    window.addEventListener('deviceorientation', _onOrientation, true);
    active = true;
    _showPanel(true);

    const btn = document.getElementById('btn-gyro-toggle');
    if (btn) { btn.textContent = '📡 Gyro ON'; btn.style.color = 'var(--green)'; }
  }

  function stop() {
    window.removeEventListener('deviceorientation', _onOrientation, true);
    active = false;
    _showPanel(false);

    const btn = document.getElementById('btn-gyro-toggle');
    if (btn) { btn.textContent = '📡 Gyro'; btn.style.color = ''; }
  }

  // ── Orientation event ─────────────────────────────────────────────────────
  function _onOrientation(e) {
    rawAlpha = e.alpha || 0;
    rawBeta  = e.beta  || 0;
    rawGamma = e.gamma || 0;

    // Apply calibration offsets
    const a = ((rawAlpha - calAlpha) % 360 + 360) % 360;
    const b = rawBeta  - calBeta;
    const g = rawGamma - calGamma;

    _updateCubeVisual(a, b, g);
    _updateVals(a, b, g);
  }

  // ── CSS 3D cube visual ─────────────────────────────────────────────────────
  function _updateCubeVisual(alpha, beta, gamma) {
    const cube = document.getElementById('gyro-cube');
    if (!cube) return;
    // Map phone orientation to cube rotation
    // beta  = tilt forward/back  (X rotation)
    // gamma = tilt left/right    (Z rotation)
    // alpha = compass heading    (Y rotation)
    cube.style.transform =
      `rotateY(${alpha.toFixed(1)}deg) ` +
      `rotateX(${(-beta).toFixed(1)}deg) ` +
      `rotateZ(${gamma.toFixed(1)}deg)`;
  }

  function _updateVals(a, b, g) {
    const el = document.getElementById('gyro-vals');
    if (el) el.textContent =
      `α:${a.toFixed(0)}° β:${b.toFixed(0)}° γ:${g.toFixed(0)}°`;
  }

  function _showPanel(show) {
    const p = document.getElementById('gyro-panel');
    if (p) p.style.display = show ? 'block' : 'none';
    const ml = document.getElementById('sc-move-label');
    if (ml && show) ml.style.display = 'block';
  }

  // ── Reset / calibrate ─────────────────────────────────────────────────────
  // Sets current orientation as the "zero" reference (GAN-style reset)
  function reset() {
    calAlpha = rawAlpha;
    calBeta  = rawBeta;
    calGamma = rawGamma;
    // Reset drag thumb to center
    const thumb = document.getElementById('gyro-cal-thumb');
    if (thumb) thumb.style.left = '50%';
  }

  // ── Drag calibration bar ──────────────────────────────────────────────────
  // Horizontal drag offsets the alpha (yaw) calibration ±180°
  function _bindCalDrag() {
    const bar = document.getElementById('gyro-cal-bar');
    if (!bar) return;

    bar.addEventListener('pointerdown', e => {
      dragStart = e.clientX;
      dragCalStart = calAlpha;
      bar.setPointerCapture(e.pointerId);
    });

    bar.addEventListener('pointermove', e => {
      if (dragStart === null) return;
      const barW = bar.clientWidth || 200;
      const dx   = e.clientX - dragStart;
      const pct  = dx / barW; // -1 to +1
      calAlpha   = (dragCalStart + pct * 360 + 360) % 360;

      // Move thumb
      const thumb = document.getElementById('gyro-cal-thumb');
      const thumbPct = Math.max(5, Math.min(95, 50 + pct * 50));
      if (thumb) thumb.style.left = thumbPct + '%';
    });

    bar.addEventListener('pointerup', () => { dragStart = null; });
    bar.addEventListener('pointercancel', () => { dragStart = null; });
  }

  // ── Getters for smartcube.js integration ──────────────────────────────────
  function getOrientation() {
    return { alpha: rawAlpha - calAlpha, beta: rawBeta - calBeta, gamma: rawGamma - calGamma };
  }

  function isActive() { return active; }

  return { init, start, stop, toggle, reset, getOrientation, isActive };
})();
