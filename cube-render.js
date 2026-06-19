// cube-render.js — Live 3D cube renderer
// Wraps @cubing/twisty-player to display current cube state during solving.
// Used by virtual-cube.js and smartcube.js — call CubeRender.create(container)
// to get a renderer instance, then .push(move) after each move.
// Uses experimental-setup-alg so the player always shows the current state
// rather than replaying from solved — this is reliable on a persistent
// instance as long as the visualization mode never changes (we don't switch
// it; callers create separate instances for 2D/3D).
'use strict';

(function () {

  // Create a renderer bound to a DOM container element.
  // Returns an object with .push(move), .reset(scramble), .destroy(), .player
  function create(container, options) {
    options = options || {};
    var puzzle       = options.puzzle    || '3x3x3';
    var cameraLat    = options.cameraLat !== undefined ? options.cameraLat : 25;
    var moveHistory  = [];
    var player       = null;
    var buildToken   = 0;

    function _build() {
      var tok = ++buildToken;
      if (!container) return;
      container.innerHTML = '<div class="cr-loading">Loading 3D…</div>';

      function _doInsert() {
        if (tok !== buildToken) return;
        container.innerHTML = '';
        player = document.createElement('twisty-player');
        player.setAttribute('puzzle', puzzle);
        player.setAttribute('experimental-setup-alg', moveHistory.join(' '));
        player.setAttribute('hint-facelets', 'none');
        player.setAttribute('control-panel', 'none');
        player.setAttribute('background', 'none');
        player.setAttribute('camera-latitude', String(cameraLat));
        player.style.cssText = 'width:100%;height:100%;display:block';
        container.appendChild(player);
      }

      if (customElements.get('twisty-player')) {
        _doInsert();
      } else {
        var timeout = setTimeout(function () {
          if (tok !== buildToken) return;
          container.innerHTML = '<div class="cr-error">3D renderer not loaded.<br>Check connection and reload.</div>';
        }, 7000);
        customElements.whenDefined('twisty-player').then(function () {
          clearTimeout(timeout);
          _doInsert();
        }).catch(function () {
          clearTimeout(timeout);
        });
      }
    }

    // Start with an empty (solved) state
    _build();

    function push(move) {
      if (!move || !move.trim()) return;
      moveHistory.push(move.trim());
      if (player) {
        // Update in place — reliable when visualization mode doesn't change
        player.setAttribute('experimental-setup-alg', moveHistory.join(' '));
      }
    }

    function reset(scrambleAlg) {
      moveHistory = scrambleAlg ? scrambleAlg.trim().split(/\s+/) : [];
      if (player) {
        player.setAttribute('experimental-setup-alg', moveHistory.join(' '));
      }
    }

    function destroy() {
      ++buildToken;
      if (container) container.innerHTML = '';
      player = null;
      moveHistory = [];
    }

    function setPuzzle(puz) {
      puzzle = puz;
      ++buildToken; // force rebuild
      _build();
    }

    return { push: push, reset: reset, destroy: destroy, setPuzzle: setPuzzle,
             get player() { return player; } };
  }

  window.CubeRender = { create: create };
})();
