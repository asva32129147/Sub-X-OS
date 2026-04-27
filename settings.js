// settings.js — settings modal, theme switching, event selection
// Depends on: storage.js, scramble.js (EVENTS), timer.js

'use strict';

const Settings = (() => {
  let isOpen = false;

  // ─── Init ──────────────────────────────────────────────────────────────────
  function init() {
    renderEventSelector();
    applyTheme(Storage.getSettings().theme);
    bindSettingsBtn();
    bindModal();
  }

  // ─── Event selector in toolbar ────────────────────────────────────────────
  function renderEventSelector() {
    const el = document.getElementById('event-selector');
    if (!el) return;
    el.innerHTML = '';
    Object.entries(EVENTS).forEach(([code, def]) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = def.name;
      el.appendChild(opt);
    });
    // Set to current session event
    const meta = Storage.getCurrentSession();
    if (meta) el.value = meta.event || '333';

    el.onchange = () => {
      const sessionId = Storage.getCurrentSessionId();
      Storage.setSessionEvent(sessionId, el.value);
      if (typeof App !== 'undefined') App.onEventChange(el.value);
    };
  }

  function syncEventSelector() {
    const el = document.getElementById('event-selector');
    if (!el) return;
    const meta = Storage.getCurrentSession();
    if (meta) el.value = meta.event || '333';
  }

  // ─── Settings modal ───────────────────────────────────────────────────────
  function bindSettingsBtn() {
    const btn = document.getElementById('btn-settings');
    if (btn) btn.onclick = () => open();
  }

  function bindModal() {
    const overlay = document.getElementById('settings-overlay');
    if (overlay) overlay.onclick = e => { if (e.target === overlay) close(); };

    const closeBtn = document.getElementById('settings-close');
    if (closeBtn) closeBtn.onclick = close;
  }

  function open() {
    isOpen = true;
    const overlay = document.getElementById('settings-overlay');
    if (overlay) overlay.classList.add('open');
    renderModal();
  }

  function close() {
    isOpen = false;
    const overlay = document.getElementById('settings-overlay');
    if (overlay) overlay.classList.remove('open');
  }

  function renderModal() {
    const el = document.getElementById('settings-content');
    if (!el) return;
    const s = Storage.getSettings();

    el.innerHTML = `
      <section class="settings-section">
        <h3>Timer Input</h3>
        <div class="setting-row">
          <label>Input mode</label>
          <select id="s-input" class="s-select">
            <option value="space"    ${s.timerInput==='space'?'selected':''}>Spacebar</option>
            <option value="stackmat" ${s.timerInput==='stackmat'?'selected':''}>Stackmat (both Ctrl keys)</option>
          </select>
        </div>
        <div class="setting-row">
          <label>Hold delay (ms)</label>
          <input id="s-holddelay" type="number" min="0" max="2000" step="50"
            value="${s.holdDelay}" class="s-input">
        </div>
      </section>

      <section class="settings-section">
        <h3>Inspection</h3>
        <div class="setting-row">
          <label>Enable inspection</label>
          <input id="s-insp" type="checkbox" ${s.inspection?'checked':''}>
        </div>
        <div class="setting-row">
          <label>Inspection time (s)</label>
          <select id="s-insptime" class="s-select">
            <option value="15" ${s.inspectionTime===15?'selected':''}>15s (WCA)</option>
            <option value="8"  ${s.inspectionTime===8?'selected':''}>8s (FMC)</option>
            <option value="0"  ${s.inspectionTime===0?'selected':''}>None</option>
          </select>
        </div>
        <div class="setting-row">
          <label>Voice countdown</label>
          <input id="s-inspvoice" type="checkbox" ${s.inspectionVoice?'checked':''}>
        </div>
      </section>

      <section class="settings-section">
        <h3>Appearance</h3>
        <div class="setting-row">
          <label>Theme</label>
          <select id="s-theme" class="s-select">
            <option value="dark"   ${s.theme==='dark'?'selected':''}>Dark (default)</option>
            <option value="light"  ${s.theme==='light'?'selected':''}>Light</option>
            <option value="amoled" ${s.theme==='amoled'?'selected':''}>AMOLED Black</option>
            <option value="green"  ${s.theme==='green'?'selected':''}>Terminal Green</option>
          </select>
        </div>
        <div class="setting-row">
          <label>Show scramble</label>
          <input id="s-showscr" type="checkbox" ${s.showScramble?'checked':''}>
        </div>
        <div class="setting-row">
          <label>Hide timer while running</label>
          <input id="s-hidetime" type="checkbox" ${s.hideTime?'checked':''}>
        </div>
      </section>

      <section class="settings-section">
        <h3>Data</h3>
        <div class="setting-row">
          <button class="btn-sm" onclick="Sessions.exportCSTimer()">Export (csTimer format)</button>
        </div>
        <div class="setting-row">
          <label class="btn-sm" style="cursor:pointer">
            Import (csTimer format)
            <input type="file" accept=".txt,.json" style="display:none"
              onchange="Sessions.importCSTimer(this.files[0])">
          </label>
        </div>
      </section>

      <div class="settings-footer">
        <button class="btn-primary" onclick="Settings.saveAndClose()">Save &amp; Close</button>
      </div>
    `;
  }

  function saveAndClose() {
    const s = Storage.getSettings();

    const inp = document.getElementById('s-input');
    if (inp) s.timerInput = inp.value;

    const hd = document.getElementById('s-holddelay');
    if (hd) s.holdDelay = Math.max(0, parseInt(hd.value) || 550);

    const insp = document.getElementById('s-insp');
    if (insp) s.inspection = insp.checked;

    const it = document.getElementById('s-insptime');
    if (it) s.inspectionTime = parseInt(it.value);

    const iv = document.getElementById('s-inspvoice');
    if (iv) s.inspectionVoice = iv.checked;

    const theme = document.getElementById('s-theme');
    if (theme) { s.theme = theme.value; applyTheme(theme.value); }

    const showScr = document.getElementById('s-showscr');
    if (showScr) s.showScramble = showScr.checked;

    const hide = document.getElementById('s-hidetime');
    if (hide) s.hideTime = hide.checked;

    // Persist all at once
    Object.entries(s).forEach(([k,v]) => Storage.setSetting(k, v));

    Timer.refreshCfg();
    if (typeof App !== 'undefined') App.onSettingsChange();
    close();
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme || 'dark';
  }

  return {
    init,
    open,
    close,
    saveAndClose,
    syncEventSelector,
    applyTheme,
  };
})();
