// alg-trainer.js — Algorithm Trainer v4
// Modes:
//   learn      — Algorithm database: image, all algs, AUF notes, setup alg
//   drill      — Show image, recall alg. Optional 2-side view for PLL.
//   recognize  — Name the case from image. OLL uses shape MCQ.
//   train      — JPerm-style: timed, immediate feedback, streak, skip
// Depends on: utils.js, storage.js, alg-data.js
'use strict';

const AlgTrainer = (() => {
  let activeSet    = null;
  let activeKey    = '';
  let mode         = 'learn';
  let queue        = [];
  let queueIdx     = 0;
  let currentCase  = null;
  let session      = { correct:0, incorrect:0, skipped:0, streak:0, bestStreak:0 };
  let solvingStart = 0;
  let answered     = false;
  let stt          = null;
  let elapsedRaf   = null;

  // ── CASE SELECTOR state ──────────────────────────────────────────────────
  let selectedGroups = null; // null = all groups; Set of group names otherwise

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    _initSTT();
    // Don't render on init - the view is hidden. Render on first show() instead.
    // This avoids the case where trainer-content is inside a hidden .view and
    // some browsers optimise away hidden DOM measurements.
  }
  function show() {
    const el = document.getElementById('trainer-content');
    if (!el) return;
    if (!activeSet) {
      try {
        renderSetPicker();
      } catch(e) {
        console.error('AlgTrainer.show error:', e);
        el.innerHTML = `<div style="padding:20px;color:var(--red);font-size:12px">
          Trainer failed to load: ${e.message}<br>
          <button class="btn-sm" style="margin-top:8px" onclick="AlgTrainer.show()">Retry</button>
        </div>`;
      }
    }
  }
  function hide() { _stopSTT(); _stopTick(); }

  // ── SET PICKER ───────────────────────────────────────────────────────────
  function renderSetPicker() {
    const el = document.getElementById('trainer-content');
    if (!el) return;
    // Safety: ensure alg-data.js is loaded
    if (typeof getAllSets !== 'function') {
      el.innerHTML = '<div style="padding:20px;color:var(--text3);font-size:12px">Loading algorithm data…</div>';
      setTimeout(() => renderSetPicker(), 500);
      return;
    }
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
        <div class="tr-mode-label">Mode</div>
        <div class="tr-modes">
          ${['learn','drill','recognize','train'].map(m=>`
            <div class="tr-mode-card ${m===mode?'active':''}" onclick="AlgTrainer.setMode('${m}')">
              <div class="tr-mode-name">${_modeLabel(m)}</div>
              <div class="tr-mode-desc">${_modeDesc(m)}</div>
            </div>`).join('')}
        </div>
      </div>

      ${Object.entries(groups).map(([g,list])=>`
        <div class="tr-group-label">${g}</div>
        <div class="tr-set-grid">
          ${list.map(s=>`
            <div class="tr-set-card" onclick="AlgTrainer.startSet('${s.key}')">
              <div class="tr-set-name">${s.name}</div>
              <div class="tr-set-desc">${s.description||''}</div>
              <div class="tr-set-meta">
                <span>${(s.cases||[]).length} cases</span>
                ${s.recognition==='2-side'?'<span class="tr-badge">2-Side</span>':''}
                ${s.recognition==='corner'?'<span class="tr-badge corner">Corner</span>':''}
              </div>
            </div>`).join('')}
        </div>`).join('')}`;
  }

  function setMode(m) { mode = m; renderSetPicker(); }
  function _modeLabel(m) {
    return {learn:'Learn',drill:'Drill',recognize:'Recognize',train:'Train'}[m]||m;
  }
  function _modeDesc(m) {
    return {
      learn:     'Algorithm database — see all algs, AUF notes, setup move',
      drill:     'Show image, recall the algorithm. 2-side view for PLL.',
      recognize: 'See image, identify the case. OLL uses shape recognition.',
      train:     'Timed. Type name + Enter. Immediate feedback. Track streaks.',
    }[m]||'';
  }

  // ── START SET ─────────────────────────────────────────────────────────────
  function startSet(key) {
    const sets = getAllSets();
    activeSet  = sets[key];
    activeKey  = key;
    if (!activeSet?.cases?.length) return;
    selectedGroups = null; // reset case selector to all
    _initQueue();
    session = { correct:0, incorrect:0, skipped:0, streak:0, bestStreak:0 };
    if (mode === 'learn') { renderLearn(); return; }
    _renderTrainer();
    _nextCase();
  }

  function _initQueue() {
    const cases = _filteredCases();
    queue    = _shuffle(cases.map((_,i)=>i));
    queueIdx = 0;
  }

  function _filteredCases() {
    if (!selectedGroups || !selectedGroups.size) return activeSet.cases;
    return activeSet.cases.filter(c => selectedGroups.has(c.group));
  }

  // ── CASE SELECTOR ─────────────────────────────────────────────────────────
  function openCaseSelector() {
    const el = document.getElementById('trainer-content');
    if (!el) return;
    const groups = [...new Set(activeSet.cases.map(c=>c.group||'Other'))];
    el.innerHTML = `
      <div class="tr-top">
        <button class="btn-sm" onclick="AlgTrainer.closeCaseSelector()">← Back</button>
        <span class="tr-title">Case Selector — ${activeSet.name}</span>
      </div>
      <p style="font-size:10px;color:var(--text3);margin-bottom:8px">
        Select which case groups to include. Uncheck to exclude from training.
      </p>
      <div class="tr-case-sel-grid" id="tr-cs-grid">
        ${groups.map(g => {
          const cases = activeSet.cases.filter(c=>(c.group||'Other')===g);
          const checked = !selectedGroups || selectedGroups.has(g);
          return `
            <label class="tr-cs-row">
              <input type="checkbox" value="${g}" ${checked?'checked':''}>
              <span class="tr-cs-name">${g}</span>
              <span class="tr-cs-cnt">${cases.length} cases</span>
            </label>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:6px;margin-top:10px">
        <button class="btn-sm" onclick="document.querySelectorAll('#tr-cs-grid input').forEach(i=>i.checked=true)">All</button>
        <button class="btn-sm" onclick="document.querySelectorAll('#tr-cs-grid input').forEach(i=>i.checked=false)">None</button>
        <button class="btn-primary" style="margin-left:auto" onclick="AlgTrainer.applyCaseSelector()">Start Training</button>
      </div>`;
  }

  function applyCaseSelector() {
    const checks = document.querySelectorAll('#tr-cs-grid input:checked');
    if (!checks.length) { alert('Select at least one group.'); return; }
    selectedGroups = new Set([...checks].map(c=>c.value));
    _initQueue();
    session = { correct:0, incorrect:0, skipped:0, streak:0, bestStreak:0 };
    if (mode === 'learn') { renderLearn(); return; }
    _renderTrainer();
    _nextCase();
  }

  function closeCaseSelector() {
    if (mode === 'learn') { renderLearn(); return; }
    _renderTrainer();
    _nextCase();
  }

  // ── LEARN MODE (Algorithm Database) ───────────────────────────────────────
  function renderLearn() {
    const el = document.getElementById('trainer-content');
    if (!el) return;
    const cases = _filteredCases();
    const groups = {};
    cases.forEach(c => {
      const g = c.group || 'Other';
      if (!groups[g]) groups[g] = [];
      groups[g].push(c);
    });

    el.innerHTML = `
      <div class="tr-top">
        <button class="btn-sm" onclick="AlgTrainer.backToSets()">← Sets</button>
        <span class="tr-title">${activeSet.name} — Learn</span>
        <button class="btn-sm" onclick="AlgTrainer.openCaseSelector()">Filter cases</button>
      </div>
      <div class="tr-learn-grid">
        ${Object.entries(groups).map(([g,cases])=>`
          <div class="tr-learn-group-header">${g}</div>
          ${cases.map(c=>_renderLearnCard(c)).join('')}
        `).join('')}
      </div>`;
  }

  function _renderLearnCard(c) {
    const imgUrl = activeSet.imgFn ? activeSet.imgFn(c.alg) : c.imageUrl || '';
    const alts = c.altAlgs ? c.altAlgs.map((a,i)=>`
      <div class="tr-alg-row">
        <span class="tr-alg-label">Alt ${i+1}</span>
        <span class="tr-alg-text">${a}</span>
      </div>`).join('') : '';
    return `
      <div class="tr-learn-card">
        <div class="tr-learn-top">
          ${imgUrl ? `<img src="${imgUrl}" class="tr-learn-img" alt="${c.id}" onerror="this.style.display='none'">` : ''}
          <div class="tr-learn-info">
            <div class="tr-learn-id">${c.id}</div>
            <div class="tr-learn-group-tag">${c.group||''}</div>
            ${c.hint ? `<div class="tr-learn-hint">${c.hint}</div>` : ''}
          </div>
        </div>
        <div class="tr-alg-row main">
          <span class="tr-alg-label">Alg</span>
          <span class="tr-alg-text">${c.alg||'—'}</span>
        </div>
        ${alts}
        ${c.setup ? `<div class="tr-alg-row"><span class="tr-alg-label">Setup</span><span class="tr-alg-text">${c.setup}</span></div>` : ''}
        ${c.auf ? `<div class="tr-alg-row auf"><span class="tr-alg-label">AUF</span><span class="tr-alg-text auf-text">${c.auf}</span></div>` : ''}
        ${c.notes ? `<div class="tr-learn-note">${c.notes}</div>` : ''}
        <div class="tr-learn-user-notes-label">My notes</div>
        <textarea class="tr-learn-user-notes" placeholder="Your recognition notes, tips…"
          data-case-id="${c.id}"
          onchange="AlgTrainer.saveUserNote('${c.id}', this.value)"
        >${_getUserNote(c.id)}</textarea>
      </div>`;
  }

  // ── DRILL / RECOGNIZE / TRAIN RENDERER ────────────────────────────────────
  function _renderTrainer() {
    const el = document.getElementById('trainer-content');
    if (!el) return;
    const isDrill     = mode === 'drill';
    const isRecognize = mode === 'recognize';
    const isTrain     = mode === 'train';
    const isPLL       = activeSet?.name?.toUpperCase().includes('PLL');
    const isOLL       = activeSet?.name?.toUpperCase().includes('OLL');

    el.innerHTML = `
      <div class="tr-top">
        <button class="btn-sm" onclick="AlgTrainer.backToSets()">← Sets</button>
        <span class="tr-title">${activeSet.name} — ${_modeLabel(mode)}</span>
        <div style="display:flex;gap:5px;align-items:center">
          <span class="tr-session-stats" id="tr-stats">0/0</span>
          <button class="btn-sm" onclick="AlgTrainer.openCaseSelector()">Filter</button>
        </div>
      </div>

      <!-- Case display -->
      <div class="tr-case-area" id="tr-case-area">
        <!-- Image(s): drill shows 2-side if PLL -->
        <div class="tr-img-box" id="tr-img-box">
          <img id="tr-img" src="" alt="" style="display:none">
          ${isDrill && isPLL ? `<img id="tr-img-2side" src="" alt="" style="display:none;margin-top:4px">` : ''}
          <div id="tr-img-ph" class="tr-img-ph">Loading...</div>
        </div>
        <div class="tr-case-info">
          <!-- ID hidden until revealed in drill/recognize/train -->
          <div class="tr-case-id hidden" id="tr-case-id">—</div>
          <div class="tr-case-group" id="tr-case-group"></div>
          <div class="tr-hint" id="tr-hint" style="display:none"></div>
          <div class="tr-alg hidden" id="tr-alg"></div>
          <div class="tr-notes hidden" id="tr-notes"></div>
        </div>
      </div>

      <!-- OLL: multiple choice shape buttons (recognize + train) -->
      ${(isRecognize || isTrain) && isOLL ? `
        <div id="tr-oll-mcq" class="tr-oll-mcq hidden"></div>` : ''}

      <!-- PLL / COLL / Custom: text answer input -->
      ${(isRecognize || isTrain) && !isOLL ? `
        <div class="tr-stt-row">
          <input type="text" id="tr-answer" class="tr-answer-input"
            placeholder="Name the case (e.g. T perm, Ja)…"
            onkeydown="AlgTrainer.onAnswerKey(event)" autocomplete="off">
          <button id="tr-stt-btn" class="${stt?'':'disabled'}"
            onclick="AlgTrainer.toggleSTT()">🎤</button>
        </div>` : ''}

      <!-- Train: streak + timer -->
      ${isTrain ? `
        <div class="tr-train-bar">
          <span class="tr-streak" id="tr-streak">🔥 0</span>
          <span class="tr-elapsed" id="tr-elapsed">0.0s</span>
        </div>` : ''}

      <!-- Feedback flash (train mode) -->
      <div class="tr-feedback hidden" id="tr-feedback"></div>

      <!-- Action buttons -->
      <div class="tr-actions" id="tr-actions">
        ${isDrill ? `
          <button class="tr-btn reveal"  onclick="AlgTrainer.reveal()">Show Alg</button>
          <button class="tr-btn correct" onclick="AlgTrainer.mark(true)">✓ Got it</button>
          <button class="tr-btn wrong"   onclick="AlgTrainer.mark(false)">✗ Missed</button>
          <button class="tr-btn skip"    onclick="AlgTrainer.skip()">Skip</button>
        ` : isRecognize ? `
          <button class="tr-btn reveal"  onclick="AlgTrainer.revealHint()" title="H">💡 Hint</button>
          <button class="tr-btn correct" onclick="AlgTrainer.mark(true)">✓ Got it</button>
          <button class="tr-btn wrong"   onclick="AlgTrainer.mark(false)">✗ Missed</button>
          <button class="tr-btn skip"    onclick="AlgTrainer.skip()">Skip</button>
        ` : `
          <button class="tr-btn skip"    onclick="AlgTrainer.skip()" title="Space">Skip (Space)</button>
        `}
      </div>

      <div class="tr-kb-hint" id="tr-kb-hint">
        ${isTrain && !isOLL ? 'Type + <kbd>Enter</kbd> &nbsp;·&nbsp; <kbd>H</kbd> hint &nbsp;·&nbsp; <kbd>Space</kbd> skip' : ''}
        ${isRecognize && !isOLL ? '<kbd>H</kbd> hint' : ''}
      </div>

      <div class="tr-progress"><div class="tr-progress-fill" id="tr-prog"></div></div>
      <div class="tr-summary hidden" id="tr-summary"></div>`;
  }

  // ── NEXT CASE ─────────────────────────────────────────────────────────────
  function _nextCase() {
    document.getElementById('tr-feedback')?.classList.add('hidden');
    if (queueIdx >= queue.length) { _showSummary(); return; }
    const cases = _filteredCases();
    currentCase  = cases[queue[queueIdx]];
    answered     = false;
    solvingStart = performance.now();

    _setEl('tr-case-group', currentCase.group||'');
    document.getElementById('tr-case-id')?.classList.add('hidden');
    document.getElementById('tr-alg')?.classList.add('hidden');
    document.getElementById('tr-notes')?.classList.add('hidden');
    const hintEl = document.getElementById('tr-hint');
    if (hintEl) hintEl.style.display = 'none';

    _loadImg(currentCase);

    // OLL recognize/train: build MCQ
    const isOLL = activeSet?.name?.toUpperCase().includes('OLL');
    if ((mode === 'recognize' || mode === 'train') && isOLL) {
      _buildOLLMCQ(currentCase);
    }

    // Clear text input
    const ans = document.getElementById('tr-answer');
    if (ans) { ans.value = ''; setTimeout(()=>ans.focus(), 50); }

    if (mode === 'train') _startTick();

    _updateProgress();
    _updateStats();
  }

  // ── OLL MULTIPLE CHOICE ───────────────────────────────────────────────────
  function _buildOLLMCQ(correct) {
    const mcq = document.getElementById('tr-oll-mcq');
    if (!mcq) return;
    mcq.classList.remove('hidden');

    // Pick 3 wrong answers from same or nearby group
    const pool = activeSet.cases.filter(c => c.id !== correct.id);
    const wrongs = _shuffle(pool).slice(0, 3);
    const options = _shuffle([correct, ...wrongs]);

    mcq.innerHTML = options.map(c => `
      <button class="tr-oll-opt" onclick="AlgTrainer.submitOLL('${c.id}')">
        ${c.id}
      </button>`).join('');
  }

  function submitOLL(id) {
    if (answered) return;
    answered = true;
    const correct = id === currentCase.id;
    // Highlight buttons
    document.querySelectorAll('.tr-oll-opt').forEach(b => {
      if (b.textContent.trim() === currentCase.id) b.classList.add('correct-ans');
      else if (b.textContent.trim() === id && !correct) b.classList.add('wrong-ans');
      b.disabled = true;
    });
    reveal();
    if (mode === 'train') {
      _flashFeedback(correct);
      setTimeout(() => { mark(correct); }, 700);
    }
    // In recognize mode: user clicks Got it / Missed manually
  }

  // ── REVEAL / HINT ─────────────────────────────────────────────────────────
  function reveal() {
    const idEl   = document.getElementById('tr-case-id');
    const algEl  = document.getElementById('tr-alg');
    const hintEl = document.getElementById('tr-hint');
    const notes  = document.getElementById('tr-notes');
    if (idEl)  { idEl.textContent = currentCase.id; idEl.classList.remove('hidden'); }
    if (algEl) { algEl.textContent = currentCase.alg||''; algEl.classList.remove('hidden'); }
    if (hintEl && currentCase.hint) { hintEl.textContent = currentCase.hint; hintEl.style.display='block'; }
    if (notes && currentCase.notes) { notes.textContent = currentCase.notes; notes.classList.remove('hidden'); }
  }

  function revealHint() {
    const hintEl = document.getElementById('tr-hint');
    if (hintEl && currentCase?.hint) { hintEl.textContent = currentCase.hint; hintEl.style.display='block'; }
  }

  // ── MARK / SKIP ───────────────────────────────────────────────────────────
  function mark(correct) {
    _stopTick();
    if (correct) {
      session.correct++;
      session.streak++;
      session.bestStreak = Math.max(session.bestStreak, session.streak);
    } else {
      session.incorrect++;
      session.streak = 0;
    }
    queueIdx++;
    _nextCase();
  }

  function skip() {
    _stopTick();
    session.skipped++;
    session.streak = 0;
    queueIdx++;
    _nextCase();
  }

  // ── TEXT ANSWER (train/recognize) ─────────────────────────────────────────
  function onAnswerKey(e) {
    if (e.key !== 'Enter') return;
    const val = (document.getElementById('tr-answer')?.value||'').trim();
    if (!val) { revealHint(); return; }
    const norm = s => s.toLowerCase().replace(/[\s\-_.]+/g,'').replace(/perm$/,'');
    const hit  = norm(val) === norm(currentCase?.id||'');
    reveal();
    if (mode === 'train') {
      _flashFeedback(hit);
      setTimeout(() => mark(hit), 600);
    }
    // recognize: let user click Got it / Missed after seeing answer
  }

  function _flashFeedback(correct) {
    const fb = document.getElementById('tr-feedback');
    if (!fb) return;
    fb.textContent = correct ? '✓ Correct!' : '✗ ' + (currentCase?.id||'');
    fb.className   = 'tr-feedback ' + (correct ? 'fb-correct' : 'fb-wrong');
  }

  // ── KEYBOARD SHORTCUTS ────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (!document.getElementById('tr-actions')) return;
    if (e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
    if (e.altKey||e.ctrlKey||e.metaKey) return;
    if (e.code==='KeyH') { e.preventDefault(); revealHint(); }
    if (e.code==='Space' && mode==='train') { e.preventDefault(); skip(); }
    if (e.code==='ArrowRight' && mode==='drill') skip();
  });

  // ── ELAPSED TICK ──────────────────────────────────────────────────────────
  function _startTick() {
    _stopTick();
    function tick() {
      const el = document.getElementById('tr-elapsed');
      if (el) el.textContent = ((performance.now()-solvingStart)/1000).toFixed(1)+'s';
      const sk = document.getElementById('tr-streak');
      if (sk) sk.textContent = '🔥 '+session.streak;
      elapsedRaf = requestAnimationFrame(tick);
    }
    elapsedRaf = requestAnimationFrame(tick);
  }
  function _stopTick() {
    if (elapsedRaf) { cancelAnimationFrame(elapsedRaf); elapsedRaf=null; }
  }

  // ── PROGRESS / STATS ──────────────────────────────────────────────────────
  function _updateProgress() {
    const b = document.getElementById('tr-prog');
    if (b) b.style.width=(queueIdx/queue.length*100)+'%';
  }
  function _updateStats() {
    const el = document.getElementById('tr-stats');
    if (!el) return;
    const tot = session.correct+session.incorrect;
    const pct = tot?Math.round(session.correct/tot*100):0;
    el.textContent=`${session.correct}/${tot} (${pct}%) · ${queue.length-queueIdx} left`;
  }
  function _showSummary() {
    _stopTick();
    const el = document.getElementById('tr-summary');
    if (!el) return;
    const tot=session.correct+session.incorrect;
    const pct=tot?Math.round(session.correct/tot*100):0;
    el.innerHTML=`
      <div class="sum-title">Session complete!</div>
      <div class="sum-score">${session.correct}/${tot} correct · ${pct}%</div>
      <div class="sum-avg">Best streak: ${session.bestStreak} · Skipped: ${session.skipped}</div>
      <div class="tr-actions" style="margin-top:10px">
        <button class="tr-btn correct" onclick="AlgTrainer.startSet('${activeKey}')">Restart</button>
        <button class="tr-btn skip" onclick="AlgTrainer.backToSets()">← Back</button>
      </div>`;
    el.classList.remove('hidden');
    document.getElementById('tr-actions')?.classList.add('hidden');
  }

  // ── IMAGE ─────────────────────────────────────────────────────────────────
  function _loadImg(c) {
    const img=document.getElementById('tr-img'),ph=document.getElementById('tr-img-ph');
    if (!img||!ph) return;
    const url = c.imageUrl||(activeSet.imgFn?activeSet.imgFn(c.alg):'');
    if (url) {
      ph.textContent='Loading...';ph.style.display='block';img.style.display='none';
      img.onload=()=>{img.style.display='block';ph.style.display='none';};
      img.onerror=()=>{ph.textContent='(no image)';};
      img.src=url;
    } else { img.style.display='none';ph.textContent='No image';ph.style.display='block'; }

    // 2-side second angle in drill mode
    const img2=document.getElementById('tr-img-2side');
    if (img2&&activeSet?.imgFn2&&c.alg) {
      const url2=activeSet.imgFn2(c.alg);
      img2.style.display='none';
      img2.onload=()=>{img2.style.display='block';};
      img2.onerror=()=>{img2.style.display='none';};
      img2.src=url2;
    }
  }

  // ── BACK ─────────────────────────────────────────────────────────────────
  function backToSets() { activeSet=null; _stopTick(); _stopSTT(); renderSetPicker(); }

  // ── STT ──────────────────────────────────────────────────────────────────
  function _initSTT() {
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if (!SR){stt=null;return;}
    stt=new SR();stt.continuous=false;stt.interimResults=false;stt.lang='en-US';
    stt.onresult=e=>{
      const t=e.results[0][0].transcript;
      const inp=document.getElementById('tr-answer');
      if(inp){inp.value=t;onAnswerKey({key:'Enter'});}
      document.getElementById('tr-stt-btn')?.classList.remove('listening');
    };
    stt.onerror=stt.onend=()=>document.getElementById('tr-stt-btn')?.classList.remove('listening');
  }
  function toggleSTT(){
    if(!stt){alert('Voice input not supported (try Chrome).');return;}
    const b=document.getElementById('tr-stt-btn');
    if(b?.classList.contains('listening')){stt.stop();b.classList.remove('listening');}
    else{stt.start();b?.classList.add('listening');}
  }
  function _stopSTT(){try{stt?.stop();}catch{}}

  // ── IMPORT / TEMPLATE ────────────────────────────────────────────────────
  function openImport(){
    const el=document.getElementById('trainer-content');if(!el)return;
    el.innerHTML=`
      <div class="tr-top">
        <button class="btn-sm" onclick="AlgTrainer.backToSets()">← Back</button>
        <span class="tr-title">Import Algorithm Set</span>
      </div>
      <div class="tr-import-wrap">
        <div class="tr-import-section">
          <h3>Paste CSV</h3>
          <p class="tr-import-hint">Columns: <code>Case, Alg, Notes, Group, Image URL, AltAlgs (;-separated), Setup, AUF</code></p>
          <textarea id="tr-csv" class="tr-csv-input"
            placeholder="OLL 33,R U R' U' R' F R F',T-shape,T,,,,U2"></textarea>
          <div class="tr-import-row">
            <input id="tr-setname" type="text" placeholder="Set name"
              style="flex:1;padding:4px 8px;font-size:12px;background:var(--bg3);border:1px solid var(--border);color:var(--text);border-radius:3px;outline:none">
            <button class="btn-primary" onclick="AlgTrainer.doImportCSV()">Import</button>
          </div>
        </div>
        <div class="tr-import-section">
          <h3>SpeedCubeDB</h3>
          <p class="tr-import-hint">Go to <a href="https://speedcubedb.com" target="_blank">speedcubedb.com</a>, copy alg table, paste as CSV.</p>
          <button class="btn-sm" onclick="window.open('https://speedcubedb.com','_blank')">Open SpeedCubeDB ↗</button>
        </div>
      </div>`;
  }

  function downloadTemplate(){
    // Generate template based on the currently active set (if any)
    const setName = activeSet ? activeSet.name : 'MySet';
    const rows = ['Case,Alg,Notes,Group,Image URL,AltAlgs,Setup,AUF'];
    if (activeSet && activeSet.cases && activeSet.cases.length) {
      // Pre-fill with existing cases so user can see the format
      activeSet.cases.slice(0, 5).forEach(c => {
        rows.push([
          c.id, c.alg, c.notes||'', c.group||'', c.imageUrl||'',
          (c.altAlgs||[]).join(';'), c.setup||'', c.auf||''
        ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
      });
      if (activeSet.cases.length > 5) rows.push('// ... add more rows below');
    } else {
      rows.push('"OLL 33","R U R' U' R' F R F'","T-shape","T","","","",""');
      rows.push('"T Perm","R U R' U' R' F R2 U' R' U' R U R' F'","","PLL","","","","U or U2"');
    }
    downloadFile(rows.join('\n'), `subx-${setName.toLowerCase().replace(/\s+/g,'-')}-template.csv`, 'text/csv');
    alert(`Template downloaded for "${setName}".\nFill in your algorithms and Import → Paste CSV to load.`);
  }

  function doImportCSV(){
    const raw=document.getElementById('tr-csv')?.value?.trim();
    const name=document.getElementById('tr-setname')?.value?.trim()||'Imported';
    if(!raw){alert('Paste CSV first.');return;}
    try{
      const lines=raw.split('\n').filter(Boolean);
      const skip=lines[0].toLowerCase().includes('case');
      const cases=(skip?lines.slice(1):lines).map(l=>{
        const c=_parseCSV(l);
        return{id:c[0]||'',alg:c[1]||'',notes:c[2]||'',group:c[3]||'',
               imageUrl:c[4]||'',altAlgs:c[5]?c[5].split(';').filter(Boolean):[],
               setup:c[6]||'',auf:c[7]||'',hint:c[2]||''};
      }).filter(c=>c.id&&c.alg);
      if(!cases.length){alert('No valid cases found.');return;}
      const sets=getCustomSets();
      const key='custom_'+Date.now();
      sets[key]={name,description:`${cases.length} cases`,event:'333',recognition:'standard',imgFn:null,cases};
      saveCustomSets(sets);alert(`Imported "${name}" — ${cases.length} cases.`);backToSets();
    }catch(e){alert('Import failed: '+e.message);}
  }

  function _parseCSV(line){
    const r=[];let cur='',inQ=false;
    for(let i=0;i<line.length;i++){
      const c=line[i];
      if(c==='"'&&!inQ){inQ=true;continue;}
      if(c==='"'&&inQ&&line[i+1]==='"'){cur+='"';i++;continue;}
      if(c==='"'&&inQ){inQ=false;continue;}
      if(c===','&&!inQ){r.push(cur.trim());cur='';continue;}
      cur+=c;
    }r.push(cur.trim());return r;
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────
  function _shuffle(a){
    const b=[...a];
    for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}
    return b;
  }
  function _getUserNote(caseId) {
    try { return JSON.parse(localStorage.getItem('subx_user_notes')||'{}')[caseId] || ''; }
    catch { return ''; }
  }
  function saveUserNote(caseId, text) {
    try {
      const notes = JSON.parse(localStorage.getItem('subx_user_notes')||'{}');
      notes[caseId] = text;
      localStorage.setItem('subx_user_notes', JSON.stringify(notes));
    } catch {}
  }
  function _setEl(id,txt){const e=document.getElementById(id);if(e)e.textContent=txt;}

  return {
    init,show,hide,
    setMode,startSet,backToSets,
    openCaseSelector,applyCaseSelector,closeCaseSelector,
    reveal,revealHint,mark,skip,
    onAnswerKey,submitOLL,toggleSTT,
    openImport,downloadTemplate,doImportCSV,
  };
})();
