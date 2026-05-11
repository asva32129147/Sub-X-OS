// smartcube.js — Bluetooth Smart Cube Integration
// Supports: GAN (GAN 356i, GAN 12 UI), Giiker i3s, MoYu AI
// Uses Web Bluetooth API (Chrome/Edge only, requires HTTPS or localhost)
// Depends on: utils.js, storage.js

'use strict';

const SmartCube = (() => {
  // ── State ──────────────────────────────────────────────────────────────────
  let device      = null;  // BluetoothDevice
  let server      = null;  // BluetoothRemoteGATTServer
  let cubeType    = null;  // 'gan' | 'giiker' | 'moyu'
  let connected   = false;
  let solving     = false;
  let moveLog     = [];    // [{move, time, ts}]
  let solveStart  = 0;
  let onMoveCallback  = null; // fn(move, moveLog)
  let onSolveCallback = null; // fn(moveLog, time)

  // Cube state (3x3 face representation)
  // Not fully implementing cube state here — tracked by move sequence
  let cubeState = null;

  // ── GAN Service UUIDs ──────────────────────────────────────────────────────
  const GAN_SERVICE    = '0000fff0-0000-1000-8000-00805f9b34fb';
  const GAN_CHAR_READ  = '0000fff5-0000-1000-8000-00805f9b34fb';
  const GAN_CHAR_WRITE = '0000fff6-0000-1000-8000-00805f9b34fb';

  // ── Giiker Service UUIDs ───────────────────────────────────────────────────
  const GIIKER_SERVICE  = '0000aadb-0000-1000-8000-00805f9b34fb';
  const GIIKER_CHAR     = '0000aadc-0000-1000-8000-00805f9b34fb';

  // ── Move tables ───────────────────────────────────────────────────────────
  const GAN_MOVES = [
    'B','B2',"B'", 'D','D2',"D'", 'L','L2',"L'",
    'U','U2',"U'", 'R','R2',"R'", 'F','F2',"F'",
  ];
  const GIIKER_MOVES = [
    'B',"B'",'B2', 'D',"D'",'D2', 'L',"L'",'L2',
    'U',"U'",'U2', 'R',"R'",'R2', 'F',"F'",'F2',
  ];

  // ── Connect ───────────────────────────────────────────────────────────────
  async function connect() {
    if (!navigator.bluetooth) {
      const msg = 'Web Bluetooth is not available in this browser.\n\n' +
        'Use Chrome or Edge on Windows, Mac, or Android.\n' +
        'Safari and Firefox do not support Web Bluetooth.\n\n' +
        'Make sure Bluetooth is turned on in your system settings.';
      _showStatus('Not supported — use Chrome or Edge.', 'error');
      alert(msg);
      return false;
    }

    let deviceSelected = false;
    try {
      _showStatus('Scanning… (select your cube in the popup)', 'info');

      // Request with broad filters so any cube shows up
      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [GAN_SERVICE, GIIKER_SERVICE],
      });
      deviceSelected = true;

      device.addEventListener('gattserverdisconnected', _onDisconnect);
      _showStatus(`Connecting to ${device.name}…`, 'info');

      server = await device.gatt.connect();
      _showStatus(`Identifying ${device.name}…`, 'info');

      // Detect protocol by service availability (don't rely on name)
      const cubeName = (device.name || '').toLowerCase();
      let initOk = false;

      // Try GAN first
      try {
        await _initGAN();
        cubeType = 'gan';
        initOk = true;
      } catch {
        // Not GAN, try Giiker
        try {
          await _initGiiker();
          cubeType = 'giiker';
          initOk = true;
        } catch {
          // Neither matched
        }
      }

      if (!initOk) {
        _showStatus(`Connected to ${device.name} but protocol not recognised.\nOnly GAN and Giiker cubes are supported right now.`, 'error');
        device.gatt.disconnect();
        return false;
      }

      connected = true;
      moveLog   = [];

      // Show move label
      const ml = document.getElementById('sc-move-label');
      if (ml) ml.style.display = 'block';

      _showStatus(`Connected: ${device.name} (${cubeType.toUpperCase()})`, 'connected');
      _updateUI(true);
      return true;

    } catch (err) {
      if (err.name === 'NotFoundError' && !deviceSelected) {
        _showStatus('No cube selected.', 'idle');
      } else if (err.name === 'SecurityError') {
        _showStatus('Permission denied. Try again.', 'error');
      } else if (err.name === 'NetworkError' || err.message?.includes('GATT')) {
        _showStatus('GATT connection failed. Make sure the cube is awake and close by.', 'error');
      } else {
        _showStatus('Connection failed: ' + err.message, 'error');
        console.error('SmartCube connect error:', err);
      }
      device = null;
      return false;
    }
  }

  async function disconnect() {
    if (device?.gatt?.connected) {
      device.gatt.disconnect();
    }
  }

  function _onDisconnect() {
    connected = false;
    server    = null;
    _showStatus('Cube disconnected.', 'idle');
    _updateUI(false);
  }

  // ── GAN init ──────────────────────────────────────────────────────────────
  async function _initGAN() {
    const svc  = await server.getPrimaryService(GAN_SERVICE);
    const char = await svc.getCharacteristic(GAN_CHAR_READ);
    await char.startNotifications();
    char.addEventListener('characteristicvaluechanged', _onGANData);
  }

  function _onGANData(e) {
    const data = new Uint8Array(e.target.value.buffer);
    // GAN protocol: byte 0 = move count, bytes 1+ = move indices
    const count = data[0];
    for (let i = 0; i < count; i++) {
      const moveIdx = data[1 + i];
      if (moveIdx < GAN_MOVES.length) {
        _recordMove(GAN_MOVES[moveIdx]);
      }
    }
  }

  // ── Giiker init ───────────────────────────────────────────────────────────
  async function _initGiiker() {
    const svc  = await server.getPrimaryService(GIIKER_SERVICE);
    const char = await svc.getCharacteristic(GIIKER_CHAR);
    await char.startNotifications();
    char.addEventListener('characteristicvaluechanged', _onGiikerData);
  }

  function _onGiikerData(e) {
    const data = new Uint8Array(e.target.value.buffer);
    // Giiker protocol: 6 bytes per move event
    // byte 4: face*3 + direction (0=CW, 1=CCW, 2=180)
    if (data.length >= 6) {
      const face = Math.floor(data[4] / 3);
      const dir  = data[4] % 3;
      const idx  = face * 3 + dir;
      if (idx < GIIKER_MOVES.length) {
        _recordMove(GIIKER_MOVES[idx]);
      }
    }
  }

  // ── Move recording ────────────────────────────────────────────────────────
  function _recordMove(move) {
    const now = performance.now();
    const entry = { move, time: Math.round(now - (solveStart || now)), ts: Date.now() };
    moveLog.push(entry);

    // Update live move display
    const el = document.getElementById('smartcube-moves');
    if (el) {
      const span = document.createElement('span');
      span.className = 'sc-move';
      span.textContent = move + ' ';
      el.appendChild(span);
      el.scrollTop = el.scrollHeight;
    }

    if (typeof onMoveCallback === 'function') onMoveCallback(move, moveLog);
  }

  // ── Solve tracking ────────────────────────────────────────────────────────
  function startSolve() {
    if (!connected) return;
    solving    = true;
    solveStart = performance.now();
    moveLog    = [];
    const el   = document.getElementById('smartcube-moves');
    if (el) el.innerHTML = '';
  }

  function endSolve() {
    if (!solving) return;
    solving = false;
    const time = Math.round(performance.now() - solveStart);
    if (typeof onSolveCallback === 'function') {
      onSolveCallback([...moveLog], time);
    }
    return { moves: [...moveLog], time };
  }

  function getMoveLog() { return [...moveLog]; }
  function isConnected() { return connected; }
  function getCubeType() { return cubeType; }

  // ── Callbacks ─────────────────────────────────────────────────────────────
  function onMove(fn)  { onMoveCallback  = fn; }
  function onSolve(fn) { onSolveCallback = fn; }

  // ── UI helpers ────────────────────────────────────────────────────────────
  function _showStatus(msg, state) {
    const el = document.getElementById('smartcube-status');
    if (!el) return;
    el.textContent = msg;
    el.dataset.state = state || 'idle';
  }

  function _updateUI(isConnected) {
    const connectBtn    = document.getElementById('btn-smartcube-connect');
    const disconnectBtn = document.getElementById('btn-smartcube-disconnect');
    const panel         = document.getElementById('smartcube-panel');
    if (connectBtn)    connectBtn.style.display    = isConnected ? 'none'  : 'inline-block';
    if (disconnectBtn) disconnectBtn.style.display = isConnected ? 'inline-block' : 'none';
    if (panel)         panel.classList.toggle('connected', isConnected);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    // onclick handlers are attached directly in HTML to avoid timing issues
    // (modal may not be in DOM when init() runs)
  }

  return {
    init, connect, disconnect,
    startSolve, endSolve, getMoveLog,
    isConnected, getCubeType,
    onMove, onSolve,
  };
})();
