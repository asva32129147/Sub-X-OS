// universal-import.js — Universal Timer Import
// Supports: csTimer (.txt JSON), CubeDesk (.json), cubeast (.csv/.json),
//           Twisty Timer (.txt/.csv), CubeTime (.csv), Acubemy (.json)
// Depends on: utils.js, storage.js

'use strict';

const UniversalImport = (() => {

  // ── Open modal ─────────────────────────────────────────────────────────────
  function open() {
    let el = document.getElementById('uimport-overlay');
    if (!el) _createModal();
    document.getElementById('uimport-overlay').classList.add('open');
    _render();
  }
  function close() {
    document.getElementById('uimport-overlay')?.classList.remove('open');
  }

  function _createModal() {
    const div = document.createElement('div');
    div.id = 'uimport-overlay';
    div.className = 'modal-overlay';
    div.addEventListener('click', e => { if (e.target === div) close(); });
    div.innerHTML = `
      <div class="modal-box" style="max-width:560px">
        <div class="modal-header">
          <h2>Import Solves</h2>
          <button onclick="UniversalImport.close()" aria-label="Close">✕</button>
        </div>
        <div id="uimport-content"></div>
      </div>`;
    document.body.appendChild(div);
  }

  function _render() {
    const el = document.getElementById('uimport-content');
    if (!el) return;
    el.innerHTML = `
      <div class="uim-intro">
        Import solves from any major timer. Sub-X OS auto-detects the format.
        All solves are imported into new sessions — your existing data is untouched.
      </div>

      <div class="uim-sources">
        ${_source('csTimer', '.txt', 'Export from csTimer: File → Export to .txt')}
        ${_source('CubeDesk', '.json', 'Export from CubeDesk: Settings → Export Data')}
        ${_source('cubeast', '.csv / .json', 'Export from cubeast: Profile → Export Solves')}
        ${_source('Twisty Timer', '.txt / .csv', 'Export from Twisty Timer: Menu → Export')}
        ${_source('CubeTime', '.csv', 'Export from CubeTime: Sessions → Export → CSV')}
        ${_source('Acubemy', '.json', 'Export from Acubemy: Settings → Export')}
      </div>

      <div class="uim-drop-area" id="uim-drop">
        <div class="uim-drop-icon">📂</div>
        <div class="uim-drop-text">Drop file here or click to browse</div>
        <div class="uim-drop-sub">Accepts .txt · .json · .csv</div>
        <input type="file" id="uim-file" accept=".txt,.json,.csv"
          onchange="UniversalImport.handleFile(this.files[0])" style="display:none">
        <label class="btn-sm" for="uim-file" style="cursor:pointer;margin-top:8px;display:inline-block">
          Browse File
        </label>
      </div>

      <div id="uim-result" style="display:none"></div>`;

    // Drag & drop
    const drop = document.getElementById('uim-drop');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('hover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('hover'));
    drop.addEventListener('drop', e => {
      e.preventDefault(); drop.classList.remove('hover');
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    });
  }

  function _source(name, ext, tip) {
    return `
      <div class="uim-source">
        <span class="uim-source-name">${name}</span>
        <span class="uim-source-ext">${ext}</span>
        <span class="uim-source-tip">${tip}</span>
      </div>`;
  }

  // ── File handler ───────────────────────────────────────────────────────────
  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = e.target.result;
        const result = _autoDetectAndImport(text, file.name);
        _showResult(result);
      } catch (err) {
        _showResult({ error: err.message });
      }
    };
    reader.readAsText(file);
  }

  function _autoDetectAndImport(text, filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const trimmed = text.trim();

    // ── Try JSON-based formats first ────────────────────────────────────────
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      let data;
      try { data = JSON.parse(trimmed); } catch { throw new Error('Invalid JSON'); }

      // csTimer: has "properties" key + session keys
      if (data.properties !== undefined && Object.keys(data).some(k => k.startsWith('session'))) {
        return _importCSTimer(data);
      }
      // CubeDesk: has "cubingSession" or "solves" array with cubeType
      if (data.cubingSessions || (Array.isArray(data) && data[0]?.cube_type)) {
        return _importCubeDesk(data);
      }
      // cubeast JSON: array with solve_time, scramble, created_at
      if (Array.isArray(data) && data[0]?.solve_time !== undefined) {
        return _importCubeast(data);
      }
      // Acubemy: has sessions array with solves
      if (data.sessions && Array.isArray(data.sessions)) {
        return _importAcubemy(data);
      }
      throw new Error('Unrecognized JSON format. Try exporting as CSV.');
    }

    // ── CSV/TXT formats ─────────────────────────────────────────────────────
    const lines = trimmed.split('\n').filter(Boolean);
    const header = lines[0].toLowerCase();

    // Twisty Timer: "No.;Time;..." semicolon separated
    if (header.includes('scramble') && header.includes(';')) {
      return _importTwistyTimer(lines);
    }
    // CubeTime: "Date,Scramble,Time,Penalty,..."
    if (header.includes('date') && header.includes('scramble') && header.includes('time')) {
      return _importCubeTime(lines);
    }
    // cubeast CSV: "created_at,solve_time,scramble,..."
    if (header.includes('created_at') && header.includes('solve_time')) {
      return _importCubeastCSV(lines);
    }

    // Last resort: try csTimer TXT (valid JSON in .txt)
    try {
      const data = JSON.parse(trimmed);
      return _importCSTimer(data);
    } catch {}

    throw new Error('Could not detect timer format. Please check the file and try again.');
  }

  // ── csTimer ───────────────────────────────────────────────────────────────
  function _importCSTimer(data) {
    const result = Storage.importCSTimer(JSON.stringify(data)); // re-stringify so Storage.importCSTimer can parse it
    if (typeof Sessions !== 'undefined') Sessions.refresh();
    if (typeof App !== 'undefined') App.onSessionSwitch();
    return { source: 'csTimer', ...result };
  }

  // ── CubeDesk ──────────────────────────────────────────────────────────────
  function _importCubeDesk(data) {
    const sessions = data.cubingSessions || (Array.isArray(data) ? [{name:'CubeDesk Import', solves:data}] : []);
    let totalSessions = 0, totalSolves = 0;
    sessions.forEach(sess => {
      const meta = Storage.createSession(sess.name || 'CubeDesk Session', _cubeTypeToEvent(sess.cube_type || '333'));
      (sess.solves || []).forEach(s => {
        const time    = Math.round((s.time || 0) / 10); // ms → centiseconds
        const penalty = s.dnf ? 'DNF' : s.plus_two ? '+2' : '';
        Storage.addSolve(meta.id, { time, penalty, scramble: s.scramble || '', comment: s.notes || '' });
        totalSolves++;
      });
      totalSessions++;
    });
    if (typeof Sessions !== 'undefined') Sessions.refresh();
    if (typeof App !== 'undefined') App.onSessionSwitch();
    return { source: 'CubeDesk', sessions: totalSessions, solves: totalSolves };
  }

  // ── cubeast JSON ──────────────────────────────────────────────────────────
  function _importCubeast(data) {
    const meta = Storage.createSession('cubeast Import', '333');
    let totalSolves = 0;
    data.forEach(s => {
      const time    = Math.round((s.solve_time || 0) / 10);
      const penalty = s.dnf ? 'DNF' : s.plus_two ? '+2' : '';
      Storage.addSolve(meta.id, { time, penalty, scramble: s.scramble || '' });
      totalSolves++;
    });
    if (typeof Sessions !== 'undefined') Sessions.refresh();
    return { source: 'cubeast', sessions: 1, solves: totalSolves };
  }

  // ── cubeast CSV ───────────────────────────────────────────────────────────
  function _importCubeastCSV(lines) {
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const meta    = Storage.createSession('cubeast Import', '333');
    let total = 0;
    lines.slice(1).forEach(line => {
      const cols = _parseCSV(line);
      const row  = {};
      headers.forEach((h, i) => row[h] = cols[i] || '');
      const ms   = parseFloat(row.solve_time || row.time || 0);
      if (!ms) return;
      Storage.addSolve(meta.id, {
        time:    Math.round(ms / 10),
        penalty: row.dnf === '1' ? 'DNF' : row.plus_two === '1' ? '+2' : '',
        scramble: row.scramble || '',
      });
      total++;
    });
    if (typeof Sessions !== 'undefined') Sessions.refresh();
    return { source: 'cubeast CSV', sessions: 1, solves: total };
  }

  // ── Twisty Timer ──────────────────────────────────────────────────────────
  // Format: "No.;Time;Penalty;Scramble;Date;..."
  function _importTwistyTimer(lines) {
    const sep     = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(sep).map(h => h.trim().toLowerCase());
    const bySession = {};

    lines.slice(1).forEach(line => {
      const cols = line.split(sep);
      const row  = {};
      headers.forEach((h,i) => row[h] = (cols[i]||'').trim().replace(/^"|"$/g,''));

      const sessionName = row.session || row['puzzle type'] || 'Twisty Timer';
      if (!bySession[sessionName]) bySession[sessionName] = [];

      const raw = row.time || '';
      const ms  = _parseTimeStr(raw);
      if (!ms) return;
      bySession[sessionName].push({
        time:    Math.round(ms / 10),
        penalty: row.penalty === 'DNF' ? 'DNF' : row.penalty === '+2' ? '+2' : '',
        scramble: row.scramble || '',
      });
    });

    let totalSolves = 0;
    Object.entries(bySession).forEach(([name, solves]) => {
      const meta = Storage.createSession(name, '333');
      solves.forEach(s => { Storage.addSolve(meta.id, s); totalSolves++; });
    });
    if (typeof Sessions !== 'undefined') Sessions.refresh();
    if (typeof App !== 'undefined') App.onSessionSwitch();
    return { source: 'Twisty Timer', sessions: Object.keys(bySession).length, solves: totalSolves };
  }

  // ── CubeTime ──────────────────────────────────────────────────────────────
  // Format: "Date,Scramble,Time,Penalty,Notes"
  function _importCubeTime(lines) {
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const meta    = Storage.createSession('CubeTime Import', '333');
    let total = 0;
    lines.slice(1).forEach(line => {
      const cols = _parseCSV(line);
      const row  = {};
      headers.forEach((h,i) => row[h] = (cols[i]||'').trim());
      const ms = _parseTimeStr(row.time || '');
      if (!ms) return;
      Storage.addSolve(meta.id, {
        time:    Math.round(ms / 10),
        penalty: row.penalty === 'DNF' ? 'DNF' : row.penalty === '+2' ? '+2' : '',
        scramble: row.scramble || '',
        comment:  row.notes || '',
      });
      total++;
    });
    if (typeof Sessions !== 'undefined') Sessions.refresh();
    return { source: 'CubeTime', sessions: 1, solves: total };
  }

  // ── Acubemy ───────────────────────────────────────────────────────────────
  function _importAcubemy(data) {
    let totalSessions = 0, totalSolves = 0;
    (data.sessions || []).forEach(sess => {
      const meta = Storage.createSession(sess.name || 'Acubemy Session',
                                         _cubeTypeToEvent(sess.puzzle || '333'));
      (sess.solves || sess.times || []).forEach(s => {
        const time    = Math.round((s.time || s.ms || 0) / 10);
        const penalty = s.dnf ? 'DNF' : s.penalty === '+2' ? '+2' : '';
        Storage.addSolve(meta.id, { time, penalty, scramble: s.scramble || '' });
        totalSolves++;
      });
      totalSessions++;
    });
    if (typeof Sessions !== 'undefined') Sessions.refresh();
    if (typeof App !== 'undefined') App.onSessionSwitch();
    return { source: 'Acubemy', sessions: totalSessions, solves: totalSolves };
  }

  // ── Result display ────────────────────────────────────────────────────────
  function _showResult(result) {
    const el = document.getElementById('uim-result');
    if (!el) return;
    el.style.display = 'block';
    if (result.error) {
      el.innerHTML = `<div class="uim-error">❌ Import failed: ${result.error}</div>`;
      return;
    }
    el.innerHTML = `
      <div class="uim-success">
        ✓ Imported from <strong>${result.source}</strong>:
        ${result.sessions} session${result.sessions !== 1 ? 's' : ''},
        ${result.solves} solve${result.solves !== 1 ? 's' : ''}
        <button class="btn-sm" style="margin-left:10px;float:right" onclick="UniversalImport.close()">Done</button>
      </div>`;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  // Parse "M:SS.cc" or "SS.cc" → milliseconds
  function _parseTimeStr(str) {
    if (!str) return 0;
    str = str.trim().replace(/[^0-9:.]/g,'');
    const parts = str.split(':');
    try {
      if (parts.length === 3) {
        return (parseInt(parts[0])*3600 + parseInt(parts[1])*60 + parseFloat(parts[2])) * 1000;
      }
      if (parts.length === 2) {
        return (parseInt(parts[0])*60 + parseFloat(parts[1])) * 1000;
      }
      return parseFloat(parts[0]) * 1000;
    } catch { return 0; }
  }

  // Map cube type strings to event codes
  function _cubeTypeToEvent(t) {
    const map = {
      '3x3': '333', '333': '333', '3': '333',
      '2x2': '222', '222': '222', '2': '222',
      '4x4': '444', '444': '444',
      '5x5': '555', '555': '555',
      '6x6': '666', '7x7': '777',
      'skewb': 'skewb', 'pyraminx': 'pyram', 'pyram': 'pyram',
      'sq1': 'sq1', 'square-1': 'sq1',
      'megaminx': 'minx', 'minx': 'minx',
      'clock': 'clock',
      'oh': '333oh', '3x3oh': '333oh',
      '3bld': '333bf', 'blind': '333bf',
    };
    return map[String(t).toLowerCase().replace(/\s/g,'')] || '333';
  }

  function _parseCSV(line) {
    const r=[]; let cur='', inQ=false;
    for (let i=0;i<line.length;i++){
      const ch=line[i];
      if (ch==='"'&&!inQ){inQ=true;continue;}
      if (ch==='"'&&inQ&&line[i+1]==='"'){cur+='"';i++;continue;}
      if (ch==='"'&&inQ){inQ=false;continue;}
      if (ch===','&&!inQ){r.push(cur.trim());cur='';continue;}
      cur+=ch;
    }
    r.push(cur.trim()); return r;
  }

  return { open, close, handleFile };
})();
