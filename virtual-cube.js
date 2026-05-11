// virtual-cube.js — Virtual Cube Input Mode
// Shows a 3D CSS cube on screen. User executes scramble moves via keyboard.
// When cube returns to solved state, timer stops automatically.
// Move keys: U F R L D B (+ ' for prime, 2 for double)
// Also works with numpad: 7=U 8=F 9=R 4=L 5=D 6=B
// Depends on: utils.js, storage.js, timer.js

'use strict';

const VirtualCube = (() => {
  // ── Cube state ─────────────────────────────────────────────────────────────
  // 6 faces × 9 stickers. Faces: 0=U 1=D 2=F 3=B 4=L 5=R
  // Each sticker stores face index (0-5) matching its solved colour
  let state = null;
  let active = false;
  let currentScramble = '';
  let moveBuffer = '';   // accumulates key chars before parsing

  const FACE = { U:0, D:1, F:2, B:3, L:4, R:5 };
  const FACE_COLORS = ['#ffffff','#ffff00','#ff6600','#ff0000','#0050ff','#00aa00'];
  const FACE_NAMES  = ['U','D','F','B','L','R'];

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    _resetState();
    document.addEventListener('keydown', _onKey);
  }

  function _resetState() {
    state = Array.from({length:6}, (_,f) => Array(9).fill(f));
  }

  // ── Show / hide ───────────────────────────────────────────────────────────
  function show() {
    active = true;
    const wrap = document.getElementById('vc-wrap');
    if (wrap) wrap.style.display = 'block';
    _render();
  }

  function hide() {
    active = false;
    const wrap = document.getElementById('vc-wrap');
    if (wrap) wrap.style.display = 'none';
  }

  function isActive() { return active; }

  // ── Apply scramble ────────────────────────────────────────────────────────
  function applyScramble(scrambleStr) {
    _resetState();
    currentScramble = scrambleStr;
    const moves = scrambleStr.trim().split(/\s+/);
    moves.forEach(m => _applyMove(m));
    _render();
  }

  // ── Key handler ───────────────────────────────────────────────────────────
  function _onKey(e) {
    if (!active) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;

    const k = e.key.toUpperCase();

    // Move keys
    const moveKeys = { U:'U', F:'F', R:'R', L:'L', D:'D', B:'B',
                       M:'M', E:'E', S:'S', X:'X', Y:'Y', Z:'Z' };
    if (moveKeys[k]) {
      e.preventDefault();
      // Build move string: collect face then optional ' or 2
      moveBuffer = k;
      return;
    }

    if (moveBuffer) {
      let move = moveBuffer;
      if (e.key === "'")  { move += "'"; _executeMove(move); moveBuffer = ''; return; }
      if (e.key === '2')  { move += '2'; _executeMove(move); moveBuffer = ''; return; }
      // No modifier - execute as single clockwise
      _executeMove(move);
      moveBuffer = '';
      // Then re-process this key
      if (moveKeys[k]) { moveBuffer = k; }
      return;
    }
  }

  function _executeMove(move) {
    _applyMove(move);
    _render();
    _showMoveFlash(move);
    if (_isSolved()) {
      setTimeout(() => {
        if (typeof Timer !== 'undefined') {
          Timer._triggerSolved?.();
        }
        _render();
      }, 50);
    }
  }

  function _showMoveFlash(move) {
    const el = document.getElementById('vc-last-move');
    if (el) {
      el.textContent = move;
      el.classList.remove('flash');
      void el.offsetWidth; // reflow
      el.classList.add('flash');
    }
  }

  // ── Cube move engine ──────────────────────────────────────────────────────
  // Minimal 3x3 move system. Each face rotation cycles 4 adjacent faces.
  function _applyMove(move) {
    const face  = move[0];
    const prime = move.includes("'");
    const dbl   = move.includes('2');

    const times = dbl ? 2 : 1;
    const dir   = prime ? -1 : 1;

    for (let t = 0; t < times; t++) {
      switch (face) {
        case 'U': _rotateU(dir); break;
        case 'D': _rotateD(dir); break;
        case 'F': _rotateF(dir); break;
        case 'B': _rotateB(dir); break;
        case 'L': _rotateL(dir); break;
        case 'R': _rotateR(dir); break;
        // Wide / slice moves — approximate
        case 'M': _rotateL(-dir); _rotateR(dir); break;
        case 'E': _rotateD(dir); _rotateU(-dir); break;
        case 'S': _rotateF(dir); _rotateB(-dir); break;
        case 'X': _rotateR(dir); _rotateL(-dir); break;
        case 'Y': _rotateU(dir); _rotateD(-dir); break;
        case 'Z': _rotateF(dir); _rotateB(-dir); break;
        case 'u': _rotateU(dir); _rotateE(-dir); break;
        case 'd': _rotateD(dir); _rotateE(dir);  break;
        case 'f': _rotateF(dir); _rotateS(dir);  break;
        case 'b': _rotateB(dir); _rotateS(-dir); break;
        case 'l': _rotateL(dir); _rotateM(-dir); break;
        case 'r': _rotateR(dir); _rotateM(dir);  break;
      }
    }
  }

  function _rotateFace(f, dir) {
    // Rotate the 9 stickers of face f clockwise (dir=1) or CCW (dir=-1)
    const s = state[f];
    const tmp = [...s];
    if (dir === 1) {
      // CW
      s[0]=tmp[6];s[1]=tmp[3];s[2]=tmp[0];
      s[3]=tmp[7];s[4]=tmp[4];s[5]=tmp[1];
      s[6]=tmp[8];s[7]=tmp[5];s[8]=tmp[2];
    } else {
      // CCW
      s[0]=tmp[2];s[1]=tmp[5];s[2]=tmp[8];
      s[3]=tmp[1];s[4]=tmp[4];s[5]=tmp[7];
      s[6]=tmp[0];s[7]=tmp[3];s[8]=tmp[6];
    }
  }

  function _cycle4(p1,p2,p3,p4, dir) {
    // Cycle 4 sticker positions (each is [face, index])
    const vals = [p1,p2,p3,p4].map(([f,i]) => state[f][i]);
    if (dir === 1) {
      [p2,p3,p4,p1].forEach(([f,i],j) => state[f][i] = vals[j]);
    } else {
      [p4,p1,p2,p3].forEach(([f,i],j) => state[f][i] = vals[j]);
    }
  }

  // U move: rotate top face, cycle top rows of F/R/B/L
  function _rotateU(dir) {
    _rotateFace(FACE.U, dir);
    // F top = [2,0][2,1][2,2] → R top = [5,0][5,1][5,2] → B top → L top → F top
    const rows = [
      [[2,0],[2,1],[2,2]],
      [[5,0],[5,1],[5,2]],
      [[3,0],[3,1],[3,2]],
      [[4,0],[4,1],[4,2]],
    ];
    _cycleRows(rows, dir);
  }

  function _rotateD(dir) {
    _rotateFace(FACE.D, dir);
    const rows = [
      [[2,6],[2,7],[2,8]],
      [[4,6],[4,7],[4,8]],
      [[3,6],[3,7],[3,8]],
      [[5,6],[5,7],[5,8]],
    ];
    _cycleRows(rows, dir);
  }

  function _rotateF(dir) {
    _rotateFace(FACE.F, dir);
    const rows = [
      [[0,6],[0,7],[0,8]],
      [[5,0],[5,3],[5,6]],
      [[1,2],[1,1],[1,0]],
      [[4,8],[4,5],[4,2]],
    ];
    _cycleRows(rows, dir);
  }

  function _rotateB(dir) {
    _rotateFace(FACE.B, dir);
    const rows = [
      [[0,2],[0,1],[0,0]],
      [[4,0],[4,3],[4,6]],
      [[1,6],[1,7],[1,8]],
      [[5,8],[5,5],[5,2]],
    ];
    _cycleRows(rows, dir);
  }

  function _rotateL(dir) {
    _rotateFace(FACE.L, dir);
    const rows = [
      [[0,0],[0,3],[0,6]],
      [[2,0],[2,3],[2,6]],
      [[1,0],[1,3],[1,6]],
      [[3,8],[3,5],[3,2]],
    ];
    _cycleRows(rows, dir);
  }

  function _rotateR(dir) {
    _rotateFace(FACE.R, dir);
    const rows = [
      [[0,8],[0,5],[0,2]],
      [[3,0],[3,3],[3,6]],
      [[1,8],[1,5],[1,2]],
      [[2,8],[2,5],[2,2]],
    ];
    _cycleRows(rows, dir);
  }

  function _rotateE(dir) {
    const rows = [
      [[2,3],[2,4],[2,5]],
      [[4,3],[4,4],[4,5]],
      [[3,3],[3,4],[3,5]],
      [[5,3],[5,4],[5,5]],
    ];
    _cycleRows(rows, dir);
  }

  function _rotateS(dir) {
    const rows = [
      [[0,3],[0,4],[0,5]],
      [[5,1],[5,4],[5,7]],
      [[1,5],[1,4],[1,3]],
      [[4,7],[4,4],[4,1]],
    ];
    _cycleRows(rows, dir);
  }

  function _rotateM(dir) {
    const rows = [
      [[0,1],[0,4],[0,7]],
      [[2,1],[2,4],[2,7]],
      [[1,1],[1,4],[1,7]],
      [[3,7],[3,4],[3,1]],
    ];
    _cycleRows(rows, dir);
  }

  function _cycleRows(rows, dir) {
    const vals = rows.map(row => row.map(([f,i]) => state[f][i]));
    const n = rows.length;
    if (dir === 1) {
      for (let r = 0; r < n; r++) {
        const src = vals[(r + n - 1) % n];
        rows[r].forEach(([f,i],j) => state[f][i] = src[j]);
      }
    } else {
      for (let r = 0; r < n; r++) {
        const src = vals[(r + 1) % n];
        rows[r].forEach(([f,i],j) => state[f][i] = src[j]);
      }
    }
  }

  // ── Solved check ──────────────────────────────────────────────────────────
  function _isSolved() {
    for (let f = 0; f < 6; f++) {
      if (!state[f].every(s => s === f)) return false;
    }
    return true;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function _render() {
    const el = document.getElementById('vc-faces');
    if (!el) return;
    // Render as 2D cross layout: U top, L F R B middle, D bottom
    const layout = [
      { name:'U', face:0, row:0, col:1 },
      { name:'L', face:4, row:1, col:0 },
      { name:'F', face:2, row:1, col:1 },
      { name:'R', face:5, row:1, col:2 },
      { name:'B', face:3, row:1, col:3 },
      { name:'D', face:1, row:2, col:1 },
    ];
    el.innerHTML = layout.map(({name, face, row, col}) => `
      <div class="vc-face" style="grid-row:${row+1};grid-column:${col+1}" data-face="${name}">
        <div class="vc-face-label">${name}</div>
        <div class="vc-stickers">
          ${state[face].map(c => `<div class="vc-sticker" style="background:${FACE_COLORS[c]}"></div>`).join('')}
        </div>
      </div>`).join('');

    // Solved indicator
    const si = document.getElementById('vc-solved');
    if (si) si.style.display = _isSolved() ? 'block' : 'none';
  }

  return { init, show, hide, isActive, applyScramble, _executeMove };
})();
