// alg-trainer.js — Algorithm Trainer (Bootstrap UI rewrite)
// Uses Bootstrap 5.3 cards, nav-pills, progress, alerts, badges
// ~300 lines. Exposes window.AlgTrainer.
'use strict';

(function () {
  var activeSet = null, activeKey = '', mode = 'learn';
  var queue = [], queueIdx = 0, currentCase = null, session = {};
  var solvingStart = 0, elRaf = null, stt = null;

  // ── Init / show / hide ─────────────────────────────────────────────────────
  function init() {
    _initSTT();
    setTimeout(function () { if (!activeSet) renderSetPicker(); }, 250);
    document.addEventListener('keydown', function (e) {
      if (!document.getElementById('view-trainer').classList.contains('active')) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'KeyH') { e.preventDefault(); revealHint(); }
      if (e.code === 'Space' && mode === 'train') { e.preventDefault(); skip(); }
    });
  }

  function show() {
    var el = document.getElementById('trainer-content');
    if (!el) return;
    if (!activeSet) renderSetPicker();
  }

  function hide() { _stopTick(); try { if (stt) stt.stop(); } catch (e) {} }

  // ── Set picker ─────────────────────────────────────────────────────────────
  function renderSetPicker() {
    var el = document.getElementById('trainer-content');
    if (!el) return;
    var sets;
    try { sets = typeof getAllSets === 'function' ? getAllSets() : {}; }
    catch (e) { el.innerHTML = '<div class="alert alert-danger m-3">Error loading sets: ' + e.message + '</div>'; return; }

    // Mode pills
    var pills = ['learn','drill','recognize','train'].map(function (m) {
      var labels = { learn:'Learn', drill:'Drill', recognize:'Recognize', train:'Train' };
      return '<button class="nav-link' + (m === mode ? ' active' : '') + '" onclick="window.AlgTrainer.setMode(\'' + m + '\')">' + labels[m] + '</button>';
    }).join('');

    // Set cards grouped by event
    var eventName = { '333':'3×3','222':'2×2','444':'4×4','333oh':'OH','333bf':'BLD' };
    var groups = {};
    Object.keys(sets).forEach(function (key) {
      var s = sets[key]; var g = eventName[s.event] || s.event || 'Custom';
      if (!groups[g]) groups[g] = [];
      groups[g].push({ key: key, set: s });
    });

    var cards = Object.keys(groups).map(function (g) {
      var rows = groups[g].map(function (item) {
        var s = item.set; var n = (s.cases || []).length;
        return '<div class="col"><div class="card h-100 set-card" style="cursor:pointer" onclick="window.AlgTrainer.startSet(\'' + item.key + '\')">'
          + '<div class="card-body p-3"><h6 class="card-title mb-1">' + _esc(s.name || item.key) + '</h6>'
          + '<p class="card-text text-secondary" style="font-size:10px">' + _esc(s.description || '') + '</p>'
          + '<div class="d-flex align-items-center gap-1 mt-auto">'
          + '<span class="badge bg-secondary">' + n + ' cases</span>'
          + (s.recognition === '2-side' ? '<span class="badge bg-info text-dark">2-side</span>' : '')
          + '</div></div></div></div>';
      }).join('');
      return '<div class="mb-3"><small class="text-secondary text-uppercase fw-bold" style="font-size:9px;letter-spacing:.08em">' + g + '</small>'
        + '<div class="row row-cols-1 row-cols-md-2 g-2 mt-1">' + rows + '</div></div>';
    }).join('');

    el.innerHTML = '<div class="p-3">'
      + '<div class="d-flex align-items-center justify-content-between mb-3">'
      + '<h5 class="mb-0">Algorithm Trainer</h5>'
      + '<div class="d-flex gap-1"><button class="btn btn-sm btn-outline-secondary" onclick="window.AlgTrainer.openImport()">Import</button>'
      + '<button class="btn btn-sm btn-outline-secondary" onclick="window.AlgTrainer.downloadTemplate()">Template</button></div></div>'
      + '<div class="mb-3"><div class="nav nav-pills gap-1">' + pills + '</div></div>'
      + cards + '</div>';
  }

  function setMode(m) { mode = m; renderSetPicker(); }

  // ── Start set ──────────────────────────────────────────────────────────────
  function startSet(key) {
    var sets; try { sets = getAllSets(); } catch (e) { return; }
    activeSet = sets[key]; activeKey = key;
    if (!activeSet || !activeSet.cases || !activeSet.cases.length) return;
    session = { correct: 0, incorrect: 0, skipped: 0, streak: 0, best: 0 };
    queue = _shuffle(activeSet.cases.map(function (_, i) { return i; }));
    queueIdx = 0;
    if (mode === 'learn') { renderLearn(); return; }
    renderTrainer(); nextCase();
  }

  function backToSets() { activeSet = null; _stopTick(); renderSetPicker(); }

  // ── Learn mode ─────────────────────────────────────────────────────────────
  function renderLearn() {
    var el = document.getElementById('trainer-content');
    if (!el) return;
    var lastGrp = '';
    var html = '<div class="p-3">'
      + '<div class="d-flex align-items-center gap-2 mb-3">'
      + '<button class="btn btn-sm btn-outline-secondary" onclick="window.AlgTrainer.backToSets()">← Sets</button>'
      + '<h5 class="mb-0">' + _esc(activeSet.name) + '</h5></div>'
      + '<div class="learn-grid">';

    activeSet.cases.forEach(function (c) {
      var imgUrl = activeSet.imgFn ? activeSet.imgFn(c.alg) : (c.imageUrl || '');
      var puzzle = _evToPuzzle(activeSet.event);
      if (c.group && c.group !== lastGrp) {
        html += '<div class="learn-group-header col-span-all">' + _esc(c.group) + '</div>';
        lastGrp = c.group;
      }
      html += '<div class="card learn-card">'
        + '<div class="card-body p-2">'
        + '<div class="d-flex gap-2 align-items-start mb-2">'
        + (customElements.get('twisty-player')
            ? '<twisty-player puzzle="' + puzzle + '" alg="' + _esc(c.alg||'') + '" hint-facelets="none" control-panel="none" camera-latitude="90" style="width:72px;height:72px;flex-shrink:0"></twisty-player>'
            : (imgUrl ? '<img src="' + imgUrl + '" style="width:72px;height:72px;object-fit:contain;flex-shrink:0" onerror="this.style.display=\'none\'">' : ''))
        + '<div><div class="fw-bold">' + _esc(c.id) + '</div>'
        + (c.group ? '<small class="text-secondary">' + _esc(c.group) + '</small><br>' : '')
        + (c.hint  ? '<small class="text-secondary">' + _esc(c.hint) + '</small>' : '')
        + '</div></div>'
        + '<div class="alg-line"><span class="alg-badge">Alg</span> <code class="text-success">' + _esc(c.alg||'—') + '</code></div>'
        + (c.auf   ? '<div class="alg-line"><span class="alg-badge">AUF</span> <small class="text-warning">' + _esc(c.auf) + '</small></div>' : '')
        + (c.setup ? '<div class="alg-line"><span class="alg-badge">Setup</span> <small>' + _esc(c.setup) + '</small></div>' : '')
        + (c.notes ? '<div class="text-secondary mt-1" style="font-size:10px">' + _esc(c.notes) + '</div>' : '')
        + '<textarea class="form-control form-control-sm mt-2" rows="1" placeholder="My notes…" style="font-size:10px;resize:none"'
        + ' onchange="window.AlgTrainer.saveUserNote(\'' + c.id + '\',this.value)">' + _esc(_note(c.id)) + '</textarea>'
        + '</div></div>';
    });
    html += '</div></div>';
    el.innerHTML = html;
  }

  // ── Drill / Recognize / Train ──────────────────────────────────────────────
  function renderTrainer() {
    var el = document.getElementById('trainer-content'); if (!el) return;
    var isOLL = activeSet.name && activeSet.name.toUpperCase().indexOf('OLL') >= 0;
    el.innerHTML = '<div class="p-3">'
      + '<div class="d-flex align-items-center justify-content-between mb-2">'
      + '<button class="btn btn-sm btn-outline-secondary" onclick="window.AlgTrainer.backToSets()">← Sets</button>'
      + '<span class="fw-bold">' + _esc(activeSet.name) + ' — ' + mode.charAt(0).toUpperCase() + mode.slice(1) + '</span>'
      + '<small class="text-secondary" id="tr-stats">0/0</small></div>'

      // Progress
      + '<div class="progress mb-3" style="height:3px"><div class="progress-bar bg-info" id="tr-prog" style="width:0%"></div></div>'

      // Case display
      + '<div class="card mb-3"><div class="card-body p-3">'
      + '<div class="d-flex gap-3 align-items-start">'
      + '<div id="tr-img-box" class="tr-img-box flex-shrink-0 d-flex align-items-center justify-content-center" style="width:150px;height:150px;background:#111;border-radius:6px"><span class="text-secondary small">Loading…</span></div>'
      + '<div class="flex-grow-1">'
      + '<div class="fs-4 fw-bold mb-1" id="tr-case-id" style="opacity:0">—</div>'
      + '<div class="text-secondary small mb-1" id="tr-case-group"></div>'
      + '<div class="text-secondary small mb-2" id="tr-hint" style="display:none"></div>'
      + '<code class="text-success d-none" id="tr-alg" style="font-size:12px;word-break:break-all"></code>'
      + '</div></div></div></div>'

      // OLL MCQ
      + (isOLL && (mode==='recognize'||mode==='train') ? '<div id="tr-oll-mcq" class="d-flex flex-wrap gap-2 mb-3 d-none"></div>' : '')

      // Text input
      + ((!isOLL) && (mode==='recognize'||mode==='train') ? '<div class="input-group mb-3">'
        + '<input id="tr-answer" type="text" class="form-control" placeholder="Name the case (T perm, Ja…)" autocomplete="off" onkeydown="window.AlgTrainer.onAnswerKey(event)">'
        + '<button class="btn btn-outline-secondary" onclick="window.AlgTrainer.toggleSTT()">🎤</button></div>' : '')

      // Train bar
      + (mode==='train' ? '<div class="d-flex justify-content-between mb-2 small"><span class="text-info" id="tr-streak">0 streak</span><span class="text-secondary" id="tr-elapsed">0.0s</span></div>' : '')

      // Feedback
      + '<div id="tr-feedback" class="alert py-1 d-none mb-2" style="font-size:12px"></div>'

      // Buttons
      + '<div class="d-flex gap-2 flex-wrap" id="tr-actions">'
      + (mode==='drill' ? '<button class="btn btn-sm btn-outline-info" onclick="window.AlgTrainer.reveal()">Show Alg</button>'
          + '<button class="btn btn-sm btn-success" onclick="window.AlgTrainer.mark(true)">✓ Got it</button>'
          + '<button class="btn btn-sm btn-danger" onclick="window.AlgTrainer.mark(false)">✗ Missed</button>'
          + '<button class="btn btn-sm btn-outline-secondary" onclick="window.AlgTrainer.skip()">Skip</button>' : '')
      + (mode==='recognize' ? '<button class="btn btn-sm btn-outline-secondary" onclick="window.AlgTrainer.revealHint()">Hint (H)</button>'
          + '<button class="btn btn-sm btn-success" onclick="window.AlgTrainer.mark(true)">✓ Got it</button>'
          + '<button class="btn btn-sm btn-danger" onclick="window.AlgTrainer.mark(false)">✗ Missed</button>'
          + '<button class="btn btn-sm btn-outline-secondary" onclick="window.AlgTrainer.skip()">Skip</button>' : '')
      + (mode==='train' ? '<button class="btn btn-sm btn-outline-secondary" onclick="window.AlgTrainer.skip()">Skip (Space)</button>' : '')
      + '</div>'
      + '<div class="alert d-none mt-3 p-2" id="tr-summary" style="font-size:12px"></div>'
      + '</div>';
  }

  // ── Case logic ─────────────────────────────────────────────────────────────
  function nextCase() {
    var fb = document.getElementById('tr-feedback'); if (fb) fb.classList.add('d-none');
    if (queueIdx >= queue.length) { showSummary(); return; }
    currentCase = activeSet.cases[queue[queueIdx]];
    solvingStart = performance.now();
    var idEl = document.getElementById('tr-case-id'); if (idEl) { idEl.textContent = currentCase.id; idEl.style.opacity='0'; }
    var algEl = document.getElementById('tr-alg');    if (algEl) algEl.classList.add('d-none');
    var hint  = document.getElementById('tr-hint');   if (hint)  hint.style.display='none';
    _loadImg(currentCase);
    if ((mode==='recognize'||mode==='train') && activeSet.name && activeSet.name.toUpperCase().indexOf('OLL') >= 0) _buildMCQ();
    var ans = document.getElementById('tr-answer'); if (ans) { ans.value=''; setTimeout(function(){ans.focus();},30); }
    if (mode==='train') _startTick();
    _updateProg(); _updateStats();
  }

  function _loadImg(c) {
    var box = document.getElementById('tr-img-box'); if (!box) return;
    var puzzle = _evToPuzzle(activeSet.event);
    var isPLL  = activeSet.name && activeSet.name.toUpperCase().indexOf('PLL') >= 0;
    if (customElements.get('twisty-player')) {
      box.innerHTML = '<twisty-player puzzle="' + puzzle + '" alg="' + _esc(c.alg||'') + '" hint-facelets="none" control-panel="none"'
        + (isPLL ? '' : ' camera-latitude="90"') + ' style="width:150px;height:150px;display:block"></twisty-player>';
    } else {
      var url = c.imageUrl || (activeSet.imgFn ? activeSet.imgFn(c.alg) : '');
      box.innerHTML = url ? '<img src="' + url + '" style="width:150px;height:150px;object-fit:contain">' : '<span class="text-secondary small">No image</span>';
    }
  }

  function _buildMCQ() {
    var mcq = document.getElementById('tr-oll-mcq'); if (!mcq) return;
    mcq.classList.remove('d-none');
    var pool = _shuffle(activeSet.cases.filter(function(c){return c.id!==currentCase.id;})).slice(0,3);
    var opts = _shuffle([currentCase].concat(pool));
    mcq.innerHTML = opts.map(function(c) {
      return '<button class="btn btn-sm btn-outline-secondary" onclick="window.AlgTrainer.submitOLL(\'' + c.id + '\')">' + _esc(c.id) + '</button>';
    }).join('');
  }

  function submitOLL(id) {
    var ok = id === currentCase.id;
    document.querySelectorAll('#tr-oll-mcq button').forEach(function(b) {
      if (b.textContent.trim() === currentCase.id) b.classList.replace('btn-outline-secondary','btn-success');
      else if (b.textContent.trim() === id && !ok) b.classList.replace('btn-outline-secondary','btn-danger');
      b.disabled = true;
    });
    reveal();
    if (mode==='train') { _flash(ok); setTimeout(function(){mark(ok);},700); }
  }

  function reveal() {
    var id = document.getElementById('tr-case-id'); if (id) id.style.opacity='1';
    var alg = document.getElementById('tr-alg'); if (alg) { alg.textContent = currentCase.alg||''; alg.classList.remove('d-none'); }
    var hint = document.getElementById('tr-hint'); if (hint && currentCase.hint) { hint.textContent = currentCase.hint; hint.style.display='block'; }
  }
  function revealHint() { var h = document.getElementById('tr-hint'); if (h && currentCase && currentCase.hint) { h.textContent=currentCase.hint; h.style.display='block'; } }

  function mark(ok) {
    _stopTick();
    if (ok) { session.correct++; session.streak++; if (session.streak>session.best) session.best=session.streak; }
    else    { session.incorrect++; session.streak=0; }
    queueIdx++; nextCase();
  }
  function skip() { _stopTick(); session.skipped++; session.streak=0; queueIdx++; nextCase(); }

  function onAnswerKey(e) {
    if (e.key !== 'Enter') return;
    var val = (document.getElementById('tr-answer').value||'').trim();
    if (!val) { revealHint(); return; }
    var norm = function(s){ return s.toLowerCase().replace(/[\s\-_.]+/g,'').replace(/perm$/,''); };
    var ok = norm(val) === norm(currentCase ? currentCase.id : '');
    reveal(); _flash(ok);
    if (mode==='train') setTimeout(function(){mark(ok);},600);
  }

  function _flash(ok) {
    var fb = document.getElementById('tr-feedback'); if (!fb) return;
    fb.textContent = ok ? '✓ Correct!' : '✗ ' + (currentCase ? currentCase.id : '');
    fb.className = 'alert py-1 mb-2 ' + (ok ? 'alert-success' : 'alert-danger');
  }

  function _updateProg() {
    var bar = document.getElementById('tr-prog');
    if (bar && queue.length) bar.style.width = Math.round(queueIdx/queue.length*100) + '%';
  }
  function _updateStats() {
    var el = document.getElementById('tr-stats'); if (!el) return;
    var tot = session.correct + session.incorrect;
    el.textContent = session.correct + '/' + tot + ' · ' + (queue.length-queueIdx) + ' left';
    var sk = document.getElementById('tr-streak'); if (sk) sk.textContent = session.streak + ' streak';
  }

  function showSummary() {
    _stopTick();
    var el = document.getElementById('tr-summary'); if (!el) return;
    var tot = session.correct + session.incorrect;
    var pct = tot ? Math.round(session.correct/tot*100) : 0;
    el.innerHTML = '<strong>Done!</strong> ' + session.correct + '/' + tot + ' (' + pct + '%) · Best streak: ' + session.best
      + '<div class="d-flex gap-2 mt-2">'
      + '<button class="btn btn-sm btn-success" onclick="window.AlgTrainer.startSet(\'' + activeKey + '\')">Restart</button>'
      + '<button class="btn btn-sm btn-outline-secondary" onclick="window.AlgTrainer.backToSets()">← Back</button></div>';
    el.classList.remove('d-none');
    var actions = document.getElementById('tr-actions'); if (actions) actions.classList.add('d-none');
  }

  // ── Tick ───────────────────────────────────────────────────────────────────
  function _startTick() {
    _stopTick();
    var start = solvingStart;
    function tick() { var el = document.getElementById('tr-elapsed'); if (el) el.textContent = ((performance.now()-start)/1000).toFixed(1)+'s'; elRaf = requestAnimationFrame(tick); }
    elRaf = requestAnimationFrame(tick);
  }
  function _stopTick() { if (elRaf) { cancelAnimationFrame(elRaf); elRaf=null; } }

  // ── Import / template ──────────────────────────────────────────────────────
  function openImport() {
    var el = document.getElementById('trainer-content'); if (!el) return;
    el.innerHTML = '<div class="p-3"><div class="d-flex align-items-center gap-2 mb-3">'
      + '<button class="btn btn-sm btn-outline-secondary" onclick="window.AlgTrainer.backToSets()">← Back</button>'
      + '<h5 class="mb-0">Import Algorithm Set</h5></div>'
      + '<p class="text-secondary small">Columns: <code>Case, Alg, Notes, Group, Image URL</code></p>'
      + '<textarea id="tr-csv" class="form-control mb-2" rows="6" placeholder="OLL 33,R U R\' U\' R\' F R F\',T-shape,T,"></textarea>'
      + '<div class="input-group"><input id="tr-setname" class="form-control" placeholder="Set name">'
      + '<button class="btn btn-success" onclick="window.AlgTrainer.doImportCSV()">Import</button></div></div>';
  }

  function downloadTemplate() {
    var name = activeSet ? activeSet.name : 'MySet';
    var rows = ['Case,Alg,Notes,Group,Image URL'];
    if (activeSet && activeSet.cases) activeSet.cases.slice(0,5).forEach(function(c){
      rows.push([c.id,c.alg,c.notes||'',c.group||'',c.imageUrl||''].map(function(v){return '"'+String(v).replace(/"/g,'""')+'"';}).join(','));
    });
    _download(rows.join('\n'), 'subx-'+name.toLowerCase().replace(/\s+/g,'-')+'-template.csv', 'text/csv');
  }

  function doImportCSV() {
    var raw = (document.getElementById('tr-csv')||{}).value||'';
    var name = ((document.getElementById('tr-setname')||{}).value||'').trim()||'Imported';
    if (!raw.trim()) { alert('Paste CSV data first.'); return; }
    var lines = raw.trim().split('\n').filter(Boolean);
    var skip  = lines[0].toLowerCase().indexOf('case') >= 0;
    var cases = (skip ? lines.slice(1) : lines).map(function(l){
      var c = _csv(l); return { id:c[0]||'', alg:c[1]||'', notes:c[2]||'', group:c[3]||'', imageUrl:c[4]||'', hint:c[2]||'' };
    }).filter(function(c){return c.id && c.alg;});
    if (!cases.length) { alert('No valid cases found.'); return; }
    var sets = _custSets(); var key = 'custom_'+Date.now();
    sets[key] = { name:name, description:cases.length+' cases', event:'333', cases:cases };
    _saveSets(sets); alert('Imported "'+name+'" — '+cases.length+' cases.'); backToSets();
  }

  // ── Notes / STT ────────────────────────────────────────────────────────────
  function _note(id) { try { return JSON.parse(localStorage.getItem('subx_user_notes')||'{}')[id]||''; } catch(e){return'';} }
  function saveUserNote(id, text) {
    try { var n=JSON.parse(localStorage.getItem('subx_user_notes')||'{}'); n[id]=text; localStorage.setItem('subx_user_notes',JSON.stringify(n)); } catch(e){}
  }
  function _initSTT() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
    stt = new SR(); stt.continuous=false; stt.interimResults=false; stt.lang='en-US';
    stt.onresult=function(e){ var t=e.results[0][0].transcript; var inp=document.getElementById('tr-answer'); if(inp){inp.value=t;onAnswerKey({key:'Enter'});} };
    stt.onerror=stt.onend=function(){};
  }
  function toggleSTT() { if (!stt) { alert('Voice not supported.'); return; } try { stt.start(); } catch(e) { try { stt.stop(); } catch(e2){} } }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _evToPuzzle(ev) { return {'222':'2x2x2','444':'4x4x4','555':'5x5x5','666':'6x6x6','777':'7x7x7','pyram':'pyraminx','skewb':'skewb','sq1':'square1','minx':'megaminx'}[ev]||'3x3x3'; }
  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function _shuffle(a) { var b=a.slice(); for(var i=b.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=b[i];b[i]=b[j];b[j]=t;} return b; }
  function _csv(l){var r=[],cur='',inQ=false;for(var i=0;i<l.length;i++){var ch=l[i];if(ch==='"'&&!inQ){inQ=true;continue;}if(ch==='"'&&inQ&&l[i+1]==='"'){cur+='"';i++;continue;}if(ch==='"'&&inQ){inQ=false;continue;}if(ch===','&&!inQ){r.push(cur.trim());cur='';continue;}cur+=ch;}r.push(cur.trim());return r;}
  function _custSets(){try{return JSON.parse(localStorage.getItem('subx_custom_algs')||'{}');}catch(e){return{};}}
  function _saveSets(s){try{localStorage.setItem('subx_custom_algs',JSON.stringify(s));}catch(e){}}
  function _download(text, name, type) { var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:type})); a.download=name; a.click(); }

  window.AlgTrainer = {
    init:init, show:show, hide:hide, setMode:setMode,
    startSet:startSet, backToSets:backToSets,
    reveal:reveal, revealHint:revealHint, mark:mark, skip:skip,
    nextCase:nextCase, onAnswerKey:onAnswerKey, submitOLL:submitOLL,
    toggleSTT:toggleSTT, openImport:openImport,
    downloadTemplate:downloadTemplate, doImportCSV:doImportCSV,
    saveUserNote:saveUserNote,
  };
})();
