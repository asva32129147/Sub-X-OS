// alg-trainer.js — Algorithm Trainer (clean rewrite)
// Explicitly exposes window.AlgTrainer so inline onclick handlers work
// Always renders immediately in show() — no lazy init
'use strict';

(function() {

  // ── State ──────────────────────────────────────────────────────────────────
  var activeSet   = null;
  var activeKey   = '';
  var mode        = 'learn';
  var queue       = [];
  var queueIdx    = 0;
  var currentCase = null;
  var session     = { correct: 0, incorrect: 0, skipped: 0, streak: 0, best: 0 };
  var solvingStart = 0;
  var stt          = null;
  var elapsedRaf   = null;

  // ── Init (called once from app.js) ─────────────────────────────────────────
  function init() {
    _initSTT();
    // Keyboard shortcuts for trainer view
    document.addEventListener('keydown', function(e) {
      var view = document.getElementById('view-trainer');
      if (!view || !view.classList.contains('active')) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.code === 'KeyH') { e.preventDefault(); revealHint(); }
      if (e.code === 'Space' && mode === 'train') { e.preventDefault(); skip(); }
      if (e.code === 'ArrowRight') skip();
      if (e.code === 'ArrowLeft'  && mode === 'learn') prevCase();
    });
  }

  // ── show / hide (called by showView) ──────────────────────────────────────
  function show() {
    // If no set active, always render the set picker
    if (!activeSet) {
      renderSetPicker();
    }
  }

  function hide() {
    _stopSTT();
    _stopTick();
  }

  // ── Set picker ─────────────────────────────────────────────────────────────
  function renderSetPicker() {
    var el = document.getElementById('trainer-content');
    if (!el) return;

    var sets;
    try {
      sets = typeof getAllSets === 'function' ? getAllSets() : {};
    } catch(e) {
      el.innerHTML = '<div style="padding:20px;color:var(--red)">Error loading sets: ' + e.message + '</div>';
      return;
    }

    // Group by event
    var groups = {};
    var eventNames = { '333':'3x3', '222':'2x2', '444':'4x4', '333oh':'OH', '333bf':'BLD' };
    Object.keys(sets).forEach(function(key) {
      var set = sets[key];
      var g   = eventNames[set.event] || set.event || 'Custom';
      if (!groups[g]) groups[g] = [];
      groups[g].push({ key: key, set: set });
    });

    var html = '<div class="tr-top">'
      + '<span class="tr-title">Algorithm Trainer</span>'
      + '<div style="display:flex;gap:5px">'
      + '<button class="btn-sm" onclick="window.AlgTrainer.openImport()">Import</button>'
      + '<button class="btn-sm" onclick="window.AlgTrainer.downloadTemplate()">Template</button>'
      + '</div></div>';

    // Mode picker
    var modes = ['learn', 'drill', 'recognize', 'train'];
    var modeLabels = { learn:'Learn', drill:'Drill', recognize:'Recognize', train:'Train' };
    var modeDescs  = {
      learn:     'Algorithm database — see algs, AUF, setup moves',
      drill:     'Show image, recall the alg. Reveal to check.',
      recognize: 'See image only. Name the case.',
      train:     'Timed. Type name + Enter. Streaks.'
    };
    html += '<div class="tr-mode-picker"><div class="tr-mode-label">Mode</div><div class="tr-modes">';
    modes.forEach(function(m) {
      html += '<div class="tr-mode-card' + (m === mode ? ' active' : '') + '" onclick="window.AlgTrainer.setMode(\'' + m + '\')">'
        + '<div class="tr-mode-name">' + modeLabels[m] + '</div>'
        + '<div class="tr-mode-desc">' + modeDescs[m] + '</div>'
        + '</div>';
    });
    html += '</div></div>';

    // Set cards
    Object.keys(groups).forEach(function(g) {
      html += '<div class="tr-group-label">' + g + '</div><div class="tr-set-grid">';
      groups[g].forEach(function(item) {
        var s = item.set;
        var cases = s.cases || [];
        html += '<div class="tr-set-card" onclick="window.AlgTrainer.startSet(\'' + item.key + '\')">'
          + '<div class="tr-set-name">' + (s.name || item.key) + '</div>'
          + '<div class="tr-set-desc">' + (s.description || '') + '</div>'
          + '<div class="tr-set-meta"><span>' + cases.length + ' cases</span>'
          + (s.recognition === '2-side' ? '<span class="tr-badge">2-Side</span>' : '')
          + (s.recognition === 'corner'  ? '<span class="tr-badge corner">Corner</span>' : '')
          + '</div></div>';
      });
      html += '</div>';
    });

    el.innerHTML = html;
  }

  function setMode(m) {
    mode = m;
    renderSetPicker();
  }

  // ── Start set ──────────────────────────────────────────────────────────────
  function startSet(key) {
    var sets;
    try { sets = getAllSets(); } catch(e) { return; }
    activeSet = sets[key];
    activeKey = key;
    if (!activeSet || !activeSet.cases || !activeSet.cases.length) return;
    session  = { correct:0, incorrect:0, skipped:0, streak:0, best:0 };
    queue    = _shuffle(activeSet.cases.map(function(_,i) { return i; }));
    queueIdx = 0;
    if (mode === 'learn') { renderLearn(); return; }
    renderTrainer();
    nextCase();
  }

  function backToSets() {
    activeSet = null;
    _stopTick();
    _stopSTT();
    renderSetPicker();
  }

  // ── LEARN mode — full database view ────────────────────────────────────────
  function renderLearn() {
    var el = document.getElementById('trainer-content');
    if (!el) return;
    var cases = activeSet.cases;
    var html  = '<div class="tr-top">'
      + '<button class="btn-sm" onclick="window.AlgTrainer.backToSets()">&#8592; Sets</button>'
      + '<span class="tr-title">' + activeSet.name + ' — Learn</span>'
      + '</div><div class="tr-learn-grid">';

    // Group by group property
    var lastGroup = '';
    cases.forEach(function(c) {
      if (c.group && c.group !== lastGroup) {
        html += '<div class="tr-learn-group-header">' + c.group + '</div>';
        lastGroup = c.group;
      }
      var imgUrl = activeSet.imgFn ? activeSet.imgFn(c.alg) : (c.imageUrl || '');
      var savedNote = _getUserNote(c.id);
      html += '<div class="tr-learn-card">'
        + '<div class="tr-learn-top">'
        + _twisty(c, activeSet, 'tr-learn-img-3d')
        + '<div class="tr-learn-info">'
        + '<div class="tr-learn-id">' + c.id + '</div>'
        + (c.group ? '<div class="tr-learn-group-tag">' + c.group + '</div>' : '')
        + (c.hint  ? '<div class="tr-learn-hint">'  + _esc(c.hint)  + '</div>' : '')
        + '</div></div>'
        + '<div class="tr-alg-row main"><span class="tr-alg-label">Alg</span><span class="tr-alg-text">' + _esc(c.alg || '—') + '</span></div>'
        + (c.altAlgs ? c.altAlgs.map(function(a,i) {
            return '<div class="tr-alg-row"><span class="tr-alg-label">Alt '+(i+1)+'</span><span class="tr-alg-text">'+_esc(a)+'</span></div>';
          }).join('') : '')
        + (c.setup ? '<div class="tr-alg-row"><span class="tr-alg-label">Setup</span><span class="tr-alg-text">'+_esc(c.setup)+'</span></div>' : '')
        + (c.auf   ? '<div class="tr-alg-row auf"><span class="tr-alg-label">AUF</span><span class="tr-alg-text auf-text">'+_esc(c.auf)+'</span></div>' : '')
        + (c.notes ? '<div class="tr-learn-note">'+_esc(c.notes)+'</div>' : '')
        + '<div class="tr-learn-user-notes-label">My notes</div>'
        + '<textarea class="tr-learn-user-notes" placeholder="Your recognition notes, tips…" onchange="window.AlgTrainer.saveUserNote(\''+ c.id + '\', this.value)">' + _esc(savedNote) + '</textarea>'
        + '</div>';
    });
    html += '</div>';
    el.innerHTML = html;
  }

  // ── DRILL / RECOGNIZE / TRAIN renderer ────────────────────────────────────
  function renderTrainer() {
    var el = document.getElementById('trainer-content');
    if (!el) return;
    var isDrill  = mode === 'drill';
    var isRecog  = mode === 'recognize';
    var isTrain  = mode === 'train';
    var isPLL    = activeSet && activeSet.name && activeSet.name.toUpperCase().indexOf('PLL') >= 0;
    var isOLL    = activeSet && activeSet.name && activeSet.name.toUpperCase().indexOf('OLL') >= 0;

    var html = '<div class="tr-top">'
      + '<button class="btn-sm" onclick="window.AlgTrainer.backToSets()">&#8592; Sets</button>'
      + '<span class="tr-title">' + activeSet.name + ' — ' + mode.charAt(0).toUpperCase() + mode.slice(1) + '</span>'
      + '<span class="tr-session-stats" id="tr-stats">0/0</span>'
      + '</div>'

      // Image area
      + '<div class="tr-case-area">'
      + '<div class="tr-img-box" id="tr-img-box">'
      + '<img id="tr-img" src="" alt="" style="display:none">'
      + (isDrill && isPLL ? '<img id="tr-img-2side" src="" alt="" style="display:none;margin-top:4px">' : '')
      + '<div id="tr-img-ph" class="tr-img-ph">Select a case</div>'
      + '</div>'
      + '<div class="tr-case-info">'
      + '<div class="tr-case-id" id="tr-case-id" style="opacity:0">—</div>'
      + '<div class="tr-case-group" id="tr-case-group"></div>'
      + '<div class="tr-hint" id="tr-hint" style="display:none"></div>'
      + '<div class="tr-alg hidden" id="tr-alg"></div>'
      + '</div></div>'

      // OLL MCQ
      + (isOLL && (isRecog || isTrain) ? '<div id="tr-oll-mcq" class="tr-oll-mcq hidden"></div>' : '')

      // Text input for PLL/COLL recognize & train
      + ((!isOLL) && (isRecog || isTrain) ? '<div class="tr-stt-row">'
        + '<input type="text" id="tr-answer" class="tr-answer-input" placeholder="Name the case (e.g. T perm, Ja)…" onkeydown="window.AlgTrainer.onAnswerKey(event)" autocomplete="off">'
        + '<button id="tr-stt-btn" class="' + (stt ? '' : 'disabled') + '" onclick="window.AlgTrainer.toggleSTT()">Mic</button>'
        + '</div>' : '')

      // Train bar
      + (isTrain ? '<div class="tr-train-bar"><span class="tr-streak" id="tr-streak">0 streak</span><span class="tr-elapsed" id="tr-elapsed">0.0s</span></div>' : '')

      // Feedback
      + '<div class="tr-feedback hidden" id="tr-feedback"></div>'

      // Actions
      + '<div class="tr-actions" id="tr-actions">'
      + (isDrill ? '<button class="tr-btn reveal" onclick="window.AlgTrainer.reveal()">Show Alg</button><button class="tr-btn correct" onclick="window.AlgTrainer.mark(true)">&#10003; Got it</button><button class="tr-btn wrong" onclick="window.AlgTrainer.mark(false)">&#10007; Missed</button><button class="tr-btn skip" onclick="window.AlgTrainer.skip()">Skip</button>' : '')
      + (isRecog ? '<button class="tr-btn reveal" onclick="window.AlgTrainer.revealHint()">Hint (H)</button><button class="tr-btn correct" onclick="window.AlgTrainer.mark(true)">&#10003; Got it</button><button class="tr-btn wrong" onclick="window.AlgTrainer.mark(false)">&#10007; Missed</button><button class="tr-btn skip" onclick="window.AlgTrainer.skip()">Skip</button>' : '')
      + (isTrain  ? '<button class="tr-btn skip" onclick="window.AlgTrainer.skip()">Skip (Space)</button>' : '')
      + '</div>'

      + '<div class="tr-progress"><div class="tr-progress-fill" id="tr-prog"></div></div>'
      + '<div class="tr-summary hidden" id="tr-summary"></div>';

    el.innerHTML = html;
    if (isRecog || isTrain) {
      setTimeout(function() {
        var a = document.getElementById('tr-answer');
        if (a) a.focus();
      }, 50);
    }
  }

  // ── Case logic ─────────────────────────────────────────────────────────────
  function nextCase() {
    var fb = document.getElementById('tr-feedback');
    if (fb) fb.classList.add('hidden');

    if (queueIdx >= queue.length) { showSummary(); return; }
    currentCase  = activeSet.cases[queue[queueIdx]];
    solvingStart = performance.now();

    // Reset display
    var idEl  = document.getElementById('tr-case-id');
    var algEl = document.getElementById('tr-alg');
    var hint  = document.getElementById('tr-hint');
    if (idEl)  { idEl.textContent = currentCase.id; idEl.style.opacity = '0'; }
    if (algEl) { algEl.textContent = currentCase.alg || ''; algEl.classList.add('hidden'); }
    if (hint)  { hint.style.display = 'none'; }

    loadImage(currentCase);

    var isOLL = activeSet.name && activeSet.name.toUpperCase().indexOf('OLL') >= 0;
    if ((mode === 'recognize' || mode === 'train') && isOLL) buildOLLMCQ();

    var ans = document.getElementById('tr-answer');
    if (ans) { ans.value = ''; setTimeout(function() { ans.focus(); }, 30); }
    if (mode === 'train') _startTick();
    updateProgress();
    updateStats();
  }

  function prevCase() {
    if (queueIdx > 0) queueIdx--;
    nextCase();
  }

  function loadImage(c) {
    var box = document.getElementById('tr-img-box');
    if (!box) return;
    // Use twisty-player for 3D render; fall back to flat image
    var puzzle = _eventToPuzzle(activeSet.event);
    var alg    = c.alg || '';
    var isPLL  = activeSet.name && activeSet.name.toUpperCase().indexOf('PLL') >= 0;

    if (customElements.get('twisty-player')) {
      // 3D render via cubing.js
      box.innerHTML = _twisty3d(alg, puzzle, isPLL ? '2-side' : 'top', 148);
    } else {
      // Fallback: VisualCube image
      var url = c.imageUrl || (activeSet.imgFn ? activeSet.imgFn(c.alg) : '');
      if (url) {
        box.innerHTML = '<img src="' + url + '" style="width:148px;height:148px;object-fit:contain" onerror="this.parentElement.innerHTML='(no image)'">';
      } else {
        box.innerHTML = '<span style="font-size:10px;color:var(--text3)">No image</span>';
      }
    }
  }

  function _twisty3d(alg, puzzle, view, size) {
    puzzle = puzzle || '3x3x3';
    size   = size || 150;
    // view: 'top' = plan view, '2-side' = slightly rotated to show 2 faces
    var cam = view === '2-side' ? '' : ' camera-latitude="90"';
    return '<twisty-player'
      + ' puzzle="' + puzzle + '"'
      + ' alg="' + alg.replace(/"/g, '&quot;') + '"'
      + ' hint-facelets="none"'
      + ' control-panel="none"'
      + cam
      + ' style="width:' + size + 'px;height:' + size + 'px;display:block">'
      + '</twisty-player>';
  }

  function _twisty(c, set, cls) {
    var puzzle = _eventToPuzzle(set ? set.event : '333');
    if (customElements.get('twisty-player')) {
      return '<twisty-player puzzle="' + puzzle + '" alg="'
        + (c.alg||'').replace(/"/g,'&quot;')
        + '" hint-facelets="none" control-panel="none" camera-latitude="90"'
        + ' class="' + (cls||'') + '" style="width:80px;height:80px;display:block"></twisty-player>';
    }
    var url = c.imageUrl || (set && set.imgFn ? set.imgFn(c.alg) : '');
    return url ? '<img src="' + url + '" class="tr-learn-img" onerror="this.style.display='none'">' : '';
  }

  function _eventToPuzzle(ev) {
    var map = { '222':'2x2x2','333':'3x3x3','444':'4x4x4','555':'5x5x5',
                '666':'6x6x6','777':'7x7x7','pyram':'pyraminx','skewb':'skewb',
                'sq1':'square1','minx':'megaminx','clock':'clock',
                '333oh':'3x3x3','333bf':'3x3x3','333fm':'3x3x3' };
    return map[ev] || '3x3x3';
  }

  function buildOLLMCQ() {
    var mcq = document.getElementById('tr-oll-mcq');
    if (!mcq || !currentCase) return;
    mcq.classList.remove('hidden');
    var pool    = activeSet.cases.filter(function(c) { return c.id !== currentCase.id; });
    var wrong   = _shuffle(pool).slice(0, 3);
    var options = _shuffle([currentCase].concat(wrong));
    mcq.innerHTML = options.map(function(c) {
      return '<button class="tr-oll-opt" onclick="window.AlgTrainer.submitOLL(\'' + c.id + '\')">' + c.id + '</button>';
    }).join('');
  }

  function submitOLL(id) {
    var correct = id === currentCase.id;
    document.querySelectorAll('.tr-oll-opt').forEach(function(b) {
      if (b.textContent.trim() === currentCase.id) b.classList.add('correct-ans');
      else if (b.textContent.trim() === id && !correct) b.classList.add('wrong-ans');
      b.disabled = true;
    });
    reveal();
    if (mode === 'train') {
      flashFeedback(correct);
      setTimeout(function() { mark(correct); }, 700);
    }
  }

  function reveal() {
    var idEl  = document.getElementById('tr-case-id');
    var algEl = document.getElementById('tr-alg');
    var hint  = document.getElementById('tr-hint');
    if (idEl)  idEl.style.opacity = '1';
    if (algEl) algEl.classList.remove('hidden');
    if (hint && currentCase && currentCase.hint) {
      hint.textContent = currentCase.hint;
      hint.style.display = 'block';
    }
  }

  function revealHint() {
    var hint = document.getElementById('tr-hint');
    if (hint && currentCase && currentCase.hint) {
      hint.textContent = currentCase.hint;
      hint.style.display = 'block';
    }
  }

  function mark(correct) {
    _stopTick();
    if (correct) {
      session.correct++;
      session.streak++;
      if (session.streak > session.best) session.best = session.streak;
    } else {
      session.incorrect++;
      session.streak = 0;
    }
    queueIdx++;
    nextCase();
  }

  function skip() {
    _stopTick();
    session.skipped++;
    session.streak = 0;
    queueIdx++;
    nextCase();
  }

  function onAnswerKey(e) {
    if (e.key !== 'Enter') return;
    var val = (document.getElementById('tr-answer').value || '').trim();
    if (!val) { revealHint(); return; }
    var norm = function(s) { return s.toLowerCase().replace(/[\s\-_.]+/g,'').replace(/perm$/,''); };
    var hit  = norm(val) === norm(currentCase ? currentCase.id : '');
    reveal();
    if (mode === 'train') {
      flashFeedback(hit);
      setTimeout(function() { mark(hit); }, 600);
    }
  }

  function flashFeedback(correct) {
    var fb = document.getElementById('tr-feedback');
    if (!fb) return;
    fb.textContent = correct ? '✓ Correct!' : '✗ ' + (currentCase ? currentCase.id : '');
    fb.className   = 'tr-feedback ' + (correct ? 'fb-correct' : 'fb-wrong');
  }

  function updateProgress() {
    var bar = document.getElementById('tr-prog');
    if (bar && queue.length) bar.style.width = (queueIdx / queue.length * 100) + '%';
  }

  function updateStats() {
    var el = document.getElementById('tr-stats');
    if (!el) return;
    var tot = session.correct + session.incorrect;
    var pct = tot ? Math.round(session.correct / tot * 100) : 0;
    el.textContent = session.correct + '/' + tot + ' (' + pct + '%) · ' + (queue.length - queueIdx) + ' left';
    var sk = document.getElementById('tr-streak');
    if (sk) sk.textContent = session.streak + ' streak';
  }

  function showSummary() {
    _stopTick();
    var el = document.getElementById('tr-summary');
    if (!el) return;
    var tot = session.correct + session.incorrect;
    var pct = tot ? Math.round(session.correct / tot * 100) : 0;
    el.innerHTML = '<div class="sum-title">Session complete!</div>'
      + '<div class="sum-score">' + session.correct + '/' + tot + ' correct · ' + pct + '%</div>'
      + '<div class="sum-avg">Best streak: ' + session.best + ' · Skipped: ' + session.skipped + '</div>'
      + '<div class="tr-actions" style="margin-top:10px">'
      + '<button class="tr-btn correct" onclick="window.AlgTrainer.startSet(\'' + activeKey + '\')">Restart</button>'
      + '<button class="tr-btn skip" onclick="window.AlgTrainer.backToSets()">&#8592; Back</button>'
      + '</div>';
    el.classList.remove('hidden');
    var actions = document.getElementById('tr-actions');
    if (actions) actions.classList.add('hidden');
  }

  // ── Elapsed tick ───────────────────────────────────────────────────────────
  function _startTick() {
    _stopTick();
    var start = solvingStart;
    function tick() {
      var el = document.getElementById('tr-elapsed');
      if (el) el.textContent = ((performance.now() - start) / 1000).toFixed(1) + 's';
      elapsedRaf = requestAnimationFrame(tick);
    }
    elapsedRaf = requestAnimationFrame(tick);
  }
  function _stopTick() {
    if (elapsedRaf) { cancelAnimationFrame(elapsedRaf); elapsedRaf = null; }
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  function _getUserNote(id) {
    try { return JSON.parse(localStorage.getItem('subx_user_notes') || '{}')[id] || ''; } catch(e) { return ''; }
  }
  function saveUserNote(id, text) {
    try {
      var notes = JSON.parse(localStorage.getItem('subx_user_notes') || '{}');
      notes[id] = text;
      localStorage.setItem('subx_user_notes', JSON.stringify(notes));
    } catch(e) {}
  }

  // ── STT ────────────────────────────────────────────────────────────────────
  function _initSTT() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { stt = null; return; }
    stt = new SR();
    stt.continuous = false; stt.interimResults = false; stt.lang = 'en-US';
    stt.onresult = function(e) {
      var t   = e.results[0][0].transcript;
      var inp = document.getElementById('tr-answer');
      if (inp) { inp.value = t; onAnswerKey({ key: 'Enter' }); }
      var btn = document.getElementById('tr-stt-btn');
      if (btn) btn.classList.remove('listening');
    };
    stt.onerror = stt.onend = function() {
      var btn = document.getElementById('tr-stt-btn');
      if (btn) btn.classList.remove('listening');
    };
  }
  function toggleSTT() {
    if (!stt) { alert('Voice not supported. Try Chrome.'); return; }
    var btn = document.getElementById('tr-stt-btn');
    if (btn && btn.classList.contains('listening')) { stt.stop(); btn.classList.remove('listening'); }
    else { try { stt.start(); if (btn) btn.classList.add('listening'); } catch(e) {} }
  }
  function _stopSTT() { try { if (stt) stt.stop(); } catch(e) {} }

  // ── Import / template ──────────────────────────────────────────────────────
  function openImport() {
    var el = document.getElementById('trainer-content');
    if (!el) return;
    el.innerHTML = '<div class="tr-top"><button class="btn-sm" onclick="window.AlgTrainer.backToSets()">&#8592; Back</button><span class="tr-title">Import Algorithm Set</span></div>'
      + '<div class="tr-import-wrap">'
      + '<div class="tr-import-section"><h3>Paste CSV</h3>'
      + '<p class="tr-import-hint">Columns: <code>Case, Alg, Notes, Group, Image URL</code></p>'
      + '<textarea id="tr-csv" class="tr-csv-input" placeholder="OLL 33,R U R\' U\' R\' F R F\',T-shape,T,"></textarea>'
      + '<div class="tr-import-row"><input id="tr-setname" type="text" placeholder="Set name" style="flex:1;padding:4px 8px;font-size:12px;background:var(--bg3);border:1px solid var(--border);color:var(--text);border-radius:3px;outline:none">'
      + '<button class="btn-primary" onclick="window.AlgTrainer.doImportCSV()">Import</button></div></div>'
      + '<div class="tr-import-section"><h3>SpeedCubeDB</h3>'
      + '<p class="tr-import-hint">Go to <a href="https://speedcubedb.com" target="_blank">speedcubedb.com</a>, copy alg table, paste as CSV.</p>'
      + '<button class="btn-sm" onclick="window.open(\'https://speedcubedb.com\',\'_blank\')">Open SpeedCubeDB</button>'
      + '</div></div>';
  }

  function downloadTemplate() {
    var name = activeSet ? activeSet.name : 'MySet';
    var rows = ['Case,Alg,Notes,Group,Image URL'];
    if (activeSet && activeSet.cases) {
      activeSet.cases.slice(0, 5).forEach(function(c) {
        rows.push([c.id,c.alg,c.notes||'',c.group||'',c.imageUrl||''].map(function(v){
          return '"' + String(v).replace(/"/g,'""') + '"';
        }).join(','));
      });
    } else {
      rows.push('"OLL 33","R U R\' U\' R\' F R F\'","T-shape","T",""');
    }
    if (typeof downloadFile === 'function') {
      downloadFile(rows.join('\n'), 'subx-' + name.toLowerCase().replace(/\s+/g,'-') + '-template.csv', 'text/csv');
    }
  }

  function doImportCSV() {
    var raw  = (document.getElementById('tr-csv') || {}).value || '';
    var name = ((document.getElementById('tr-setname') || {}).value || '').trim() || 'Imported';
    if (!raw.trim()) { alert('Paste CSV data first.'); return; }
    try {
      var lines = raw.trim().split('\n').filter(Boolean);
      var skip  = lines[0].toLowerCase().indexOf('case') >= 0;
      var cases = (skip ? lines.slice(1) : lines).map(function(l) {
        var c = _parseCSV(l);
        return { id:c[0]||'', alg:c[1]||'', notes:c[2]||'', group:c[3]||'', imageUrl:c[4]||'', hint:c[2]||'' };
      }).filter(function(c) { return c.id && c.alg; });
      if (!cases.length) { alert('No valid cases found.'); return; }
      var sets = _getCustomSets();
      var key  = 'custom_' + Date.now();
      sets[key] = { name:name, description:cases.length+' cases', event:'333', recognition:'standard', imgFn:null, cases:cases };
      _saveCustomSets(sets);
      alert('Imported "'+name+'" — '+cases.length+' cases.');
      backToSets();
    } catch(e) { alert('Import failed: '+e.message); }
  }

  function _parseCSV(line) {
    var r=[],cur='',inQ=false;
    for(var i=0;i<line.length;i++){
      var ch=line[i];
      if(ch==='"'&&!inQ){inQ=true;continue;}
      if(ch==='"'&&inQ&&line[i+1]==='"'){cur+='"';i++;continue;}
      if(ch==='"'&&inQ){inQ=false;continue;}
      if(ch===','&&!inQ){r.push(cur.trim());cur='';continue;}
      cur+=ch;
    }r.push(cur.trim());return r;
  }
  function _getCustomSets() {
    try { return JSON.parse(localStorage.getItem('subx_custom_algs')||'{}'); } catch(e) { return {}; }
  }
  function _saveCustomSets(s) {
    try { localStorage.setItem('subx_custom_algs', JSON.stringify(s)); } catch(e) {}
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _shuffle(a) {
    var b=[].concat(a);
    for(var i=b.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=b[i];b[i]=b[j];b[j]=t;}
    return b;
  }
  function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  // ── Expose globally ────────────────────────────────────────────────────────
  window.AlgTrainer = {
    init:init, show:show, hide:hide,
    setMode:setMode, startSet:startSet, backToSets:backToSets,
    reveal:reveal, revealHint:revealHint, mark:mark, skip:skip, prevCase:prevCase,
    nextCase:nextCase, onAnswerKey:onAnswerKey, submitOLL:submitOLL,
    toggleSTT:toggleSTT, openImport:openImport, downloadTemplate:downloadTemplate,
    doImportCSV:doImportCSV, saveUserNote:saveUserNote,
  };

})();
