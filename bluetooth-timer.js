// bluetooth-timer.js — GAN Smart Timer support
// Protocol from csTimer (cs0x7f/cstimer, GPL-3.0) gantimer.js
// Service: 0000fff0, Read chr: 0000fff2, Write chr: 0000fff3
// State byte in d[0]: 0=idle,1=hands-on,2=ready,3=running,4=finished
// Time in d[1..4] big-endian milliseconds
'use strict';

(function () {
  var SFXB    = '-0000-1000-8000-00805f9b34fb';
  var SVC_UUID = '0000fff0' + SFXB;
  var RD_UUID  = '0000fff2' + SFXB;
  var WR_UUID  = '0000fff3' + SFXB;

  var _device   = null;
  var _gatt     = null;
  var _rdChr    = null;
  var _connected = false;
  var _running   = false;

  function init() {}

  async function connect() {
    if (!navigator.bluetooth) {
      alert('Web Bluetooth requires Chrome or Edge.');
      _status('Not supported.', 'error');
      return;
    }
    _status('Opening Bluetooth picker…', 'info');
    try {
      _device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'GAN' },
          { namePrefix: 'Smart' },
        ],
        optionalServices: [SVC_UUID],
      });
      _device.addEventListener('gattserverdisconnected', _onDisconnect);
      _status('Connecting to ' + (_device.name || 'timer') + '…', 'info');
      _gatt = await _device.gatt.connect();

      var svc  = await _gatt.getPrimaryService(SVC_UUID);
      _rdChr   = await svc.getCharacteristic(RD_UUID);
      var wrChr = await svc.getCharacteristic(WR_UUID);

      await _rdChr.startNotifications();
      _rdChr.addEventListener('characteristicvaluechanged', _onData);

      // Init command from csTimer gantimer.js
      await wrChr.writeValue(new Uint8Array([0x04, 0x00, 0x00, 0x00, 0x00]).buffer);

      _connected = true;
      _status('Connected: ' + (_device.name || 'GAN Smart Timer'), 'connected');
      _updateBtn(true);
    } catch (e) {
      if (e.name === 'NotFoundError') { _status('No timer selected.', 'idle'); }
      else { _status('Connect failed: ' + (e.message || e.name), 'error'); console.error('[BluetoothTimer]', e); }
    }
  }

  function _onData(e) {
    var d = new Uint8Array(e.target.value.buffer);
    var state = d[0];
    if (state === 3 && !_running) {
      _running = true;
      if (typeof Timer !== 'undefined' && Timer._externalStart) Timer._externalStart();
    } else if ((state === 4 || state === 0) && _running) {
      _running = false;
      // d[1..4] big-endian milliseconds — from csTimer gantimer.js
      var ms = (d[1] << 24 | d[2] << 16 | d[3] << 8 | d[4]) >>> 0;
      if (typeof Timer !== 'undefined' && Timer._externalStop) Timer._externalStop(ms > 0 ? ms : null);
    }
  }

  function disconnect() {
    _running = false;
    try {
      if (_rdChr) { _rdChr.stopNotifications().catch(function(){}); _rdChr.removeEventListener('characteristicvaluechanged', _onData); }
      if (_gatt && _gatt.connected) _gatt.disconnect();
    } catch (e) {}
    _onDisconnect();
  }

  function _onDisconnect() {
    _connected = false; _running = false;
    _status('Timer disconnected.', 'idle');
    _updateBtn(false);
  }

  function _status(msg, state) {
    var el = document.getElementById('bttimer-status');
    if (el) { el.textContent = msg; el.dataset.state = state || 'idle'; }
  }
  function _updateBtn(isConn) {
    var cb = document.getElementById('btn-bttimer-connect');
    var db = document.getElementById('btn-bttimer-disconnect');
    if (cb) cb.style.display = isConn ? 'none' : '';
    if (db) db.style.display = isConn ? '' : 'none';
  }

  function isConnected() { return _connected; }

  window.BluetoothTimer = { init: init, connect: connect, disconnect: disconnect, isConnected: isConnected };
})();
