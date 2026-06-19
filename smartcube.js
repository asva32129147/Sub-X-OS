// smartcube.js — Bluetooth Smart Cube + GAN Smart Timer
// Protocol ported from csTimer by Shuang Chen (cs0x7f/cstimer, GPL-3.0)
// with reference to AlphaSheep/smartcube-3style gist (also adapted from csTimer)
// AES-128 keys pre-decoded (originally LZString-compressed in csTimer source)
// Supports: GAN v1 (0000fff0), GAN v2 (6e400001..4179), Giiker, GAN Smart Timer
'use strict';

(function () {

  // ── AES-128 (ported from csTimer, GPL-3.0) ─────────────────────────────────
  var _aesCache = null;
  function createAES(key) {
    var Sbox = [99,124,119,123,242,107,111,197,48,1,103,43,254,215,171,118,202,130,201,125,250,89,71,240,173,212,162,175,156,164,114,192,183,253,147,38,54,63,247,204,52,165,229,241,113,216,49,21,4,199,35,195,24,150,5,154,7,18,128,226,235,39,178,117,9,131,44,26,27,110,90,160,82,59,214,179,41,227,47,132,83,209,0,237,32,252,177,91,106,203,190,57,74,76,88,207,208,239,170,251,67,77,51,133,69,249,2,127,80,60,159,168,81,163,64,143,146,157,56,245,188,182,218,33,16,255,243,210,205,12,19,236,95,151,68,23,196,167,126,61,100,93,25,115,96,129,79,220,34,42,144,136,70,238,184,20,222,94,11,219,224,50,58,10,73,6,36,92,194,211,172,98,145,149,228,121,231,200,55,109,141,213,78,169,108,86,244,234,101,122,174,8,186,120,37,46,28,166,180,198,232,221,116,31,75,189,139,138,112,62,181,102,72,3,246,14,97,53,87,185,134,193,29,158,225,248,152,17,105,217,142,148,155,30,135,233,206,85,40,223,140,161,137,13,191,230,66,104,65,153,45,15,176,84,187,22];
    var SboxI = [], xtime = [], ShiftTabI = [0,13,10,7,4,1,14,11,8,5,2,15,12,9,6,3];
    for (var i = 0; i < 256; i++) SboxI[Sbox[i]] = i;
    for (var i = 0; i < 128; i++) { xtime[i] = i << 1; xtime[128+i] = (i<<1)^0x1b; }
    var exKey = key.slice(), Rcon = 1;
    for (var i = 16; i < 176; i += 4) {
      var tmp = exKey.slice(i-4,i);
      if (i%16===0) { tmp=[Sbox[tmp[1]]^Rcon,Sbox[tmp[2]],Sbox[tmp[3]],Sbox[tmp[0]]]; Rcon=xtime[Rcon]; }
      for (var j = 0; j < 4; j++) exKey[i+j] = exKey[i+j-16]^tmp[j];
    }
    function addRK(s,k,o) { for(var i=0;i<16;i++) s[i]^=k[o+i]; }
    function shiftSubAdd(s,k,o) { var s0=s.slice(); for(var i=0;i<16;i++) s[i]=SboxI[s0[ShiftTabI[i]]]^k[o+i]; }
    function shiftSubAddI(s,k,o) { var s0=s.slice(); for(var i=0;i<16;i++) s[ShiftTabI[i]]=Sbox[s0[i]^k[o+i]]; }
    function mixCol(s) { for(var i=12;i>=0;i-=4){var a=s[i],b=s[i+1],c=s[i+2],d=s[i+3],h=a^b^c^d;s[i]^=h^xtime[a^b];s[i+1]^=h^xtime[b^c];s[i+2]^=h^xtime[c^d];s[i+3]^=h^xtime[d^a];} }
    function mixColI(s) { for(var i=0;i<16;i+=4){var a=s[i],b=s[i+1],c=s[i+2],d=s[i+3],h=a^b^c^d,xh=xtime[h],h1=xtime[xtime[xh^a^c]]^h,h2=xtime[xtime[xh^b^d]]^h;s[i]^=h1^xtime[a^b];s[i+1]^=h2^xtime[b^c];s[i+2]^=h1^xtime[c^d];s[i+3]^=h2^xtime[d^a];} }
    return {
      decrypt: function(b) { addRK(b,exKey,160); for(var i=144;i>=16;i-=16){shiftSubAdd(b,exKey,i);mixColI(b);} shiftSubAdd(b,exKey,0); return b; },
      encrypt: function(b) { shiftSubAddI(b,exKey,0); for(var i=16;i<160;i+=16){mixCol(b);shiftSubAddI(b,exKey,i);} addRK(b,exKey,160); return b; }
    };
  }

  // ── Pre-decoded GAN encryption keys (from csTimer via LZString) ───────────
  // KEY0+KEY1 = v1 keys (indexed by firmware version byte)
  // KEY2+KEY3 = v2 key+iv for AiCube=0
  // KEY4+KEY5 = v2 key+iv for AiCube=1
  var GAN_KEYS = [
    [198,202,21,223,79,110,19,182,119,13,230,89,58,175,186,162],
    [67,226,91,214,125,220,120,216,7,96,163,218,130,60,1,241],
    [1,2,66,40,49,145,22,7,32,5,24,84,66,17,18,83],
    [17,3,50,40,33,1,118,39,32,149,120,20,50,18,2,67],
    [5,18,2,69,2,1,41,86,18,120,18,118,129,1,8,3],
    [1,68,40,6,134,33,34,40,81,5,8,49,130,2,33,6]
  ];

  // ── Service / characteristic UUIDs ───────────────────────────────────────────
  var SFXB = '-0000-1000-8000-00805f9b34fb';
  // GAN v1
  var GAN_META  = '0000180a'+SFXB, GAN_VER  = '00002a28'+SFXB, GAN_HW = '00002a23'+SFXB;
  var GAN_DATA  = '0000fff0'+SFXB, GAN_F2   = '0000fff2'+SFXB, GAN_F5 = '0000fff5'+SFXB;
  var GAN_F6    = '0000fff6'+SFXB, GAN_F7   = '0000fff7'+SFXB;
  // GAN v2
  var GAN_V2SVC = '6e400001-b5a3-f393-e0a9-e50e24dc4179';
  var GAN_V2RD  = '28be4cb6-cd67-11e9-a32f-2a2ae2dbcce4';
  var GAN_V2WR  = '28be4a4a-cd67-11e9-a32f-2a2ae2dbcce4';
  // GAN Smart Timer
  var TIMER_SVC = '0000fff0-0000-1000-8000-00805f9b34fb'; // csTimer gantimer.js
  var TIMER_RD  = '0000fff2-0000-1000-8000-00805f9b34fb';
  var TIMER_WR  = '0000fff3-0000-1000-8000-00805f9b34fb';
  // Giiker
  var GII_SVC   = '0000aadb'+SFXB, GII_CHR = '0000aadc'+SFXB;
  var GII_MOVES = ['B',"B'",'B2','D',"D'",'D2','L',"L'",'L2','U',"U'",'U2','R',"R'",'R2','F',"F'",'F2'];
  var SOLVED    = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';

  // ── State ─────────────────────────────────────────────────────────────────
  var _device=null, _gatt=null, _decoder=null, _deviceMac=null, _deviceName=null;
  var _svcMeta=null, _svcData=null, _svcV2=null;
  var _f2=null, _f5=null, _f6=null, _f7=null, _v2rd=null, _v2wr=null;
  var _giiChar=null;
  var _protocol=null; // 'gan_v1'|'gan_v2'|'giiker'|'timer'
  var _connected=false;
  var _moveLog=[], _solveStart=0;
  var _prevMoveCnt=-1, _moveCnt=-1, _prevMoves=[], _timeOffs=[];
  var _latestFacelet=SOLVED, _deviceTime=0, _deviceTimeOfs=0, _movesFromCheck=1000;
  var _loopActive=false;

  function init() {}

  // ── Public connect ─────────────────────────────────────────────────────────
  async function connect() {
    if (!navigator.bluetooth) { alert('Web Bluetooth requires Chrome or Edge.'); return; }
    _status('Choose cube family…', 'info');
    var choice = confirm('Click OK for GAN cube / Smart Timer\nClick Cancel for Giiker / Mi Smart Cube');
    if (choice) {
      await _connectGAN();
    } else {
      await _connectGiiker();
    }
  }

  // ── GAN connect ──────────────────────────────────────────────────────────
  async function _connectGAN() {
    try {
      _status('Opening Bluetooth picker…', 'info');
      _device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [GAN_META, GAN_DATA, GAN_V2SVC, TIMER_SVC]
      });
      _device.addEventListener('gattserverdisconnected', _onDisconnect);
      _deviceName = _device.name || 'GAN Cube';
      _status('Connecting to ' + _deviceName + '…', 'info');

      // Try to auto-detect MAC via advertisement scan
      _deviceMac = await _waitForMAC(_device).catch(() => null);
      if (!_deviceMac) {
        var saved = _loadMAC(_deviceName);
        if (saved) {
          _deviceMac = saved;
        } else {
          _deviceMac = prompt(
            'Enter MAC address of ' + _deviceName + '\n(found in CubeStation or chrome://bluetooth-internals)',
            'XX:XX:XX:XX:XX:XX'
          );
          if (_deviceMac && /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(_deviceMac)) {
            _saveMAC(_deviceName, _deviceMac);
          } else {
            _deviceMac = null;
          }
        }
      } else {
        _saveMAC(_deviceName, _deviceMac);
      }

      _gatt = await _device.gatt.connect();
      var services = await _gatt.getPrimaryServices();
      for (var s of services) {
        var u = s.uuid.toLowerCase();
        if (u === GAN_META.toLowerCase()) _svcMeta = s;
        else if (u === GAN_DATA.toLowerCase()) _svcData = s;
        else if (u === GAN_V2SVC.toLowerCase()) _svcV2 = s;
        else if (u === TIMER_SVC.toLowerCase()) { await _initGANTimer(s); return; }
      }
      if (_svcV2) {
        await _initGANv2(_deviceName.startsWith('AiCube') ? 1 : 0);
      } else if (_svcData && _svcMeta) {
        await _initGANv1();
      } else {
        _status('GAN protocol not recognised for ' + _deviceName, 'error');
        return;
      }
      _onConnected('GAN');
    } catch (e) {
      if (e.name === 'NotFoundError') { _status('No device selected.', 'idle'); }
      else { _status('Connect failed: ' + (e.message||e.name), 'error'); console.error('[SmartCube GAN]', e); }
    }
  }

  // ── GAN v1 init ──────────────────────────────────────────────────────────
  async function _initGANv1() {
    var verChr = await _svcMeta.getCharacteristic(GAN_VER);
    var verVal = await verChr.readValue();
    var version = (verVal.getUint8(0)<<16)|(verVal.getUint8(1)<<8)|verVal.getUint8(2);
    _decoder = null;
    if (version > 0x010007 && (version & 0xfffe00) === 0x010000) {
      var hwChr = await _svcMeta.getCharacteristic(GAN_HW);
      var hwVal = await hwChr.readValue();
      var keyIdx = (version>>8) & 0xff;
      var baseKey = GAN_KEYS[keyIdx] ? GAN_KEYS[keyIdx].slice() : GAN_KEYS[0].slice();
      for (var i = 0; i < 6; i++) baseKey[i] = (baseKey[i] + hwVal.getUint8(5-i)) & 0xff;
      _decoder = createAES(baseKey);
    }
    var chrcts = await _svcData.getCharacteristics();
    for (var c of chrcts) {
      var u = c.uuid.toLowerCase();
      if (u===GAN_F2.toLowerCase()) _f2=c;
      else if (u===GAN_F5.toLowerCase()) _f5=c;
      else if (u===GAN_F6.toLowerCase()) _f6=c;
      else if (u===GAN_F7.toLowerCase()) _f7=c;
    }
    _protocol = 'gan_v1'; _loopActive = true; _ganV1Loop();
  }

  // ── GAN v2 init ──────────────────────────────────────────────────────────
  async function _initGANv2(ver) {
    if (_deviceMac) {
      _v2initDecoder(_deviceMac, ver);
    } else {
      _status('MAC needed for GAN v2.', 'error'); return;
    }
    var chrcts = await _svcV2.getCharacteristics();
    for (var c of chrcts) {
      if (c.uuid.toLowerCase()===GAN_V2RD.toLowerCase()) _v2rd=c;
      else if (c.uuid.toLowerCase()===GAN_V2WR.toLowerCase()) _v2wr=c;
    }
    await _v2rd.startNotifications();
    _v2rd.addEventListener('characteristicvaluechanged', _onV2Data);
    _protocol = 'gan_v2';
    await _v2send(5); // request hardware info
    await _v2send(4); // request facelets
  }

  function _v2initDecoder(mac, ver) {
    var v = mac.split(/[:-]/).map(function(h){return parseInt(h,16);});
    var key = GAN_KEYS[2+ver*2].slice(), iv = GAN_KEYS[3+ver*2].slice();
    for (var i = 0; i < 6; i++) { key[i]=(key[i]+v[5-i])%255; iv[i]=(iv[i]+v[5-i])%255; }
    _decoder = createAES(key);
    _decoder.iv = iv;
  }

  async function _v2send(opcode) {
    if (!_v2wr) return;
    var req = new Array(20).fill(0); req[0] = opcode;
    var enc = _ganEncode(req.slice());
    await _v2wr.writeValue(new Uint8Array(enc).buffer);
  }

  // ── GAN decode/encode ─────────────────────────────────────────────────────
  function _ganDecode(value) {
    var ret = [];
    for (var i = 0; i < value.byteLength; i++) ret[i] = value.getUint8(i);
    if (!_decoder) return ret;
    var iv = _decoder.iv || [];
    if (ret.length > 16) {
      var off = ret.length-16, block = _decoder.decrypt(ret.slice(off));
      for (var i = 0; i < 16; i++) ret[i+off] = block[i]^(~~iv[i]);
    }
    _decoder.decrypt(ret);
    for (var i = 0; i < 16; i++) ret[i]^=(~~iv[i]);
    return ret;
  }
  function _ganEncode(ret) {
    if (!_decoder) return ret;
    var iv = _decoder.iv || [];
    for (var i = 0; i < 16; i++) ret[i]^=(~~iv[i]);
    _decoder.encrypt(ret);
    if (ret.length > 16) {
      var off = ret.length-16, block = ret.slice(off);
      for (var i = 0; i < 16; i++) block[i]^=(~~iv[i]);
      _decoder.encrypt(block);
      for (var i = 0; i < 16; i++) ret[i+off]=block[i];
    }
    return ret;
  }

  // ── GAN v1 polling loop (ported from csTimer loopRead) ───────────────────
  async function _ganV1Loop() {
    if (!_loopActive || !_device) return;
    try {
      var val = _ganDecode(await _f5.readValue());
      var locTime = Date.now();
      _moveCnt = val[12];
      if (_moveCnt !== _prevMoveCnt) {
        _prevMoves = [];
        for (var i = 0; i < 6; i++) { var m=val[13+i]; _prevMoves.unshift('URFDLB'.charAt(~~(m/3))+' 2\''.charAt(m%3)); }
        var f6val = _ganDecode(await _f6.readValue());
        _timeOffs = [];
        for (var i = 0; i < 9; i++) _timeOffs.unshift(f6val[i*2+1]|f6val[i*2+2]<<8);
        _updateMoveTimes(locTime);
      }
    } catch(e) { if (_loopActive) console.warn('[SmartCube v1 loop]', e.message); }
    if (_loopActive) setTimeout(_ganV1Loop, 150);
  }

  // ── GAN v2 notification handler ───────────────────────────────────────────
  function _onV2Data(e) {
    var val = _ganDecode(e.target.value);
    var bits = val.map(function(b){return (b+256).toString(2).slice(1);}).join('');
    var mode = parseInt(bits.slice(0,4),2);
    var locTime = Date.now();
    if (mode===2) { // move event
      _moveCnt = parseInt(bits.slice(4,12),2);
      if (_moveCnt===_prevMoveCnt) return;
      if (_prevMoveCnt===-1) { _prevMoveCnt=_moveCnt; return; }
      _timeOffs=[]; _prevMoves=[];
      for (var i=0;i<7;i++) {
        var m=parseInt(bits.slice(12+i*5,17+i*5),2);
        _timeOffs[i]=parseInt(bits.slice(47+i*16,63+i*16),2);
        _prevMoves[i]='URFDLB'.charAt(m>>1)+' \''.charAt(m&1);
      }
      _updateMoveTimes(locTime);
    } else if (mode===4) { // facelet state
      _moveCnt = parseInt(bits.slice(4,12),2);
      if (_moveCnt!==_prevMoveCnt && _prevMoveCnt!==-1) return;
      // Parse corner/edge to facelet string
      var fl = _v2BitsToFacelet(bits);
      if (!fl) return;
      _latestFacelet = fl;
      if (_prevMoveCnt===-1) { _prevMoveCnt=_moveCnt; _checkSolved(_latestFacelet); }
    }
  }

  function _v2BitsToFacelet(bits) {
    // Simplified: just check if matches solved (full cubie math is in csTimer mathlib)
    // For our purposes, we fire solved detection via the facelet string check
    try {
      var faceMap = 'URFDLB';
      var corners=[],edges=[],echk=0,cchk=0xf00;
      for (var i=0;i<7;i++) {
        var perm=parseInt(bits.slice(12+i*3,15+i*3),2), ori=parseInt(bits.slice(33+i*2,35+i*2),2);
        cchk-=ori<<3; cchk^=perm; corners[i]={perm,ori};
      }
      var cp8=(cchk&0xff8)%24, co8=cchk&0x7; corners[7]={perm:cp8,ori:co8};
      for (var i=0;i<11;i++) {
        var perm=parseInt(bits.slice(47+i*4,51+i*4),2), ori=parseInt(bits.slice(91+i,92+i),2);
        echk^=perm<<1|ori; edges[i]={perm,ori};
      }
      edges[11]={perm:echk>>1,ori:echk&1};
      // Fire the move records from prevMoves — actual facelet maths would need csTimer's mathlib
      // For now, trust the move-based solved detection in _updateMoveTimes / VirtualCube
      return null; // we return null and rely on move tracking for solved-check
    } catch(e) { return null; }
  }

  // ── csTimer-style move time reconstruction ──────────────────────────────────
  function _updateMoveTimes(locTime) {
    var diff = (_moveCnt - _prevMoveCnt) & 0xff;
    _prevMoveCnt = _moveCnt;
    if (diff > _prevMoves.length) diff = _prevMoves.length;
    var calcTs = _deviceTime + _deviceTimeOfs;
    for (var i=diff-1;i>=0;i--) calcTs+=_timeOffs[i];
    if (!_deviceTime || Math.abs(locTime-calcTs)>2000) _deviceTime+=locTime-calcTs;
    for (var i=diff-1;i>=0;i--) {
      _deviceTime+=_timeOffs[i];
      _record(_prevMoves[i].trim()); // trim the trailing space/prime
    }
    _deviceTimeOfs = locTime-_deviceTime;
  }

  // ── Giiker connect ─────────────────────────────────────────────────────────
  async function _connectGiiker() {
    try {
      _status('Opening Bluetooth picker…', 'info');
      _device = await navigator.bluetooth.requestDevice({
        filters:[{namePrefix:'Gi'},{namePrefix:'Mi Smart'}],
        optionalServices:[GII_SVC]
      });
      _device.addEventListener('gattserverdisconnected', _onDisconnect);
      _deviceName = _device.name || 'Giiker';
      _gatt = await _device.gatt.connect();
      var svc = await _gatt.getPrimaryService(GII_SVC);
      _giiChar = await svc.getCharacteristic(GII_CHR);
      await _giiChar.startNotifications();
      await _giiChar.readValue(); // read initial state
      _giiChar.addEventListener('characteristicvaluechanged', _onGiiData);
      _protocol = 'giiker';
      _onConnected('Giiker');
    } catch(e) {
      if (e.name==='NotFoundError') _status('No device selected.', 'idle');
      else { _status('Connect failed: '+(e.message||e.name), 'error'); console.error('[SmartCube Giiker]', e); }
    }
  }

  function _onGiiData(e) {
    var d = new Uint8Array(e.target.value.buffer);
    if (d.length < 6) return;
    // Giiker newer models encrypt with simple key
    if (d[18] === 0xa7) {
      var key = [176,81,104,224,86,137,237,119,38,26,193,161,210,126,150,81,93,13,236,249,89,235,88,24,113,81,214,131,130,199,2,169,39,165,171,41];
      var k1 = d[19]>>4&0xf, k2 = d[19]&0xf;
      var raw = Array.from(d.slice(0,18));
      for (var i=0;i<18;i++) raw[i]=(raw[i]+key[i+k1]+key[i+k2])&0xff;
      d = raw;
    }
    // Moves from bytes 32-39 in csTimer's Giiker parser
    var valhex=[];
    for (var i=0;i<d.length;i++) { valhex.push((d[i]>>4)&0xf); valhex.push(d[i]&0xf); }
    var moves = valhex.slice(32,40);
    for (var i=0;i<moves.length;i+=2) {
      var face = moves[i]-1, dir = (moves[i+1]-1)%7;
      if (face<0||face>5) continue;
      var move = 'BDLURF'.charAt(face)+' 2\''.charAt(dir);
      _record(move.trim());
    }
  }

  // ── GAN Smart Timer ──────────────────────────────────────────────────────
  // From csTimer's gantimer.js — same fff0/fff2/fff3 service as older GAN but
  // uses a specific data format for time events
  async function _initGANTimer(svc) {
    try {
      var rdChr = await svc.getCharacteristic(TIMER_RD);
      var wrChr = await svc.getCharacteristic(TIMER_WR);
      await rdChr.startNotifications();
      rdChr.addEventListener('characteristicvaluechanged', _onTimerData);
      // Send init command
      await wrChr.writeValue(new Uint8Array([0x04,0x00,0x00,0x00,0x00]).buffer);
      _protocol = 'timer';
      _onConnected('GAN Smart Timer');
    } catch(e) {
      _status('Timer init failed: '+(e.message||e.name), 'error');
    }
  }

  var _timerRunning = false;
  function _onTimerData(e) {
    var d = new Uint8Array(e.target.value.buffer);
    var state = d[0];
    // States observed from csTimer gantimer.js:
    // 0=idle, 1=hands-on, 2=ready, 3=running, 4=stopped/finished
    if (state===3 && !_timerRunning) {
      _timerRunning = true;
      if (typeof Timer!=='undefined' && Timer._externalStart) Timer._externalStart();
    } else if ((state===4||state===0) && _timerRunning) {
      _timerRunning = false;
      // Time is in d[1..4] as milliseconds big-endian
      var ms = (d[1]<<24|d[2]<<16|d[3]<<8|d[4]);
      if (typeof Timer!=='undefined' && Timer._externalStop) Timer._externalStop(ms||null);
    }
  }

  // ── Common helpers ────────────────────────────────────────────────────────
  function _record(move) {
    if (!move||!move.trim()) return;
    var elapsed = Math.round(performance.now()-_solveStart);
    _moveLog.push({move:move,elapsed:elapsed});
    var el = document.getElementById('smartcube-moves');
    if (el) { var sp=document.createElement('span'); sp.className='sc-move'; sp.textContent=move+' '; el.appendChild(sp); el.scrollTop=el.scrollHeight; }
    _updateTPS();
    // Solved detection for move-based protocols (Giiker, GAN v1)
    // VirtualCube's rotation engine tracks the state
    if (_protocol!=='timer' && typeof VirtualCube!=='undefined') {
      if (!_vcState) _vcState = VirtualCube.createSolvedState();
      VirtualCube.applyMoveExternal(_vcState, move);
      if (VirtualCube.isSolvedExternal(_vcState)) {
        _checkSolved();
      }
    }
  }
  var _vcState = null;

  function _checkSolved() {
    if (typeof Timer!=='undefined' && Timer._triggerSolved) Timer._triggerSolved();
  }

  function _updateTPS() {
    var el = document.getElementById('sc-tps'); if (!el||!_moveLog.length) return;
    var now=performance.now(), total=(now-_solveStart)/1000;
    var tpsAll=total>0.1?(_moveLog.length/total):0;
    var n5=_moveLog.filter(function(m){return m.elapsed>=(now-_solveStart-5000);}).length;
    el.innerHTML='<span class="sc-tps-val">'+n5/5+'</span><span class="sc-tps-label"> TPS (5s)</span>'
      +' &middot; <span class="sc-tps-val">'+tpsAll.toFixed(1)+'</span><span class="sc-tps-label"> avg</span>'
      +' &middot; <span class="sc-tps-val">'+_moveLog.length+'</span><span class="sc-tps-label"> moves</span>';
  }

  function _onConnected(label) {
    _connected=true; _moveLog=[]; _solveStart=performance.now(); _vcState=null;
    _prevMoveCnt=-1; _moveCnt=-1; _latestFacelet=SOLVED;
    _status('Connected: '+(_deviceName||label), 'connected');
    var ml=document.getElementById('sc-move-label'); if(ml) ml.style.display='block';
    _updateConnectBtn(true);
  }

  function _onDisconnect() {
    _connected=false; _loopActive=false; _timerRunning=false;
    _status('Cube disconnected.','idle');
    var ml=document.getElementById('sc-move-label'); if(ml) ml.style.display='none';
    _updateConnectBtn(false);
  }

  function disconnect() {
    _loopActive=false;
    try { if (_giiChar) { _giiChar.stopNotifications().catch(()=>{}); _giiChar.removeEventListener('characteristicvaluechanged',_onGiiData); } } catch(e){}
    try { if (_v2rd)   { _v2rd.stopNotifications().catch(()=>{});    _v2rd.removeEventListener('characteristicvaluechanged',_onV2Data); } } catch(e){}
    try { if (_gatt && _gatt.connected) _gatt.disconnect(); } catch(e){}
    _onDisconnect();
  }

  function _status(msg,state) { var el=document.getElementById('smartcube-status'); if(el){el.textContent=msg;el.dataset.state=state||'idle';} }
  function _updateConnectBtn(isConn) {
    var cb=document.getElementById('btn-smartcube-connect'),db=document.getElementById('btn-smartcube-disconnect');
    if(cb) cb.style.display=isConn?'none':''; if(db) db.style.display=isConn?'':'none';
  }
  function _waitForMAC(device) {
    if (!device||!device.watchAdvertisements) return Promise.reject(-1);
    var ac=new AbortController();
    return new Promise(function(resolve,reject){
      var h=function(e){
        var mf=e.manufacturerData; if(!mf) return;
        for (var id of [0x0001,0x0501]) {
          if (mf.has(id)) {
            var dv=mf.get(id); if(!dv||dv.byteLength<6) continue;
            var mac=[]; for(var i=0;i<6;i++) mac.push(('0'+dv.getUint8(dv.byteLength-1-i).toString(16)).slice(-2));
            device.removeEventListener('advertisementreceived',h); ac.abort(); resolve(mac.join(':'));
            return;
          }
        }
      };
      device.addEventListener('advertisementreceived',h);
      device.watchAdvertisements({signal:ac.signal}).catch(reject);
      setTimeout(function(){device.removeEventListener('advertisementreceived',h);ac.abort();reject(-2);},4000);
    });
  }
  function _loadMAC(name){try{return JSON.parse(localStorage.getItem('subx_mac_map')||'{}')[name]||null;}catch(e){return null;}}
  function _saveMAC(name,mac){try{var m=JSON.parse(localStorage.getItem('subx_mac_map')||'{}');m[name]=mac;localStorage.setItem('subx_mac_map',JSON.stringify(m));}catch(e){}}

  function startSolve() { _moveLog=[]; _solveStart=performance.now(); _vcState=null; var el=document.getElementById('smartcube-moves'); if(el) el.innerHTML=''; var t=document.getElementById('sc-tps'); if(t) t.innerHTML=''; }
  function endSolve() { return {moves:_moveLog.slice(),time:Math.round(performance.now()-_solveStart)}; }
  function isConnected() { return _connected; }

  window.SmartCube = { init, connect, disconnect, startSolve, endSolve, isConnected };
})();
