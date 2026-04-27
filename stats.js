// stats.js — live stats panel (Ao5, Ao12, Ao25, Ao100, PB, mean, session count)
// Depends on: utils.js, storage.js

'use strict';

const Stats = (() => {
  // ─── Refresh ──────────────────────────────────────────────────────────────
  function refresh() {
    const sessionId = Storage.getCurrentSessionId();
    const times     = Storage.getEffectiveTimes(sessionId);
    render(times);
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  function render(times) {
    const el = document.getElementById('stats-panel');
    if (!el) return;

    if (!times.length) {
      el.innerHTML = emptyStats();
      return;
    }

    const valid = times.filter(t => t >= 0);
    const pb    = valid.length ? Math.min(...valid) : null;
    const mean  = valid.length ? Math.round(valid.reduce((a,b)=>a+b,0) / valid.length) : null;

    // Current rolling averages (last N solves)
    const mo3  = wcaAverage(times, 3);
    const ao5  = wcaAverage(times, 5);
    const ao12 = wcaAverage(times, 12);
    const ao25 = wcaAverage(times, 25);
    const ao50 = wcaAverage(times, 50);
    const ao100= wcaAverage(times, 100);

    // Best rolling averages (all-time)
    const bmo3  = bestAverage(times, 3);
    const bao5  = bestAverage(times, 5);
    const bao12 = bestAverage(times, 12);
    const bao25 = bestAverage(times, 25);
    const bao50 = bestAverage(times, 50);
    const bao100= bestAverage(times, 100);

    el.innerHTML = `
      <div class="stat-row">
        <span class="stat-label">Solves</span>
        <span class="stat-cur">${times.length}</span>
        <span class="stat-best"></span>
      </div>
      ${statRow('PB',      pb,    null)}
      ${statRow('Mean',    mean,  null)}
      ${statRow('Mo3',     mo3,   bmo3)}
      ${statRow('Ao5',     ao5,   bao5)}
      ${statRow('Ao12',    ao12,  bao12)}
      ${statRow('Ao25',    ao25,  bao25)}
      ${statRow('Ao50',    ao50,  bao50)}
      ${statRow('Ao100',   ao100, bao100)}
    `;
  }

  function statRow(label, cur, best) {
    const curStr  = cur  === null ? '—' : cur  === -1 ? 'DNF' : formatTime(cur);
    const bestStr = best === null ? ''  : best === -1 ? 'DNF' : formatTime(best);
    const isPb = best !== null && cur !== null && cur !== -1 && cur === best && cur !== 0;
    return `
      <div class="stat-row${isPb ? ' is-pb' : ''}">
        <span class="stat-label">${label}</span>
        <span class="stat-cur">${curStr}</span>
        <span class="stat-best">${bestStr ? `(${bestStr})` : ''}</span>
      </div>`;
  }

  function emptyStats() {
    const rows = ['PB','Mean','Mo3','Ao5','Ao12','Ao25','Ao50','Ao100'];
    return `
      <div class="stat-row">
        <span class="stat-label">Solves</span>
        <span class="stat-cur">0</span>
        <span class="stat-best"></span>
      </div>
      ${rows.map(l => `
      <div class="stat-row">
        <span class="stat-label">${l}</span>
        <span class="stat-cur">—</span>
        <span class="stat-best"></span>
      </div>`).join('')}`;
  }

  // ─── Inline average helpers (re-exported from utils for convenience) ───────
  function wcaAverage(times, n) {
    if (!times || times.length < n) return null;
    const window = times.slice(-n);
    const dnfCount = window.filter(t => t === -1).length;
    if (n === 3) {
      if (dnfCount > 0) return -1;
      return Math.round(window.reduce((a,b)=>a+b,0) / 3);
    }
    const trim = n <= 12 ? 1 : Math.floor(n * 0.05);
    if (dnfCount > trim) return -1;
    const sortable = window.map(t => t === -1 ? Number.MAX_SAFE_INTEGER : t);
    sortable.sort((a,b)=>a-b);
    const trimmed = sortable.slice(trim, sortable.length - trim);
    return Math.round(trimmed.reduce((a,b)=>a+b,0) / trimmed.length);
  }

  function bestAverage(times, n) {
    if (!times || times.length < n) return null;
    let best = null;
    for (let i = n-1; i < times.length; i++) {
      const avg = wcaAverage(times.slice(0, i+1), n);
      if (avg !== null && avg !== -1 && (best === null || avg < best)) best = avg;
    }
    return best;
  }

  // ─── Detailed solve-list overlay (shown when clicking a stat row) ─────────
  function showDetail(label, times, n) {
    const el = document.getElementById('stat-detail-overlay');
    if (!el) return;

    const window = times.slice(-n);
    const avg    = wcaAverage(times, n);
    const trim   = n <= 3 ? 0 : n <= 12 ? 1 : Math.floor(n * 0.05);

    const sortedIdxs = window
      .map((t, i) => ({ t, i }))
      .sort((a,b) => a.t - b.t);

    const trimLow  = new Set(sortedIdxs.slice(0, trim).map(x => x.i));
    const trimHigh = new Set(sortedIdxs.slice(-trim).map(x => x.i));

    const rows = window.map((t, i) => {
      const isTrimmed = trimLow.has(i) || trimHigh.has(i);
      const ts = formatTime(t === -1 ? -1 : t);
      return `<span class="${isTrimmed ? 'trimmed' : ''}">${ts}</span>`;
    }).join(', ');

    el.innerHTML = `
      <div class="detail-header">
        <strong>${label} = ${formatTime(avg)}</strong>
        <button onclick="document.getElementById('stat-detail-overlay').style.display='none'">✕</button>
      </div>
      <div class="detail-times">${rows}</div>`;
    el.style.display = 'block';
  }

  return { refresh, render, showDetail };
})();
