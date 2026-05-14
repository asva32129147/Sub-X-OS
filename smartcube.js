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
  // GAN old protocol (356i, 354M, etc.)
  const GAN_SERVICE    = '0000fff0-0000-1000-8000-00805f9b34fb';
  const GAN_CHAR_READ  = '0000fff5-0000-1000-8000-00805f9b34fb';
  const GAN_CHAR_WRITE = '0000fff6-0000-1000-8000-00805f9b34fb';
  // GAN new protocol (i3, i4, i Carry S, 12 ui — uses Nordic UART style)
  const GAN_SERVICE_NEW  = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
  const GAN_CHAR_NEW_RX  = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
  const GAN_CHAR_NEW_TX  = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
  // GAN Smart Timer BLE (Halo timer)
  const GAN_TIMER_SVC    = '0000aaaa-0000-1000-8000-00805f9b34fb';
  const GAN_TIMER_CHAR   = '0000bbbb-0000-1000-8000-00805f9b34fb';

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

      // Use name-prefix filters to show only cubing devices (like csTimer)
      device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'GAN' },
          { namePrefix: 'Gan' },
          { namePrefix: 'MG' },       // MoYu MGC
          { namePrefix: 'Giiker' },
          { namePrefix: 'QY' },       // QiYi cubes
          { namePrefix: 'MHC' },      // MoYu HRS
          { namePrefix: 'GoCube' },
          { namePrefix: 'Rubiks' },
        ],
        optionalServices: [
          GAN_SERVICE,
          GAN_SERVICE_NEW,
          GAN_TIMER_SVC,
          GIIKER_SERVICE,
        ],
      });
      deviceSelected = true;

      device.addEventListener('gattserverdisconnected', _onDisconnect);
      _showStatus(`Connecting to ${device.name}…`, 'info');

      server = await device.gatt.connect();
      _showStatus(`Identifying ${device.name}…`, 'info');

      // Detect protocol by service availability (don't rely on name)
      const cubeName = (device.name || '').toLowerCase();
      let initOk = false;

      // Try GAN new protocol first (i3, i4, newer cubes)
      try {
        await _initGANNew();
        cubeType = 'gan-new';
        initOk = true;
      } catch {
        // Try old GAN protocol (356i, older)
        try {
          await _initGAN();
          cubeType = 'gan';
          initOk = true;
        } catch {
          // Try Giiker
          try {
            await _initGiiker();
            cubeType = 'giiker';
            initOk = true;
          } catch {
            // No protocol matched
          }
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
  async function _initGANNew() {
    // GAN i3/i4/Carry S/12 ui — Nordic UART-style protocol
    const svc  = await server.getPrimaryService(GAN_SERVICE_NEW);
    const tx   = await svc.getCharacteristic(GAN_CHAR_NEW_TX);
    await tx.startNotifications();
    tx.addEventListener('characteristicvaluechanged', _onGANNewData);
    // Request cube state
    const rx = await svc.getCharacteristic(GAN_CHAR_NEW_RX);
    await rx.writeValue(new Uint8Array([0x01, 0x01]));
  }

  function _onGANNewData(e) {
    const data = new Uint8Array(e.target.value.buffer);
    // New GAN protocol: byte 0 = command type
    // 0x02 = move event, data[1] = face+direction
    if (data[0] === 0x02 && data.length >= 2) {
      const moveIdx = data[1];
      if (moveIdx < GAN_MOVES.length) {
        _recordMove(GAN_MOVES[moveIdx]);
      }
    }
    // 0x04 = state sync (full cube state)
    // For now just record moves — state reconstruction can be added later
  }

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
  let _tpsRaf = null;

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

    _updateTPS();
    if (typeof onMoveCallback === 'function') onMoveCallback(move, moveLog);
  }

  // ── TPS (Turns Per Second) ────────────────────────────────────────────────
  function _updateTPS() {
    const el = document.getElementById('sc-tps');
    if (!el || !moveLog.length) return;

    const now = performance.now();
    // TPS over last 3 seconds (rolling window)
    const window3s = moveLog.filter(m => now - (solveStart + m.time) < 3000);
    const tps3 = window3s.length / 3;

    // TPS over full solve
    const elapsed = solving ? (now - solveStart) / 1000 : (moveLog.length ? moveLog[moveLog.length-1].time / 1000 : 1);
    const tpsTotal = moveLog.length / Math.max(elapsed, 0.1);

    el.innerHTML = `
      <span class="sc-tps-val">${tps3.toFixed(1)}</span>
      <span class="sc-tps-label">TPS (3s)</span>
      <span class="sc-tps-sep">·</span>
      <span class="sc-tps-val">${tpsTotal.toFixed(1)}</span>
      <span class="sc-tps-label">TPS (avg)</span>
      <span class="sc-tps-sep">·</span>
      <span class="sc-tps-val">${moveLog.length}</span>
      <span class="sc-tps-label">moves</span>`;
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
