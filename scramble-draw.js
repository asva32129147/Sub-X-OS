// scramble-draw.js — Draw Scramble
// Uses @cubing/twisty-player (loaded via CDN in index.html, v0 path required)
// Dynamically creates/destroys the <twisty-player> element on every mode
// change rather than mutating attributes on one persistent instance —
// switching between 2D (SVG) and 3D (WebGL) rendering on the same instance
// is unreliable, so each mode gets a fresh element with the right attributes
// baked in from creation.
// Exposes window.ScrambleDraw
'use strict';

(function () {
  var mode    = localStorage.getItem('subx_scr_draw') || 'hidden'; // 'hidden' | '2d' | '3d'
  var lastAlg = '';
  var lastPzl = '3x3x3';

  function init() {
    _updateBtns();
    if (mode !== 'hidden') {
      _showPanel();
      customElements.whenDefined('twisty-player').then(function () {
        if (lastAlg) _rebuildPlayer(lastAlg, lastPzl, mode);
      }).catch(function () {});
    }
  }

  // Called by app.js every time a new scramble is generated
  function update(alg, puzzle) {
    lastAlg = alg || '';
    lastPzl = puzzle || '3x3x3';
    if (mode === 'hidden') return;
    _rebuildPlayer(lastAlg, lastPzl, mode);
  }

  function toggle()   { _setMode(mode === '2d' ? 'hidden' : '2d'); }
  function toggle3D() { _setMode(mode === '3d' ? 'hidden' : '3d'); }

  function _setMode(next) {
    mode = next;
    localStorage.setItem('subx_scr_draw', mode);
    _showPanel();
    _updateBtns();
    if (mode === 'hidden') {
      _destroyPlayer();
    } else {
      _rebuildPlayer(lastAlg, lastPzl, mode);
    }
  }

  function _showPanel() {
    var panel = document.getElementById('scramble-draw-panel');
    if (panel) panel.classList.toggle('open', mode !== 'hidden');
  }

  // Destroy any existing player, then create a fresh one with every
  // attribute set BEFORE it's inserted into the DOM (so the custom element
  // upgrades with correct initial state, not a partial one built via
  // incremental attribute mutation).
  function _rebuildPlayer(alg, puzzle, view) {
    var container = document.getElementById('scramble-twisty-container');
    if (!container) return;
    if (!customElements.get('twisty-player')) return; // not loaded yet — update() will retry on next scramble

    _destroyPlayer();

    var player = document.createElement('twisty-player');
    player.setAttribute('puzzle', puzzle);
    player.setAttribute('experimental-setup-alg', alg);
    player.setAttribute('hint-facelets', 'none');
    player.setAttribute('control-panel', 'none');
    player.setAttribute('background', 'none'); // transparent — match dark theme
    if (view === '2d') {
      player.setAttribute('visualization', '2D');
    } else {
      player.setAttribute('camera-latitude', '25');
    }
    player.style.width  = '100%';
    player.style.height = '100%';
    player.style.display = 'block';

    container.appendChild(player);
  }

  function _destroyPlayer() {
    var container = document.getElementById('scramble-twisty-container');
    if (container) container.innerHTML = '';
  }

  function _updateBtns() {
    var b2 = document.getElementById('btn-draw-scr');
    var b3 = document.getElementById('btn-3d-scr');
    if (b2) b2.classList.toggle('active', mode === '2d');
    if (b3) b3.classList.toggle('active', mode === '3d');
  }

  window.ScrambleDraw = { init: init, update: update, toggle: toggle, toggle3D: toggle3D };
})();
