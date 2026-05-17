// smartcube.js — Bluetooth Smart Cube (clean rewrite)
// Supports: GAN (old FFF0 protocol), GAN i3/i4/Carry (new Nordic UART), Giiker i3s
// TPS tracking built in
// Exposes window.SmartCube
'use strict';

(function() {

  // ── BLE UUIDs ──────────────────────────────────────────────────────────────
  var GAN_OLD_SVC     = '0000fff0-0000-1000-8000-00805f9b34fb';
  var GAN_OLD_RD      = '0000fff5-0000-1000-8000-00805f9b34fb';
  var GAN_NEW_SVC     = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
  var GAN_NEW_TX      = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
  var GAN_NEW_RX      = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
  var GIIKER_SVC      = '0000aadb-0000-1000-8000-00805f9b34fb';
  var GIIKER_CHAR     = '0000aadc-0000-1000-8000-00805f9b34fb';

  // ── Move tables ─────────────────────────────────────────────────────────────
  var GAN_MOVES   = ["B","B2","B'","D","D2","D'","L","L2","L'","U","U2","U'","R","R2","R'","F","F2","F'"];
  var GIIKER_MOVES= ["B","B'","B2","D","D'","D2","L","L'","L2","U","U'","U2","R","R'","R2","F","F'","F2"];

  // ── State ───────────────────────────────────────────────────────────────────
  var device    = null;
  var server    = null;
  var protocol  = null; // 'gan-old' | 'gan-new' | 'giiker'
  var connected = false;
  var solving   = false;
  var moveLog   = [];   // [{move, elapsed}] elapsed = ms since solveStart
  var solveStart= 0;

  // ── Public: connect ─────────────────────────────────────────────────────────
  async function connect() {
    if (!navigator.bluetooth) {
      alert('Web Bluetooth requires Chrome or Edge on desktop/Android.\nSafari does not support it.');
      _status('Not supported in this browser.', 'error');
      return;
    }

    var selected = false;
    try {
      _status('Scanning for cube…', 'info');
      device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'GAN' }, { namePrefix: 'Gan' },
          { namePrefix: 'Giiker' }, { namePrefix: 'QY' },
          { namePrefix: 'MHC' }, { namePrefix: 'MGC' },
          { namePrefix: 'GoCube' }, { namePrefix: 'MG' },
        ],
        optionalServices: [GAN_OLD_SVC, GAN_NEW_SVC, GIIKER_SVC],
      });
      selected = true;

      device.addEventListener('gattserverdisconnected', _onDisconnect);
      _status('Connecting to ' + device.name + '…', 'info');
      server = await device.gatt.connect();
      _status('Identifying ' + device.name + '…', 'info');

      // Try protocols in order: GAN new → GAN old → Giiker
      var ok = false;
      if (!ok) { try { await _initGANNew(); protocol = 'gan-new'; ok = true; } catch(e) {} }
      if (!ok) { try { await _initGANOld(); protocol = 'gan-old'; ok = true; } catch(e) {} }
      if (!ok) { try { await _initGiiker(); protocol = 'giiker';  ok = true; } catch(e) {} }

      if (!ok) {
        _status(device.name + ' connected but protocol not recognised. Only GAN and Giiker are supported.', 'error');
        device.gatt.disconnect();
        return;
      }

      connected  = true;
      moveLog    = [];
      solveStart = performance.now();
      _status('Connected: ' + device.name + ' (' + protocol + ')', 'connected');
      _updateUI(true);

    } catch(err) {
      if (!selected && err.name === 'NotFoundError') {
        _status('No cube selected.', 'idle');
      } else if (err.name === 'NetworkError' || (err.message && err.message.indexOf('GATT') >= 0)) {
        _status('Connection failed — make sure the cube is awake and close by, then try again.', 'error');
      } else {
        _status('Error: ' + (err.message || err), 'error');
        console.error('SmartCube:', err);
      }
      device = null;
    }
  }

  async function disconnect() {
    if (device && device.gatt && device.gatt.connected) device.gatt.disconnect();
  }

  function _onDisconnect() {
    connected = false;
    _status('Cube disconnected.', 'idle');
    _updateUI(false);
  }

  // ── GAN new protocol (i3, i4, Carry S) ─────────────────────────────────────
  async function _initGANNew() {
    var svc = await server.getPrimaryService(GAN_NEW_SVC);
    var tx  = await svc.getCharacteristic(GAN_NEW_TX);
    await tx.startNotifications();
    tx.addEventListener('characteristicvaluechanged', _onGANNew);
    // Send init command
    try {
      var rx = await svc.getCharacteristic(GAN_NEW_RX);
      await rx.writeValue(new Uint8Array([0x01, 0x01]));
    } catch(e) {}
  }

  function _onGANNew(e) {
    var data = new Uint8Array(e.target.value.buffer);
    if (data.length < 2) return;
    // Command 0x02 = move event
    if (data[0] === 0x02) {
      var idx = data[1];
      if (idx < GAN_MOVES.length) _record(GAN_MOVES[idx]);
    }
  }

  // ── GAN old protocol (356i, 354M) ───────────────────────────────────────────
  async function _initGANOld() {
    var svc  = await server.getPrimaryService(GAN_OLD_SVC);
    var char = await svc.getCharacteristic(GAN_OLD_RD);
    await char.startNotifications();
    char.addEventListener('characteristicvaluechanged', _onGANOld);
  }

  function _onGANOld(e) {
    var data = new Uint8Array(e.target.value.buffer);
    var count = data[0];
    for (var i = 0; i < count && i < 6; i++) {
      var idx = data[1 + i];
      if (idx < GAN_MOVES.length) _record(GAN_MOVES[idx]);
    }
  }

  // ── Giiker protocol ─────────────────────────────────────────────────────────
  async function _initGiiker() {
    var svc  = await server.getPrimaryService(GIIKER_SVC);
    var char = await svc.getCharacteristic(GIIKER_CHAR);
    await char.startNotifications();
    char.addEventListener('characteristicvaluechanged', _onGiiker);
  }

  function _onGiiker(e) {
    var data = new Uint8Array(e.target.value.buffer);
    if (data.length < 6) return;
    var face = Math.floor(data[4] / 3);
    var dir  = data[4] % 3;
    var idx  = face * 3 + dir;
    if (idx < GIIKER_MOVES.length) _record(GIIKER_MOVES[idx]);
  }

  // ── Move recording + TPS ────────────────────────────────────────────────────
  function _record(move) {
    var elapsed = Math.round(performance.now() - solveStart);
    moveLog.push({ move: move, elapsed: elapsed });

    // Live move display
    var el = document.getElementById('smartcube-moves');
    if (el) {
      var sp = document.createElement('span');
      sp.className   = 'sc-move';
      sp.textContent = move + ' ';
      el.appendChild(sp);
      el.scrollTop = el.scrollHeight;
    }

    _updateTPS();
  }

  function _updateTPS() {
    var el = document.getElementById('sc-tps');
    if (!el || !moveLog.length) return;

    var now       = performance.now();
    var totalSec  = (now - solveStart) / 1000;
    var tpsAll    = totalSec > 0 ? moveLog.length / totalSec : 0;

    // Rolling 5-second window
    var cutoff = now - solveStart - 5000;
    var recent = moveLog.filter(function(m) { return m.elapsed >= cutoff; });
    var tps5   = recent.length / 5;

    el.innerHTML =
      '<span class="sc-tps-val">' + tps5.toFixed(1)   + '</span><span class="sc-tps-label">TPS (5s)</span>' +
      '<span class="sc-tps-sep">&middot;</span>' +
      '<span class="sc-tps-val">' + tpsAll.toFixed(1) + '</span><span class="sc-tps-label">TPS (avg)</span>' +
      '<span class="sc-tps-sep">&middot;</span>' +
      '<span class="sc-tps-val">' + moveLog.length    + '</span><span class="sc-tps-label">moves</span>';
  }

  // ── Solve tracking ──────────────────────────────────────────────────────────
  function startSolve() {
    moveLog    = [];
    solveStart = performance.now();
    solving    = true;
    var ml = document.getElementById('sc-move-label');
    if (ml) ml.style.display = 'block';
    var mo = document.getElementById('smartcube-moves');
    if (mo) mo.innerHTML = '';
    var tps = document.getElementById('sc-tps');
    if (tps) tps.innerHTML = '';
  }

  function endSolve() {
    solving = false;
    var time = Math.round(performance.now() - solveStart);
    return { moves: moveLog.slice(), time: time };
  }

  // ── UI helpers ──────────────────────────────────────────────────────────────
  function _status(msg, state) {
    var el = document.getElementById('smartcube-status');
    if (el) { el.textContent = msg; el.dataset.state = state || 'idle'; }
  }

  function _updateUI(isConn) {
    var cb = document.getElementById('btn-smartcube-connect');
    var db = document.getElementById('btn-smartcube-disconnect');
    if (cb) cb.style.display = isConn ? 'none'  : '';
    if (db) db.style.display = isConn ? '' : 'none';
  }

  function init() {
    // onclick handlers on buttons are in HTML — nothing to bind here
  }

  function isConnected() { return connected; }
  function getMoveLog()  { return moveLog.slice(); }

  window.SmartCube = { init:init, connect:connect, disconnect:disconnect,
    startSolve:startSolve, endSolve:endSolve,
    isConnected:isConnected, getMoveLog:getMoveLog };

})();
