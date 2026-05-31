// stackmat.js — Stackmat Timer Input via Web Audio API
// Decodes the Stackmat signal from the 3.5mm headphone jack
// Supports: Gen2, Gen3, Gen4, Pro Timer, Speed Stacks Mats
//
// How it works:
//   Stackmat sends serial data at 1200 baud as audio through the headphone jack.
//   We sample with getUserMedia (microphone), run a ScriptProcessor,
//   decode the UART frames, and fire callbacks when state changes.
//
// Usage:
//   StackmatTimer.onState(fn)  — called with {running, time, leftHand, rightHand}
//   StackmatTimer.start()      — begin listening
//   StackmatTimer.stop()       — stop listening
//
// Depends on: nothing

'use strict';

const StackmatTimer = (() => {
  const BAUD      = 1200;
  const SAMPLE_HZ = 44100;
  const SAMPLES_PER_BIT = Math.round(SAMPLE_HZ / BAUD); // ~36.75

  let audioCtx    = null;
  let source      = null;
  let processor   = null;
  let stream      = null;
  let active      = false;
  let stateCallback = null;

  // State
  let bitBuffer   = [];
  let byteBuffer  = [];
  let lastBit     = 1;
  let sampleCount = 0;
  let bitPhase    = 0;
  let lastState   = null;

  // ── Public API ─────────────────────────────────────────────────────────────
  function onState(fn) { stateCallback = fn; }

  async function start() {
    if (active) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl:  false,
        }
      });
    } catch(e) {
      _error('Microphone access denied. Connect Stackmat to headphone jack and allow microphone access.');
      return;
    }

    audioCtx  = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_HZ });
    source    = audioCtx.createMediaStreamSource(stream);
    processor = audioCtx.createScriptProcessor(512, 1, 1);

    processor.onaudioprocess = _processAudio;
    source.connect(processor);
    processor.connect(audioCtx.destination);

    active = true;
    _updateStatus('Listening for Stackmat signal…', 'info');
  }

  function stop() {
    if (!active) return;
    processor?.disconnect();
    source?.disconnect();
    stream?.getTracks().forEach(t => t.stop());
    audioCtx?.close();
    audioCtx = processor = source = stream = null;
    active = false;
    _updateStatus('Stackmat disconnected.', 'idle');
  }

  function isActive() { return active; }

  // ── Audio processing ────────────────────────────────────────────────────────
  function _processAudio(e) {
    const buf = e.inputBuffer.getChannelData(0);
    for (let i = 0; i < buf.length; i++) {
      // Convert analog signal to digital bit (threshold at 0)
      const bit = buf[i] > 0 ? 1 : 0;

      // Edge detection
      if (bit !== lastBit) {
        bitPhase = 0; // resync to edge
      }
      lastBit = bit;

      // Sample at center of bit
      bitPhase++;
      if (bitPhase === Math.round(SAMPLES_PER_BIT / 2)) {
        bitBuffer.push(bit);
        if (bitBuffer.length === 10) {
          _processByte(bitBuffer);
          bitBuffer = [];
        }
      }
      if (bitPhase >= SAMPLES_PER_BIT) bitPhase = 0;
    }
  }

  function _processByte(bits) {
    // UART: 1 start bit (0), 8 data bits, 1 stop bit (1)
    if (bits[0] !== 0 || bits[9] !== 1) { byteBuffer = []; return; }
    let byte = 0;
    for (let i = 0; i < 8; i++) byte |= bits[i + 1] << i;
    byteBuffer.push(byte);
    if (byteBuffer.length >= 9) _decodePacket(byteBuffer.splice(0, 9));
  }

  // ── Packet decoding ─────────────────────────────────────────────────────────
  // Stackmat packet: 9 bytes
  // [0] status char: ' '=idle, 'I'=idle hands, 'A'=running, 'S'=stopped, 'L'=left, 'R'=right, 'C'=both
  // [1-5] time digits: M mm SS cc (minutes, seconds, centiseconds)
  // [8] checksum
  function _decodePacket(pkt) {
    if (pkt.length < 9) return;

    const status = String.fromCharCode(pkt[0]);
    const digits = pkt.slice(1, 6).map(b => b - 48); // ASCII '0'-'9' → 0-9
    if (digits.some(d => d < 0 || d > 9)) return;

    const minutes = digits[0];
    const seconds = digits[1] * 10 + digits[2];
    const cs      = digits[3] * 10 + digits[4];
    const time    = ((minutes * 60 + seconds) * 100 + cs); // centiseconds

    // Verify checksum (sum of time bytes should equal pkt[8] - 64)
    const checksum = pkt.slice(1, 6).reduce((a, b) => a + b, 0);
    if ((checksum % 256) !== (pkt[7] - 64 + 256) % 256) return;

    const state = {
      status,
      time,
      running:   status === 'A',
      stopped:   status === 'S',
      idle:      status === ' ' || status === 'I',
      leftHand:  status === 'L' || status === 'C',
      rightHand: status === 'R' || status === 'C',
      bothHands: status === 'C',
    };

    // Only fire callback on state change
    if (JSON.stringify(state) !== JSON.stringify(lastState)) {
      lastState = state;
      if (typeof stateCallback === 'function') stateCallback(state);
      _updateDisplay(state);
    }
  }

  // ── UI helpers ──────────────────────────────────────────────────────────────
  function _updateDisplay(state) {
    // Update timer display with Stackmat time
    const display = document.getElementById('timer-display');
    if (!display) return;

    if (state.running) {
      display.dataset.state = 'running';
      display.textContent   = formatTime(state.time);
    } else if (state.stopped) {
      display.dataset.state = 'stopped';
      display.textContent   = formatTime(state.time);
      // Fire solve complete
      if (typeof App !== 'undefined') App.onSolveComplete(state.time, '');
    } else if (state.bothHands) {
      display.dataset.state = 'ready';
      display.textContent   = '0.00';
    } else if (state.leftHand || state.rightHand) {
      display.dataset.state = 'holding';
      display.textContent   = '0.00';
    } else {
      display.dataset.state = 'idle';
    }

    _updateStatus(
      state.running   ? 'Running' :
      state.stopped   ? 'Stopped: ' + formatTime(state.time) :
      state.bothHands ? 'Both hands — release to start' :
      state.leftHand  ? 'Left hand' :
      state.rightHand ? 'Right hand' :
                        'Stackmat connected — hands off',
      state.running ? 'running' : 'connected'
    );
  }

  function _updateStatus(msg, state) {
    const el = document.getElementById('stackmat-status');
    if (el) { el.textContent = msg; el.dataset.state = state || 'idle'; }
    const el2 = document.getElementById('timer-hint');
    if (el2 && active) el2.innerHTML = `Stackmat: <strong>${msg}</strong>`;
  }

  function _error(msg) {
    _updateStatus(msg, 'error');
    alert('Stackmat: ' + msg);
  }

  return { start, stop, isActive, onState };
})();
