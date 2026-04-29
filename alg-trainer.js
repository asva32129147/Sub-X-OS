// alg-trainer.js — Algorithm Trainer with 4 modes
// Modes:
//   Learn     — shows image + alg + hint always. Self-pace through cases.
//   Drill     — shows image, hide alg. Press to reveal. Mark got/missed.
//   Recognize — shows image only. Name it (type or voice). No alg shown until correct/reveal.
//   Train     — Recognize + timed. H=hint, Space=skip, Enter=submit.
//
// Depends on: utils.js, storage.js, alg-data.js
'use strict';

const AlgTrainer = (() => {
  // ── State ──────────────────────────────────────────────────────────────────
  let activeSet   = null;
  let activeKey   = '';
  let mode        = 'learn'; // 'learn' | 'drill' | 'recognize' | 'train'
  let queue       = [];
  let queueIdx    = 0;
  let currentCase = null;
  let revealed    = false;
  let solvingStart= 0;
  let session     = { correct:0, incorrect:0, skipped:0, times:[] };
  let stt         = null;
  let hintShown   = false;

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    _initSTT();
    renderSetPicker();
    // Keyboard shortcuts (active only when trainer is open)
    document.addEventListener('keydown', _onKey);
  }

  function show() {
    // The view system (view.active CSS) handles visibility.
    // We just ensure content is populated and STT is ready.
    if (!activeSet) renderSetPicker();
  }
  function hide() {
    // Called when switching away from trainer view.
    _stopSTT();
  }

  // ── Set picker ─────────────────────────────────────────────────────────────
  function renderSetPicker() {
    const el = document.getElementById('trainer-content');
    if (!el) return;
    const sets = getAllSets();
    const groups = {};
    for (const [key, set] of Object.entries(sets)) {
      const g = set.event || 'Custom';
      if (!groups[g]) groups[g] = [];
      groups[g].push({ key, ...set });
    }

    el.innerHTML = `
      <div class="tr-top">
        <span class="tr-title">Algorithm Trainer</span>
        <div style="display:flex;gap:5px">
          <button class="btn-sm" onclick="AlgTrainer.openImport()">⬆ Import</button>
          <button class="btn-sm" onclick="AlgTrainer.downloadTemplate()">⬇ Template</button>
        </div>
      </div>

      <div class="tr-mode-picker">
        <div class="tr-mode-label">Training Mode</div>
        <div class="tr-modes">
          ${['learn','drill','recognize','train'].map(m => `
            <div class="tr-mode-card ${m === mode ? 'active' : ''}" onclick="AlgTrainer.setMode('${m}')">
              <div class="tr-mode-name">${_modeLabel(m)}</div>
              <div class="tr-mode-desc">${_modeDesc(m)}</div>
            </div>`).join('')}
        </div>
      </div>

      ${Object.entries(groups).map(([g, list]) => `
        <div class="tr-group-label">${g}</div>
        <div class="tr-set-grid">
          ${list.map(s => `
            <div class="tr-set-card" onclick="AlgTrainer.startSet('${s.key}')">
              <div class="tr-set-name">${s.name}</div>
              <div class="tr-set-desc">${s.description || ''}</div>
              <div class="tr-set-meta">
                <span>${(s.cases||[]).length} cases</span>
                ${s.recognition==='2-side'?'<span class="tr-badge">2-Side</span>':''}
                ${s.recognition==='corner'?'<span class="tr-badge corner">Corner</span>':''}
              </div>
            </div>`).join('')}
        </div>`).join('')}`;
  }

  function setMode(m) {
    mode = m;
    renderSetPicker(); // re-render to update active mode card
  }

  function _modeLabel(m) {
    return { learn:'📖 Learn', drill:'🔨 Drill', recognize:'👁 Recognize', train:'⚡ Train' }[m] || m;
  }
  function _modeDesc(m) {
    return {
      learn:     'See image, alg & hint at all times. Self-paced.',
      drill:     'See image. Recall alg, then reveal to check.',
      recognize: 'See image only. Name the case to check.',
      train:     'Timed. Name case or press Space to skip. H for hint.',
    }[m] || '';
  }

  // ── Start set ──────────────────────────────────────────────────────────────
  function startSet(key) {
    const sets = getAllSets();
    activeSet  = sets[key];
    activeKey  = key;
    if (!activeSet?.cases?.length) return;
    queue    = _shuffle(activeSet.cases.map((_,i)=>i));
    queueIdx = 0;
    session  = { correct:0, incorrect:0, skipped:0, times:[] };
    _renderActiveTrainer();
    _nextCase();
  }

  function _renderActiveTrainer() {
    const el = document.getElementById('trainer-content');
    if (!el) return;

    const isLearn     = mode === 'learn';
    const isDrill     = mode === 'drill';
    const isRecognize = mode === 'recognize';
    const isTrain     = mode === 'train';

    el.innerHTML = `
      <div class="tr-top">
        <button class="btn-sm" onclick="AlgTrainer.backToSets()">← Back</button>
        <span class="tr-title">${activeSet.name} — ${_modeLabel(mode)}</span>
        <span class="tr-session-stats" id="tr-stats">0/0</span>
      </div>

      <!-- Case display -->
      <div class="tr-case-area">
        <div class="tr-img-box">
          <img id="tr-img" src="" alt="" style="display:none">
          <div id="tr-img-ph" class="tr-img-ph">Loading...</div>
        </div>
        <div class="tr-case-info">
          <!-- Learn always shows ID; others hide until revealed -->
          <div class="tr-case-id ${isLearn?'':'hidden-until-reveal'}" id="tr-case-id">—</div>
          <div class="tr-case-group" id="tr-case-group"></div>
          <!-- Hint: always visible in Learn+Recognize/Train; hidden in Drill until reveal -->
          <div class="tr-hint" id="tr-hint" style="display:none"></div>
          <!-- Alg: always visible in Learn; hidden until reveal in Drill/Recognize/Train -->
          <div class="tr-alg hidden" id="tr-alg"></div>
          <div class="tr-notes hidden" id="tr-notes"></div>
        </div>
      </div>

      <!-- Answer input (Recognize + Train) -->
      ${isRecognize || isTrain ? `
        <div class="tr-stt-row">
          <input type="text" id="tr-answer" class="tr-answer-input"
            placeholder="Name the case (e.g. OLL 33, T perm)…"
            onkeydown="AlgTrainer.onAnswerKey(event)" autocomplete="off">
          <button id="tr-stt-btn" class="${stt?'':'disabled'}"
            onclick="AlgTrainer.toggleSTT()" title="Voice input">🎤</button>
        </div>` : ''}

      <!-- Timer display (Train mode) -->
      ${isTrain ? `<div class="tr-timer-row"><span id="tr-elapsed">0.0s</span></div>` : ''}

      <!-- Action buttons -->
      <div class="tr-actions" id="tr-actions">
        ${isLearn ? `
          <button class="tr-btn reveal" onclick="AlgTrainer.prevCase()">← Prev</button>
          <button class="tr-btn correct" onclick="AlgTrainer.skip()">Next →</button>
          <button class="tr-btn skip" onclick="AlgTrainer.backToSets()">Done</button>
        ` : isDrill ? `
          <button class="tr-btn reveal"  onclick="AlgTrainer.reveal()">Show Alg</button>
          <button class="tr-btn correct" onclick="AlgTrainer.mark(true)">✓ Got it</button>
          <button class="tr-btn wrong"   onclick="AlgTrainer.mark(false)">✗ Missed</button>
          <button class="tr-btn skip"    onclick="AlgTrainer.skip()">Skip →</button>
        ` : isRecognize ? `
          <button class="tr-btn reveal"  onclick="AlgTrainer.reveal()">Show Alg</button>
          <button class="tr-btn correct" onclick="AlgTrainer.mark(true)">✓ Got it</button>
          <button class="tr-btn wrong"   onclick="AlgTrainer.mark(false)">✗ Missed</button>
          <button class="tr-btn skip"    onclick="AlgTrainer.skip()">Skip →</button>
        ` : /* train */ `
          <button class="tr-btn reveal"  onclick="AlgTrainer.showHint()" title="H">💡 Hint (H)</button>
          <button class="tr-btn skip"    onclick="AlgTrainer.skip()" title="Space">Skip (Space)</button>
        `}
      </div>

      <!-- Keyboard shortcut hint -->
      <div class="tr-kb-hint" id="tr-kb-hint">
        ${isTrain ? 'Type name + <kbd>Enter</kbd> &nbsp;·&nbsp; <kbd>H</kbd> hint &nbsp;·&nbsp; <kbd>Space</kbd> skip' : ''}
        ${isRecognize ? 'Type name + <kbd>Enter</kbd> &nbsp;·&nbsp; <kbd>H</kbd> hint' : ''}
      </div>

      <!-- Progress -->
      <div class="tr-progress"><div class="tr-progress-fill" id="tr-prog"></div></div>

      <!-- Summary (hidden until done) -->
      <div class="tr-summary hidden" id="tr-summary"></div>`;

    // Focus input if applicable
    if (isRecognize || isTrain) {
      setTimeout(() => document.getElementById('tr-answer')?.focus(), 100);
    }
  }

  // ── Case navigation ────────────────────────────────────────────────────────
  function _nextCase() {
    if (queueIdx >= queue.length) { _showSummary(); return; }
    currentCase  = activeSet.cases[queue[queueIdx]];
    revealed     = false;
    hintShown    = false;
    solvingStart = performance.now();

    const isLearn = mode === 'learn';

    // Case ID — always show in Learn, hide in others until reveal
    const idEl = document.getElementById('tr-case-id');
    if (idEl) {
      idEl.textContent = currentCase.id || '—';
      if (!isLearn) idEl.classList.add('hidden');
      else idEl.classList.remove('hidden');
    }

    _setEl('tr-case-group', currentCase.group || '');

    // Algorithm
    const algEl = document.getElementById('tr-alg');
    if (algEl) {
      algEl.textContent = currentCase.alg || '';
      isLearn ? algEl.classList.remove('hidden') : algEl.classList.add('hidden');
    }

    // Notes
    const notesEl = document.getElementById('tr-notes');
    if (notesEl) {
      notesEl.textContent = currentCase.notes || '';
      notesEl.classList.toggle('hidden', !currentCase.notes || !isLearn);
    }

    // Hint
    const hintEl = document.getElementById('tr-hint');
    if (hintEl) {
      hintEl.textContent = currentCase.hint || '';
      // Learn: always show. Recognize/Train: show if hintShown. Drill: hide until reveal.
      const shouldShow = isLearn
        || ((mode === 'recognize' || mode === 'train') && (activeSet.recognition === '2-side' || activeSet.recognition === 'corner'));
      hintEl.style.display = shouldShow && currentCase.hint ? 'block' : 'none';
    }

    // Image
    _loadImg(currentCase);

    // Clear answer input
    const ans = document.getElementById('tr-answer');
    if (ans) { ans.value = ''; ans.focus(); }

    // Start elapsed timer in Train mode
    if (mode === 'train') _startElapsedTick();

    _updateProgress();
    _updateStats();
  }

  function prevCase() {
    if (queueIdx > 0) queueIdx--;
    _nextCase();
  }

  function reveal() {
    revealed = true;
    const algEl  = document.getElementById('tr-alg');
    const idEl   = document.getElementById('tr-case-id');
    const hintEl = document.getElementById('tr-hint');
    const notes  = document.getElementById('tr-notes');
    if (algEl)  algEl.classList.remove('hidden');
    if (idEl)   idEl.classList.remove('hidden');
    if (hintEl && currentCase?.hint) hintEl.style.display = 'block';
    if (notes && currentCase?.notes) notes.classList.remove('hidden');
  }

  function showHint() {
    hintShown = true;
    const hintEl = document.getElementById('tr-hint');
    if (hintEl && currentCase?.hint) {
      hintEl.textContent = currentCase.hint;
      hintEl.style.display = 'block';
    }
  }

  function mark(correct) {
    session.times.push((performance.now() - solvingStart) / 1000);
    if (correct) session.correct++; else session.incorrect++;
    _stopElapsedTick();
    queueIdx++;
    _nextCase();
  }

  function skip() {
    session.skipped++;
    _stopElapsedTick();
    queueIdx++;
    _nextCase();
  }

  function backToSets() {
    activeSet = null;
    _stopElapsedTick();
    _stopSTT();
    renderSetPicker();
  }

  // Answer input handler
  function onAnswerKey(e) {
    if (e.key === 'Enter') {
      const val = (document.getElementById('tr-answer')?.value || '').trim();
      if (!val) { reveal(); return; }
      const norm = s => s.toLowerCase().replace(/[\s\-_.]+/g,'');
      const hit  = norm(val) === norm(currentCase?.id || '');
      if (hit) { reveal(); mark(true); }
      else { reveal(); }
    }
  }

  // Global key handler
  function _onKey(e) {
    // Only active when trainer content is visible
    if (!document.getElementById('tr-actions')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;

    if (mode === 'train' || mode === 'recognize') {
      if (e.code === 'KeyH') { e.preventDefault(); showHint(); }
      if (e.code === 'Space' && mode === 'train') { e.preventDefault(); skip(); }
    }
    if (mode === 'learn') {
      if (e.code === 'ArrowRight') skip();
      if (e.code === 'ArrowLeft')  prevCase();
    }
  }

  // ── Elapsed tick (Train mode) ──────────────────────────────────────────────
  let _elapsedRaf = null;
  function _startElapsedTick() {
    _stopElapsedTick();
    function tick() {
      const el = document.getElementById('tr-elapsed');
      if (el) el.textContent = ((performance.now() - solvingStart) / 1000).toFixed(1) + 's';
      _elapsedRaf = requestAnimationFrame(tick);
    }
    _elapsedRaf = requestAnimationFrame(tick);
  }
  function _stopElapsedTick() {
    if (_elapsedRaf) { cancelAnimationFrame(_elapsedRaf); _elapsedRaf = null; }
  }

  // ── Image loading ──────────────────────────────────────────────────────────
  function _loadImg(c) {
    const img = document.getElementById('tr-img');
    const ph  = document.getElementById('tr-img-ph');
    if (!img || !ph) return;

    if (c.imageUrl) {
      img.src = c.imageUrl;
      img.style.display = 'block';
      ph.style.display  = 'none';
      return;
    }
    if (activeSet.imgFn && c.alg) {
      const url = activeSet.imgFn(c.alg);
      ph.textContent   = 'Loading...';
      ph.style.display = 'block';
      img.style.display= 'none';
      img.onload  = () => { img.style.display='block'; ph.style.display='none'; };
      img.onerror = () => { ph.textContent='(image unavailable)'; };
      img.src = url;
    } else {
      img.style.display = 'none';
      ph.textContent    = 'No image';
      ph.style.display  = 'block';
    }
  }

  // ── Progress / stats ───────────────────────────────────────────────────────
  function _updateProgress() {
    const bar = document.getElementById('tr-prog');
    if (bar) bar.style.width = (queueIdx / queue.length * 100) + '%';
  }
  function _updateStats() {
    const el = document.getElementById('tr-stats');
    if (!el) return;
    const tot = session.correct + session.incorrect;
    const pct = tot ? Math.round(session.correct / tot * 100) : 0;
    el.textContent = `${session.correct}/${tot} (${pct}%) · ${queue.length - queueIdx} left`;
  }
  function _showSummary() {
    _stopElapsedTick();
    const el = document.getElementById('tr-summary');
    if (!el) return;
    const tot  = session.correct + session.incorrect;
    const pct  = tot ? Math.round(session.correct / tot * 100) : 0;
    const avgT = session.times.length
      ? (session.times.reduce((a,b)=>a+b,0)/session.times.length).toFixed(1)
      : '—';
    el.innerHTML = `
      <div class="sum-title">✓ Session complete</div>
      <div class="sum-score">${session.correct}/${tot} correct · ${pct}%</div>
      <div class="sum-avg">Avg: ${avgT}s · Skipped: ${session.skipped}</div>
      <div class="tr-actions" style="margin-top:10px">
        <button class="tr-btn correct" onclick="AlgTrainer.startSet('${activeKey}')">Restart</button>
        <button class="tr-btn skip"    onclick="AlgTrainer.backToSets()">← Back</button>
      </div>`;
    el.classList.remove('hidden');
    document.getElementById('tr-actions')?.classList.add('hidden');
  }

  // ── STT ────────────────────────────────────────────────────────────────────
  function _initSTT() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { stt = null; return; }
    stt = new SR();
    stt.continuous = false; stt.interimResults = false; stt.lang = 'en-US';
    stt.onresult = e => {
      const t = e.results[0][0].transcript;
      const inp = document.getElementById('tr-answer');
      if (inp) { inp.value = t; onAnswerKey({ key:'Enter' }); }
      document.getElementById('tr-stt-btn')?.classList.remove('listening');
    };
    stt.onerror = stt.onend = () =>
      document.getElementById('tr-stt-btn')?.classList.remove('listening');
  }
  function toggleSTT() {
    if (!stt) { alert('Voice input not supported (try Chrome).'); return; }
    const btn = document.getElementById('tr-stt-btn');
    if (btn?.classList.contains('listening')) { stt.stop(); btn.classList.remove('listening'); }
    else { stt.start(); btn?.classList.add('listening'); }
  }
  function _stopSTT() { try { stt?.stop(); } catch {} }

  // ── Import / Template ──────────────────────────────────────────────────────
  function openImport() {
    const el = document.getElementById('trainer-content');
    if (!el) return;
    el.innerHTML = `
      <div class="tr-top">
        <button class="btn-sm" onclick="AlgTrainer.backToSets()">← Back</button>
        <span class="tr-title">Import Algorithm Set</span>
      </div>
      <div class="tr-import-wrap">
        <div class="tr-import-section">
          <h3>Paste CSV</h3>
          <p class="tr-import-hint">Columns: <code>Case, Alg, Notes, Group, Image URL</code><br>
            First row can be a header — will be skipped automatically.</p>
          <textarea id="tr-csv" class="tr-csv-input"
            placeholder="OLL 33,R U R' U' R' F R F',T-shape,T,"></textarea>
          <div class="tr-import-row">
            <input id="tr-setname" type="text" placeholder="Set name (e.g. My OLL)"
              style="flex:1;padding:4px 8px;font-size:12px;background:var(--bg3);border:1px solid var(--border);color:var(--text);border-radius:3px;outline:none">
            <button class="btn-primary" onclick="AlgTrainer.doImportCSV()">Import</button>
          </div>
        </div>
        <div class="tr-import-section">
          <h3>SpeedCubeDB</h3>
          <p class="tr-import-hint">Go to <a href="https://speedcubedb.com" target="_blank">speedcubedb.com</a>,
            find your set, copy the alg table, paste as CSV above.</p>
          <button class="btn-sm" onclick="window.open('https://speedcubedb.com','_blank')">
            Open SpeedCubeDB ↗</button>
        </div>
      </div>`;
  }

  function downloadTemplate() {
    const csv = [
      'Case,Alg,Notes,Group,Image URL',
      "OLL 33,R U R' U' R' F R F',T-shape OLL,T,",
      "T Perm,R U R' U' R' F R2 U' R' U' R U R' F',,PLL,",
      'Custom,your alg,your notes,Custom,https://img.url/image.png',
    ].join('\n');
    downloadFile(csv, 'subx-alg-template.csv', 'text/csv');
  }

  function doImportCSV() {
    const raw  = document.getElementById('tr-csv')?.value?.trim();
    const name = document.getElementById('tr-setname')?.value?.trim() || 'Imported';
    if (!raw) { alert('Paste CSV data first.'); return; }
    try {
      const lines = raw.split('\n').filter(Boolean);
      const skip  = lines[0].toLowerCase().includes('case');
      const cases = (skip ? lines.slice(1) : lines).map(l => {
        const c = _parseCSVLine(l);
        return { id:c[0]||'', alg:c[1]||'', notes:c[2]||'', group:c[3]||'', imageUrl:c[4]||'', hint:c[2]||'' };
      }).filter(c => c.id && c.alg);
      if (!cases.length) { alert('No valid cases found.'); return; }
      const sets = getCustomSets();
      const key  = 'custom_' + Date.now();
      sets[key]  = { name, description:`${cases.length} cases`, event:'333', recognition:'standard', imgFn:null, cases };
      saveCustomSets(sets);
      alert(`Imported "${name}" — ${cases.length} cases.`);
      backToSets();
    } catch(e) { alert('Import failed: ' + e.message); }
  }

  function _parseCSVLine(line) {
    const r=[]; let cur='', inQ=false;
    for(let i=0;i<line.length;i++){
      const c=line[i];
      if(c==='"'&&!inQ){inQ=true;continue;}
      if(c==='"'&&inQ&&line[i+1]==='"'){cur+='"';i++;continue;}
      if(c==='"'&&inQ){inQ=false;continue;}
      if(c===','&&!inQ){r.push(cur.trim());cur='';continue;}
      cur+=c;
    }
    r.push(cur.trim()); return r;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _shuffle(a) {
    const b=[...a];
    for(let i=b.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];
    }
    return b;
  }
  function _setEl(id, txt) { const e=document.getElementById(id); if(e) e.textContent=txt; }

  return {
    init, show, hide,
    setMode, startSet, backToSets,
    reveal, showHint, mark, skip, prevCase,
    onAnswerKey, toggleSTT,
    openImport, downloadTemplate, doImportCSV,
  };
})();
