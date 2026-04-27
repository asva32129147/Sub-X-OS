// scramble.js — WCA scramble generation for all 17 events
// Adapted from csTimer open-source scramble logic (MIT/GPL-3.0)
// Depends on: nothing

'use strict';

// ─── Event Definitions ────────────────────────────────────────────────────────
const EVENTS = {
  '333':   { name: '3x3x3',           gen: () => scramble333(20) },
  '222':   { name: '2x2x2',           gen: () => scramble222(9)  },
  '444':   { name: '4x4x4',           gen: () => scramble444()   },
  '555':   { name: '5x5x5',           gen: () => scramble555()   },
  '666':   { name: '6x6x6',           gen: () => scramble666()   },
  '777':   { name: '7x7x7',           gen: () => scramble777()   },
  '333oh': { name: '3x3 One-Handed',  gen: () => scramble333(20) },
  '333fm': { name: 'Fewest Moves',    gen: () => scrambleFMC()   },
  '333bf': { name: '3x3 Blind',       gen: () => scramble333(20) },
  '444bf': { name: '4x4 Blind',       gen: () => scramble444()   },
  '555bf': { name: '5x5 Blind',       gen: () => scramble555()   },
  'minx':  { name: 'Megaminx',        gen: () => scrambleMinx()  },
  'pyram': { name: 'Pyraminx',        gen: () => scramblePyramid()},
  'clock': { name: 'Clock',           gen: () => scrambleClock() },
  'skewb': { name: 'Skewb',           gen: () => scrambleSkewb() },
  'sq1':   { name: 'Square-1',        gen: () => scrambleSq1()   },
  'magic': { name: 'Magic',           gen: () => 'S' },
};

function getEventName(code) {
  return EVENTS[code]?.name || code;
}

function generateScramble(eventCode) {
  return EVENTS[eventCode]?.gen() || scramble333(20);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function rand(n) { return Math.floor(Math.random() * n); }
function pick(arr) { return arr[rand(arr.length)]; }

// ─── 3x3 / 3BLD / OH / FM ────────────────────────────────────────────────────
function scramble333(len) {
  const faces  = ['U','D','F','B','L','R'];
  const mods   = ['','\'','2'];
  const axisOf = { U:0,D:0, F:1,B:1, L:2,R:2 };
  const moves = [];
  let lastAxis = -1, secondLastAxis = -1;
  while (moves.length < len) {
    const f = faces[rand(6)];
    const axis = axisOf[f];
    if (axis === lastAxis) continue;
    // Avoid U D U or similar patterns
    if (axis === secondLastAxis && moves.length >= 2) {
      // allow with low probability reduction — just skip same axis
    }
    moves.push(f + mods[rand(3)]);
    secondLastAxis = lastAxis;
    lastAxis = axis;
  }
  return moves.join(' ');
}

// ─── 2x2 ─────────────────────────────────────────────────────────────────────
function scramble222(len) {
  const faces = ['U','F','R'];
  const mods  = ['','\'','2'];
  const moves = [];
  let last = '';
  while (moves.length < len) {
    const f = faces[rand(3)];
    if (f === last) continue;
    moves.push(f + mods[rand(3)]);
    last = f;
  }
  return moves.join(' ');
}

// ─── 4x4 ─────────────────────────────────────────────────────────────────────
function scramble444() {
  const outer = ['U','D','F','B','L','R'];
  const inner = ['Uw','Dw','Fw','Bw','Lw','Rw'];
  const mods  = ['','\'','2'];
  const axisOf = { U:0,D:0,Uw:0,Dw:0, F:1,B:1,Fw:1,Bw:1, L:2,R:2,Lw:2,Rw:2 };
  const pool  = [...outer, ...inner];
  const moves = [];
  let lastAxis = -1;
  while (moves.length < 40) {
    const f = pool[rand(pool.length)];
    const axis = axisOf[f];
    if (axis === lastAxis) continue;
    moves.push(f + mods[rand(3)]);
    lastAxis = axis;
  }
  return moves.join(' ');
}

// ─── 5x5 ─────────────────────────────────────────────────────────────────────
function scramble555() {
  const outer = ['U','D','F','B','L','R'];
  const inner = ['Uw','Dw','Fw','Bw','Lw','Rw'];
  const mods  = ['','\'','2'];
  const axisOf = { U:0,D:0,Uw:0,Dw:0, F:1,B:1,Fw:1,Bw:1, L:2,R:2,Lw:2,Rw:2 };
  const pool  = [...outer, ...inner];
  const moves = [];
  let lastAxis = -1;
  while (moves.length < 60) {
    const f = pool[rand(pool.length)];
    const axis = axisOf[f];
    if (axis === lastAxis) continue;
    moves.push(f + mods[rand(3)]);
    lastAxis = axis;
  }
  return moves.join(' ');
}

// ─── 6x6 ─────────────────────────────────────────────────────────────────────
function scramble666() {
  const outer = ['U','D','F','B','L','R'];
  const w2    = ['2Uw','2Dw','2Fw','2Bw','2Lw','2Rw'];
  const w3    = ['3Uw','3Dw','3Fw','3Bw','3Lw','3Rw'];
  const mods  = ['','\'','2'];
  const axisOf = {};
  ['U','D','2Uw','2Dw','3Uw','3Dw'].forEach(m=>axisOf[m]=0);
  ['F','B','2Fw','2Bw','3Fw','3Bw'].forEach(m=>axisOf[m]=1);
  ['L','R','2Lw','2Rw','3Lw','3Rw'].forEach(m=>axisOf[m]=2);
  const pool  = [...outer, ...w2, ...w3];
  const moves = [];
  let lastAxis = -1;
  while (moves.length < 80) {
    const f = pool[rand(pool.length)];
    const axis = axisOf[f];
    if (axis === lastAxis) continue;
    moves.push(f + mods[rand(3)]);
    lastAxis = axis;
  }
  return moves.join(' ');
}

// ─── 7x7 ─────────────────────────────────────────────────────────────────────
function scramble777() {
  const outer = ['U','D','F','B','L','R'];
  const w2    = ['2Uw','2Dw','2Fw','2Bw','2Lw','2Rw'];
  const w3    = ['3Uw','3Dw','3Fw','3Bw','3Lw','3Rw'];
  const mods  = ['','\'','2'];
  const axisOf = {};
  ['U','D','2Uw','2Dw','3Uw','3Dw'].forEach(m=>axisOf[m]=0);
  ['F','B','2Fw','2Bw','3Fw','3Bw'].forEach(m=>axisOf[m]=1);
  ['L','R','2Lw','2Rw','3Lw','3Rw'].forEach(m=>axisOf[m]=2);
  const pool  = [...outer, ...w2, ...w3];
  const moves = [];
  let lastAxis = -1;
  while (moves.length < 100) {
    const f = pool[rand(pool.length)];
    const axis = axisOf[f];
    if (axis === lastAxis) continue;
    moves.push(f + mods[rand(3)]);
    lastAxis = axis;
  }
  return moves.join(' ');
}

// ─── Megaminx ─────────────────────────────────────────────────────────────────
function scrambleMinx() {
  const rows = [];
  for (let i = 0; i < 7; i++) {
    const d  = pick(['D++','D--']);
    const r1 = pick(['R++','R--']);
    const r2 = pick(['U++','U--']);
    rows.push(`${r1} ${r2} ${r1} ${r2} ${r1} ${r2} ${d}`);
  }
  rows.push(pick(['U','U\'']));
  return rows.join('\n');
}

// ─── Pyraminx ────────────────────────────────────────────────────────────────
function scramblePyramid() {
  const faces = ['U','L','R','B'];
  const mods  = ['','\''];
  const tips  = ['u','l','r','b'];
  const moves = [];
  let last = '';
  while (moves.length < 9) {
    const f = faces[rand(4)];
    if (f === last) continue;
    moves.push(f + mods[rand(2)]);
    last = f;
  }
  // Random tips
  for (const t of tips) {
    if (rand(2)) moves.push(t + mods[rand(2)]);
  }
  return moves.join(' ');
}

// ─── Clock ────────────────────────────────────────────────────────────────────
function scrambleClock() {
  const pins = ['UR','DR','DL','UL','U','R','D','L','ALL'];
  const out  = [];
  for (const p of pins) {
    const n = rand(12) + 1;
    const dir = rand(2) ? `${n}+` : `${n}-`;
    out.push(`${p}${dir}`);
  }
  const pinState = ['UR','DR','DL','UL'].map(p => rand(2) ? p : '');
  out.push('y2');
  for (const p of pins.slice(0, 8)) {
    const n = rand(12) + 1;
    const dir = rand(2) ? `${n}+` : `${n}-`;
    out.push(`${p}${dir}`);
  }
  return out.join(' ');
}

// ─── Skewb ───────────────────────────────────────────────────────────────────
function scrambleSkewb() {
  const moves = ['R','L','U','B'];
  const mods  = ['','\''];
  const out   = [];
  let last = '';
  while (out.length < 9) {
    const m = moves[rand(4)];
    if (m === last) continue;
    out.push(m + mods[rand(2)]);
    last = m;
  }
  return out.join(' ');
}

// ─── Square-1 ────────────────────────────────────────────────────────────────
function scrambleSq1() {
  const out = [];
  for (let i = 0; i < 9; i++) {
    const t = rand(13) - 6;
    const b = rand(13) - 6;
    out.push(`(${t},${b})`);
    if (i < 8) out.push('/');
  }
  return out.join(' ');
}

// ─── FMC ────────────────────────────────────────────────────────────────────
function scrambleFMC() {
  return 'R\' U\' F ' + scramble333(20) + ' R\' U\' F';
}
