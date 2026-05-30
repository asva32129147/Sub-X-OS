// smartcube.js — Bluetooth Smart Cube
// Input mode: set via Settings → Input Mode → Smart Cube
// Training: accessible from Alg Trainer
// NOT a separate sidebar tab
// Supports: GAN new (i3/i4), GAN old (356i), Giiker i3s
'use strict';

(function () {
  var GAN_OLD_SVC  = '0000fff0-0000-1000-8000-00805f9b34fb';
  var GAN_OLD_RD   = '0000fff5-0000-1000-8000-00805f9b34fb';
  var GAN_NEW_SVC  = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
  var GAN_NEW_TX   = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
  var GAN_NEW_RX   = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
  var GIIKER_SVC   = '0000aadb-0000-1000-8000-00805f9b34fb';
  var GIIKER_CHAR  = '0000aadc-0000-1000-8000-00805f9b34fb';

  var GAN_MOVES    = ['B','B2',"B'",'D','D2',"D'",'L','L2',"L'",'U','U2',"U'",'R','R2',"R'",'F','F2',"F'"];
  var GIIKER_MOVES = ['B',"B'",'B2','D',"D'",'D2','L',"L'",'L2','U',"U'",'U2','R',"R'",'R2','F',"F'",'F2'];

  var device    = null;
  var server    = null;
  var protocol  = null;
  var connected = false;
  var moveLog   = [];
  var solveStart= 0;

  // ── Public API ─────────────────────────────────────────────────────────────
  function init() {}  // onclick handlers in HTML — nothing to bind here

  async function connect() {
    if (!navigator.bluetooth) {
      alert('Web Bluetooth requires Chrome or Edge.\nSafari and Firefox are not supported.');
      _status('Not supported. Use Chrome or Edge.', 'error');
      return;
    }

    var picked = false;
    try {
      _status('Opening Bluetooth picker…', 'info');
      device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'GAN' }, { namePrefix: 'Gan' },
          { namePrefix: 'MG'  }, { namePrefix: 'Giiker' },
          { namePrefix: 'QY'  }, { namePrefix: 'MHC' },
          { namePrefix: 'GoCube' },
        ],
        optionalServices: [GAN_OLD_SVC, GAN_NEW_SVC, GIIKER_SVC],
      });
      picked = true;

      device.addEventListener('gattserverdisconnected', _onDisconnect);
      _status('Connecting to ' + device.name + '…', 'info');
      server = await device.gatt.connect();
      _status('Identifying ' + device.name + '…', 'info');

      // Try protocols: GAN new → GAN old → Giiker
      var ok = false;
      if (!ok) { try { await _initGANNew(); protocol = 'GAN (new)'; ok = true; } catch(e) {} }
      if (!ok) { try { await _initGANOld(); protocol = 'GAN (old)'; ok = true; } catch(e) {} }
      if (!ok) { try { await _initGiiker(); protocol = 'Giiker';    ok = true; } catch(e) {} }

      if (!ok) {
        _status('Connected to ' + device.name + ' but protocol not recognised. Only GAN and Giiker cubes are supported.', 'error');
        if (device.gatt.connected) device.gatt.disconnect();
        return;
      }

      connected  = true;
      moveLog    = [];
      solveStart = performance.now();
      _status('Connected: ' + device.name + ' · ' + protocol, 'connected');
      _showMoveSection(true);
      _updateConnectBtn(true);

    } catch (e) {
      if (!picked && e.name === 'NotFoundError') {
        _status('No cube selected.', 'idle');
      } else if (e.name === 'NetworkError') {
        _status('GATT error — make sure the cube is awake and close by, then retry.', 'error');
      } else if (e.name === 'SecurityError') {
        _status('Bluetooth permission denied.', 'error');
      } else {
        _status('Error: ' + (e.message || e.name), 'error');
        console.error('SmartCube connect:', e);
      }
      device = null;
    }
  }

  function disconnect() {
    try { if (device && device.gatt.connected) device.gatt.disconnect(); } catch(e) {}
  }

  function _onDisconnect() {
    connected = false;
    _status('Cube disconnected.', 'idle');
    _showMoveSection(false);
    _updateConnectBtn(false);
  }

  // ── GAN new (i3, i4, Carry S) ───────────────────────────────────────────────
  async function _initGANNew() {
    var svc = await server.getPrimaryService(GAN_NEW_SVC);
    var tx  = await svc.getCharacteristic(GAN_NEW_TX);
    await tx.startNotifications();
    tx.addEventListener('characteristicvaluechanged', _onGANNew);
    try {
      var rx = await svc.getCharacteristic(GAN_NEW_RX);
      await rx.writeValue(new Uint8Array([0x01, 0x01]));
    } catch(e) {}
  }
  function _onGANNew(e) {
    var d = new Uint8Array(e.target.value.buffer);
    if (d[0] === 0x02 && d.length >= 2 && d[1] < GAN_MOVES.length) {
      _record(GAN_MOVES[d[1]]);
    }
  }

  // ── GAN old (356i, 354M) ────────────────────────────────────────────────────
  async function _initGANOld() {
    var svc  = await server.getPrimaryService(GAN_OLD_SVC);
    var char = await svc.getCharacteristic(GAN_OLD_RD);
    await char.startNotifications();
    char.addEventListener('characteristicvaluechanged', _onGANOld);
  }
  function _onGANOld(e) {
    var d = new Uint8Array(e.target.value.buffer);
    for (var i = 0; i < (d[0] || 0) && i < 6; i++) {
      if (d[1 + i] < GAN_MOVES.length) _record(GAN_MOVES[d[1 + i]]);
    }
  }

  // ── Giiker i3s ──────────────────────────────────────────────────────────────
  async function _initGiiker() {
    var svc  = await server.getPrimaryService(GIIKER_SVC);
    var char = await svc.getCharacteristic(GIIKER_CHAR);
    await char.startNotifications();
    char.addEventListener('characteristicvaluechanged', _onGiiker);
  }
  function _onGiiker(e) {
    var d   = new Uint8Array(e.target.value.buffer);
    if (d.length < 6) return;
    var idx = d[4];
    if (idx < GIIKER_MOVES.length) _record(GIIKER_MOVES[idx]);
  }

  // ── Move recording ──────────────────────────────────────────────────────────
  function _record(move) {
    var elapsed = Math.round(performance.now() - solveStart);
    moveLog.push({ move: move, elapsed: elapsed });

    var el = document.getElementById('smartcube-moves');
    if (el) {
      var sp = document.createElement('span');
      sp.className = 'sc-move';
      sp.textContent = move + ' ';
      el.appendChild(sp);
      el.scrollTop = el.scrollHeight;
    }
    _updateTPS();
  }

  // ── TPS display ─────────────────────────────────────────────────────────────
  function _updateTPS() {
    var el = document.getElementById('sc-tps');
    if (!el || !moveLog.length) return;
    var now      = performance.now();
    var totalSec = (now - solveStart) / 1000;
    var tpsAll   = totalSec > 0.1 ? (moveLog.length / totalSec) : 0;
    // 5-second rolling window
    var cut5 = now - solveStart - 5000;
    var n5   = moveLog.filter(function(m) { return m.elapsed >= cut5; }).length;
    var tps5 = n5 / 5;
    el.innerHTML =
      '<span class="sc-tps-val">' + tps5.toFixed(1)   + '</span><span class="sc-tps-label"> TPS (5s)</span>' +
      ' <span class="sc-tps-sep">&middot;</span> ' +
      '<span class="sc-tps-val">' + tpsAll.toFixed(1) + '</span><span class="sc-tps-label"> TPS (avg)</span>' +
      ' <span class="sc-tps-sep">&middot;</span> ' +
      '<span class="sc-tps-val">' + moveLog.length    + '</span><span class="sc-tps-label"> moves</span>';
  }

  // ── Solve tracking ──────────────────────────────────────────────────────────
  function startSolve() {
    moveLog    = [];
    solveStart = performance.now();
    var el = document.getElementById('smartcube-moves');
    if (el) el.innerHTML = '';
    var tps = document.getElementById('sc-tps');
    if (tps) tps.innerHTML = '';
  }

  function endSolve() {
    return { moves: moveLog.slice(), time: Math.round(performance.now() - solveStart) };
  }

  // ── UI helpers ──────────────────────────────────────────────────────────────
  function _status(msg, state) {
    var el = document.getElementById('smartcube-status');
    if (el) { el.textContent = msg; el.dataset.state = state || 'idle'; }
  }
  function _updateConnectBtn(isConn) {
    var cb = document.getElementById('btn-smartcube-connect');
    var db = document.getElementById('btn-smartcube-disconnect');
    if (cb) cb.style.display = isConn ? 'none' : '';
    if (db) db.style.display = isConn ? '' : 'none';
  }
  function _showMoveSection(show) {
    var ml = document.getElementById('sc-move-label');
    if (ml) ml.style.display = show ? 'block' : 'none';
  }

  function isConnected() { return connected; }
  function getMoveLog()  { return moveLog.slice(); }

  window.SmartCube = {
    init: init, connect: connect, disconnect: disconnect,
    startSolve: startSolve, endSolve: endSolve,
    isConnected: isConnected, getMoveLog: getMoveLog,
  };
})();
