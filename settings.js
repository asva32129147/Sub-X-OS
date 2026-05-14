// settings.js — settings modal, theme, event selector
// Depends on: storage.js, scramble.js, timer.js

'use strict';

const Settings = (() => {
  function init() {
    renderEventSelector();
    applyTheme(Storage.getSettings().theme);
    document.getElementById('btn-settings')?.addEventListener('click', open);
    document.getElementById('settings-overlay')?.addEventListener('click', e => {
      if (e.target === document.getElementById('settings-overlay')) close();
    });
    document.getElementById('settings-close')?.addEventListener('click', close);
  }

  // ─── Event selector ───────────────────────────────────────────────────────
  function renderEventSelector() {
    const el = document.getElementById('event-selector');
    if (!el) return;
    el.innerHTML = '';
    Object.entries(EVENTS).forEach(([code, def]) => {
      const o = document.createElement('option');
      o.value = code; o.textContent = def.name; el.appendChild(o);
    });
    const meta = Storage.getCurrentSession();
    if (meta) el.value = meta.event || '333';
    el.onchange = () => {
      Storage.setSessionEvent(Storage.getCurrentSessionId(), el.value);
      if (typeof App !== 'undefined') App.onEventChange(el.value);
      Timer.syncInspBtn(); // may change if except-bld mode
    };
    // Sync mobile selectors too
    syncAllEventSelectors();
  }

  function syncAllEventSelectors() {
    const main = document.getElementById('event-selector');
    if (!main) return;
    ['event-sel-mob','event-sel-drawer'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = main.innerHTML;
      el.value = main.value;
    });
  }

  function syncEventSelector() {
    const meta = Storage.getCurrentSession();
    const v = meta?.event || '333';
    ['event-selector','event-sel-mob','event-sel-drawer'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = v;
    });
  }

  // ─── Modal ────────────────────────────────────────────────────────────────
  function open() {
    document.getElementById('settings-overlay')?.classList.add('open');
    renderModal();
  }
  function close() {
    document.getElementById('settings-overlay')?.classList.remove('open');
  }

  function renderModal() {
    const el = document.getElementById('settings-content');
    if (!el) return;
    const s    = Storage.getSettings();
    const im   = s.inspectionMode ?? (s.inspection ? 'always' : 'off');
    const font = s.timerFont || 'roboto-mono';
    const it   = s.inspectionTime || 15;

    el.innerHTML = `
      <!-- ── Timer Input ─────────────────────────────────────────────── -->
      <section class="settings-section">
        <h3>Timer Input</h3>
        <div class="setting-row">
          <label>Input mode</label>
          <select id="s-input" class="s-select">
            <option value="space"    ${(s.timerInput||'space')==='space'   ?'selected':''}>Keyboard (Space / both Ctrl)</option>
            <option value="stackmat" ${s.timerInput==='stackmat'           ?'selected':''}>Stackmat (3.5mm audio jack)</option>
            <option value="bluetooth-timer" ${s.timerInput==='bluetooth-timer'?'selected':''}>GAN Halo Bluetooth Timer</option>
            <option value="virtual"  ${s.timerInput==='virtual'            ?'selected':''}>Virtual Cube (keyboard moves)</option>
            <option value="manual"   ${s.timerInput==='manual'             ?'selected':''}>Manual entry (type time)</option>
          </select>
        </div>
        <div class="setting-row">
          <label>Hold-to-start delay</label>
          <div style="display:flex;gap:6px;align-items:center">
            <input id="s-holddelay" type="range" min="0" max="1200" step="50"
              value="${s.holdDelay||550}" class="s-range"
              oninput="document.getElementById('s-holddelay-val').textContent=this.value+'ms'">
            <span id="s-holddelay-val" style="font-size:11px;color:var(--accent);min-width:44px">${s.holdDelay||550}ms</span>
          </div>
        </div>
      </section>

      <!-- ── Inspection ─────────────────────────────────────────────── -->
      <section class="settings-section">
        <h3>Inspection</h3>
        <div class="setting-row">
          <label>Mode</label>
          <select id="s-inspmode" class="s-select">
            <option value="always"     ${im==='always'    ?'selected':''}>Always</option>
            <option value="except-bld" ${im==='except-bld'?'selected':''}>Except BLD/FMC</option>
            <option value="off"        ${im==='off'       ?'selected':''}>Off</option>
          </select>
        </div>
        <div class="setting-row">
          <label>Duration</label>
          <select id="s-insptime" class="s-select">
            <option value="8"  ${it===8 ?'selected':''}>8 seconds</option>
            <option value="10" ${it===10?'selected':''}>10 seconds</option>
            <option value="12" ${it===12?'selected':''}>12 seconds</option>
            <option value="15" ${it===15?'selected':''}>15 seconds (WCA)</option>
            <option value="17" ${it===17?'selected':''}>17 seconds (non-WCA)</option>
            <option value="20" ${it===20?'selected':''}>20 seconds</option>
            <option value="30" ${it===30?'selected':''}>30 seconds</option>
          </select>
        </div>
        <div class="setting-row">
          <label>Voice countdown</label>
          <input id="s-inspvoice" type="checkbox" ${s.inspectionVoice!==false?'checked':''}>
        </div>
        <div class="setting-row">
          <label>Show +2 / DNF penalty</label>
          <input id="s-insppenalty" type="checkbox" ${s.inspectionPenalty!==false?'checked':''}>
        </div>
        <div class="setting-row">
          <label>Inspection training mode</label>
          <select id="s-infinsp" class="s-select">
            <option value="off"     ${(s.infiniteInspection||'off')==='off'    ?'selected':''}>Off — normal timed inspection</option>
            <option value="onelook" ${s.infiniteInspection==='onelook'         ?'selected':''}>Oneloooking — unlimited, plan full solve</option>
            <option value="crossp1" ${s.infiniteInspection==='crossp1'         ?'selected':''}>Cross + 1 planning</option>
            <option value="free"    ${s.infiniteInspection==='free'            ?'selected':''}>Free — plan anything, no time limit</option>
          </select>
        </div>
      </section>

      <!-- ── Display ────────────────────────────────────────────────── -->
      <section class="settings-section">
        <h3>Display</h3>
        <div class="setting-row">
          <label>Theme</label>
          <select id="s-theme" class="s-select">
            <option value="dark"   ${s.theme==='dark'  ?'selected':''}>Dark</option>
            <option value="light"  ${s.theme==='light' ?'selected':''}>Light</option>
            <option value="amoled" ${s.theme==='amoled'?'selected':''}>AMOLED Black</option>
            <option value="green"  ${s.theme==='green' ?'selected':''}>Terminal Green</option>
          </select>
        </div>
        <div class="setting-row">
          <label>Timer font</label>
          <select id="s-font" class="s-select">
            <option value="roboto-mono" ${font==='roboto-mono'?'selected':''}>Roboto Mono</option>
            <option value="rubik"       ${font==='rubik'      ?'selected':''}>Rubik (round)</option>
            <option value="outfit"      ${font==='outfit'     ?'selected':''}>Outfit (modern)</option>
            <option value="segment"     ${font==='segment'    ?'selected':''}>Share Tech Mono (retro)</option>
          </select>
        </div>
        <div class="setting-row">
          <label>Timer size</label>
          <select id="s-timersize" class="s-select">
            <option value="small"  ${(s.timerSize||'large')==='small' ?'selected':''}>Small</option>
            <option value="medium" ${(s.timerSize||'large')==='medium'?'selected':''}>Medium</option>
            <option value="large"  ${(s.timerSize||'large')==='large' ?'selected':''}>Large</option>
            <option value="xlarge" ${(s.timerSize||'large')==='xlarge'?'selected':''}>X-Large</option>
          </select>
        </div>
        <div class="setting-row">
          <label>Time format</label>
          <select id="s-timefmt" class="s-select">
            <option value="auto"          ${(s.timeFormat||'auto')==='auto'         ?'selected':''}>Auto (MM:SS when &gt;1min)</option>
            <option value="always_minutes"${s.timeFormat==='always_minutes'         ?'selected':''}>Always show minutes</option>
            <option value="centiseconds"  ${s.timeFormat==='centiseconds'           ?'selected':''}>Centiseconds always</option>
            <option value="milliseconds"  ${s.timeFormat==='milliseconds'           ?'selected':''}>Milliseconds (0.001s)</option>
          </select>
        </div>
        <div class="setting-row">
          <label>Hide time while running</label>
          <input id="s-hidetime" type="checkbox" ${s.hideTime?'checked':''}>
        </div>
        <div class="setting-row">
          <label>PB alert flash</label>
          <input id="s-pbalert" type="checkbox" ${s.pbAlert!==false?'checked':''}>
        </div>
      </section>

      <!-- ── Scramble ───────────────────────────────────────────────── -->
      <section class="settings-section">
        <h3>Scramble</h3>
        <div class="setting-row">
          <label>Alignment</label>
          <select id="s-scralign" class="s-select">
            <option value="left"   ${(s.scrambleAlign||'center')==='left'  ?'selected':''}>Left</option>
            <option value="center" ${(s.scrambleAlign||'center')==='center'?'selected':''}>Center</option>
            <option value="right"  ${(s.scrambleAlign||'center')==='right' ?'selected':''}>Right</option>
          </select>
        </div>
        <div class="setting-row">
          <label>Font size</label>
          <select id="s-scrsize" class="s-select">
            <option value="small"  ${s.scrambleSize==='small' ?'selected':''}>Small</option>
            <option value="medium" ${(s.scrambleSize||'medium')==='medium'?'selected':''}>Medium</option>
            <option value="large"  ${s.scrambleSize==='large' ?'selected':''}>Large</option>
          </select>
        </div>
        <div class="setting-row">
          <label>Show event label</label>
          <input id="s-evlabel" type="checkbox" ${s.showEventLabel?'checked':''}>
        </div>
      </section>

      <!-- ── Multi-Phase ────────────────────────────────────────────── -->
      <section class="settings-section">
        <h3>Multi-Phase Timing</h3>
        <div class="setting-row">
          <label>Enable multi-phase</label>
          <input id="s-multiphase" type="checkbox" ${s.multiPhase?'checked':''}
            onchange="document.getElementById('s-phase-opts').style.display=this.checked?'contents':'none'">
        </div>
        <div id="s-phase-opts" style="display:${s.multiPhase?'contents':'none'}">
          <div class="setting-row">
            <label>Phase count</label>
            <input id="s-phasecount" type="number" min="2" max="8" value="${s.phaseCount||4}" class="s-input" style="width:60px">
          </div>
          <div class="setting-row">
            <label>Phase labels</label>
            <input id="s-phaselabels" type="text" value="${s.phaseLabels||'Cross,F2L,OLL,PLL'}"
              class="s-input" style="flex:1" placeholder="e.g. Cross,F2L,OLL,PLL">
          </div>
        </div>
      </section>

      <!-- ── Stats ──────────────────────────────────────────────────── -->
      <section class="settings-section">
        <h3>Statistics</h3>
        <div class="setting-row">
          <label>Show session stats panel</label>
          <input id="s-showstats" type="checkbox" ${s.showSessionStats!==false?'checked':''}>
        </div>
        <div class="setting-row">
          <label>Show solve count</label>
          <input id="s-showcount" type="checkbox" ${s.showSolveCount!==false?'checked':''}>
        </div>
      </section>

      <!-- ── Data ───────────────────────────────────────────────────── -->
      <section class="settings-section">
        <h3>Data</h3>
        <div class="setting-row">
          <button class="btn-sm" onclick="Sessions.exportCSTimer()">Export (csTimer format)</button>
        </div>
        <div class="setting-row">
          <button class="btn-sm" onclick="UniversalImport.open()">Import from any timer</button>
        </div>
      </section>

      <div class="settings-footer">
        <button class="btn-primary" onclick="Settings.saveAndClose()">Save</button>
      </div>`;
  }

  function saveAndClose() {
    const s   = Storage.getSettings();
    const get = id => document.getElementById(id);
    const chk = id => { const e = get(id); return e ? e.checked : undefined; };
    const sel = id => { const e = get(id); return e ? e.value   : undefined; };
    const num = (id, def) => { const e = get(id); return e ? (parseInt(e.value)||def) : def; };

    // Input
    const inp = sel('s-input');    if (inp) s.timerInput = inp;
    s.holdDelay = num('s-holddelay', 550);

    // Inspection
    const im = sel('s-inspmode');
    if (im) { s.inspectionMode = im; s.inspection = im !== 'off'; }
    const it = sel('s-insptime');
    if (it) s.inspectionTime = parseInt(it);
    const iv = chk('s-inspvoice');   if (iv !== undefined) s.inspectionVoice  = iv;
    const ip = chk('s-insppenalty'); if (ip !== undefined) s.inspectionPenalty = ip;
    const ii = sel('s-infinsp');     if (ii) s.infiniteInspection = ii;

    // Display
    const th = sel('s-theme');     if (th) { s.theme = th; applyTheme(th); }
    const fn = sel('s-font');      if (fn) { s.timerFont = fn; applyFont(fn); }
    const ts = sel('s-timersize'); if (ts) { s.timerSize = ts; applyTimerSize(ts); }
    const tf = sel('s-timefmt');   if (tf) s.timeFormat = tf;
    const ht = chk('s-hidetime');  if (ht !== undefined) s.hideTime = ht;
    const pb = chk('s-pbalert');   if (pb !== undefined) s.pbAlert  = pb;

    // Scramble
    const sa = sel('s-scralign'); if (sa) { s.scrambleAlign = sa; applyScrambleAlign(sa); }
    const ss = sel('s-scrsize');  if (ss) s.scrambleSize = ss;
    const el = chk('s-evlabel');  if (el !== undefined) s.showEventLabel = el;

    // Multi-phase
    const mp = chk('s-multiphase'); if (mp !== undefined) s.multiPhase = mp;
    s.phaseCount  = num('s-phasecount', 4);
    const pl = get('s-phaselabels'); if (pl) s.phaseLabels = pl.value;

    // Stats
    const ss2 = chk('s-showstats'); if (ss2 !== undefined) s.showSessionStats = ss2;
    const sc  = chk('s-showcount'); if (sc  !== undefined) s.showSolveCount   = sc;

    Object.entries(s).forEach(([k,v]) => Storage.setSetting(k, v));
    Timer.refreshCfg();
    Timer.syncInspBtn();
    if (typeof App !== 'undefined') App.onSettingsChange();
    close();
  }

  function applyTimerSize(size) {
    const sizes = { small:'clamp(32px,6vw,64px)', medium:'clamp(44px,8vw,90px)',
                    large:'clamp(52px,10vw,120px)', xlarge:'clamp(72px,14vw,160px)' };
    document.documentElement.style.setProperty('--font-size-timer', sizes[size] || sizes.large);
  }

  function applyScrambleSize(size) {
    const sizes = { small:'11px', medium:'clamp(11px,1.7vw,16px)', large:'clamp(14px,2.2vw,20px)' };
    const el = document.getElementById('scramble-display');
    if (el) el.style.fontSize = sizes[size] || sizes.medium;
  }

  function applyFont(f) {
    const fonts = {
      'roboto-mono': "'Roboto Mono', monospace",
      'digital':     "'Share Tech Mono', monospace",
      'rubik':       "'Rubik', sans-serif",
      'outfit':      "'Outfit', sans-serif",
      'segment':     "'Share Tech Mono', monospace",
    };
    document.documentElement.style.setProperty('--font-timer', fonts[f] || fonts['roboto-mono']);
  }

  function applyScrambleAlign(align) {
    const el = document.getElementById('scramble-display');
    if (el) el.style.textAlign = align || 'center';
    const wrap = document.getElementById('scramble-wrap');
    if (wrap) {
      wrap.style.justifyContent = align === 'left' ? 'flex-start'
        : align === 'right' ? 'flex-end' : 'center';
    }
  }

  function applyTheme(t) {
    document.documentElement.dataset.theme = t || 'dark';
    // Update theme-color meta for mobile
    const meta = document.querySelector('meta[name="theme-color"]');
    const colors = { dark:'#1a1a1a', light:'#f5f5f5', amoled:'#000000', green:'#0a0f0a' };
    if (meta) meta.content = colors[t] || '#1a1a1a';
  }

  return { init, open, close, saveAndClose, syncEventSelector, renderEventSelector, applyTheme, applyFont, applyScrambleAlign, applyTimerSize, applyScrambleSize };
})();
