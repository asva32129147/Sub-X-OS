// scramble-draw.js — Draw Scramble
// Uses @cubing/twisty-player (loaded via CDN in index.html)
// Provides 2D net view and 3D view of scramble state
// Exposes window.ScrambleDraw
'use strict';

(function () {
  var mode    = localStorage.getItem('subx_scr_draw') || 'hidden'; // 'hidden' | '2d' | '3d'
  var lastAlg = '';
  var lastPzl = '3x3x3';

  function init() {
    // Restore saved mode on load
    if (mode !== 'hidden') {
      _showPanel();
      _updateBtns();
      // Apply once player is ready
      customElements.whenDefined('twisty-player').then(function() {
        if (lastAlg) _applyToPlayer(lastAlg, lastPzl, mode);
      }).catch(function(){});
    }
    // Wait for twisty-player custom element to be defined
    if (typeof customElements !== 'undefined') {
      customElements.whenDefined('twisty-player').then(function () {
        if (lastAlg) update(lastAlg, lastPzl);
      }).catch(function () {});
    }
  }

  // Called by app.js every time a new scramble is generated
  function update(alg, puzzle) {
    lastAlg = alg  || '';
    lastPzl = puzzle || '3x3x3';
    if (mode === 'hidden') return;
    _applyToPlayer(lastAlg, lastPzl, mode);
  }

  function toggle() {
    if (mode === 'hidden' || mode === '3d') {
      mode = '2d';
    } else {
      mode = 'hidden';
    }
    _showPanel();
    if (mode !== 'hidden') _applyToPlayer(lastAlg, lastPzl, mode);
    _updateBtns();
  }

  function toggle3D() {
    if (mode === 'hidden' || mode === '2d') {
      mode = '3d';
    } else {
      mode = 'hidden';
    }
    _showPanel();
    if (mode !== 'hidden') _applyToPlayer(lastAlg, lastPzl, mode);
    _updateBtns();
  }

  function _showPanel() {
    localStorage.setItem('subx_scr_draw', mode);
    var panel = document.getElementById('scramble-draw-panel');
    if (panel) panel.classList.toggle('open', mode !== 'hidden');
  }

  function _applyToPlayer(alg, puzzle, view) {
    var player = document.getElementById('scramble-twisty');
    if (!player) return;

    // Set puzzle
    player.setAttribute('puzzle', puzzle);

    // cubing.js twisty-player: alg attribute runs the moves
    // We want to show the STATE after the scramble, not animate it
    // Use 'experimental-setup-alg' to set state directly
    player.removeAttribute('alg');
    player.setAttribute('experimental-setup-alg', alg);

    // Visualization mode
    if (view === '2d') {
      player.setAttribute('visualization', '2D');
    } else {
      player.removeAttribute('visualization');
      player.setAttribute('camera-latitude', '25');
    }

    player.setAttribute('control-panel', 'none');
    player.setAttribute('hint-facelets', 'none');
  }

  function _updateBtns() {
    var b2 = document.getElementById('btn-draw-scr');
    var b3 = document.getElementById('btn-3d-scr');
    if (b2) b2.classList.toggle('active', mode === '2d');
    if (b3) b3.classList.toggle('active', mode === '3d');
  }

  window.ScrambleDraw = { init: init, update: update, toggle: toggle, toggle3D: toggle3D };
})();
