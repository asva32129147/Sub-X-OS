// utils.js — time formatting, WCA averages, helper functions
// Sub-X OS | No dependencies — loaded first

'use strict';

// ─── Time Formatting ──────────────────────────────────────────────────────────

/**
 * Format raw centiseconds to display string.
 * @param {number} cs  Centiseconds (integer). -1 = DNF.
 * @returns {string}   e.g. "9.43", "1:03.27", "DNF"
 */
function formatTime(cs) {
  if (cs === -1) return 'DNF';
  if (cs === -2) return '+2';
  if (!Number.isFinite(cs) || cs < 0) return '—';
  const total = Math.abs(cs);
  const h = Math.floor(total / 360000);
  const m = Math.floor((total % 360000) / 6000);
  const s = Math.floor((total % 6000) / 100);
  const c = total % 100;
  const cc = c.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');
  if (h > 0) return `${h}:${m.toString().padStart(2,'0')}:${ss}.${cc}`;
  if (m > 0) return `${m}:${ss}.${cc}`;
  return `${s}.${cc}`;
}

/**
 * Format centiseconds as a compact string (no leading zeros for minutes).
 * Used in solve list where space is limited.
 */
function formatTimeCompact(cs) {
  if (cs === -1) return 'DNF';
  const t = formatTime(cs);
  return t;
}

/**
 * Parse a time string "M:SS.cc" or "S.cc" → centiseconds.
 * Returns null on parse failure.
 */
function parseTime(str) {
  if (!str || typeof str !== 'string') return null;
  str = str.trim();
  if (str.toUpperCase() === 'DNF') return -1;
  const parts = str.split(':');
  try {
    if (parts.length === 3) {
      const [h, m, sc] = parts;
      const [s, c = '0'] = sc.split('.');
      return (parseInt(h) * 360000) + (parseInt(m) * 6000) +
             (parseInt(s) * 100) + parseInt(c.padEnd(2,'0').slice(0,2));
    }
    if (parts.length === 2) {
      const [m, sc] = parts;
      const [s, c = '0'] = sc.split('.');
      return (parseInt(m) * 6000) + (parseInt(s) * 100) +
             parseInt(c.padEnd(2,'0').slice(0,2));
    }
    const [s, c = '0'] = str.split('.');
    return (parseInt(s) * 100) + parseInt(c.padEnd(2,'0').slice(0,2));
  } catch { return null; }
}

// ─── WCA Average Calculation ──────────────────────────────────────────────────

/**
 * Calculate a WCA-compliant trimmed average.
 * @param {number[]} times  Array of centisecond values. -1 = DNF.
 * @param {number}   n      Average size (5, 12, 25, 50, 100, ...).
 * @returns {number|null}   Result in centiseconds, -1 if DNF, null if not enough data.
 */
function wcaAverage(times, n) {
  if (!times || times.length < n) return null;
  const window = times.slice(-n);
  const dnfCount = window.filter(t => t === -1).length;

  // Mo3: no trimming, any DNF = DNF
  if (n === 3) {
    if (dnfCount > 0) return -1;
    return Math.round(window.reduce((a, b) => a + b, 0) / 3);
  }

  // Ao5, Ao12: trim 1 each end
  // Ao25+: trim 5% each end (floor)
  const trim = n <= 12 ? 1 : Math.floor(n * 0.05);
  if (dnfCount > trim) return -1; // more DNFs than we can trim = DNF average

  // Replace DNF with sentinel max for sorting
  const sortable = window.map(t => t === -1 ? Number.MAX_SAFE_INTEGER : t);
  sortable.sort((a, b) => a - b);
  const trimmed = sortable.slice(trim, sortable.length - trim);

  return Math.round(trimmed.reduce((a, b) => a + b, 0) / trimmed.length);
}

/**
 * Calculate best (lowest non-DNF) average of size n over an array of times.
 * Returns null if there are fewer than n solves.
 */
function bestAverage(times, n) {
  if (!times || times.length < n) return null;
  let best = null;
  for (let i = n - 1; i < times.length; i++) {
    const avg = wcaAverage(times.slice(0, i + 1), n);
    if (avg !== null && avg !== -1) {
      if (best === null || avg < best) best = avg;
    }
  }
  return best;
}

/**
 * Calculate all rolling averages for a solve list.
 * Returns {current, best} for each average type.
 * @param {number[]} times  All solve times in order (centiseconds).
 * @returns {Object}
 */
function calcAllStats(times) {
  const valid = times.filter(t => t >= 0);
  const pb = valid.length ? Math.min(...valid) : null;
  const mean = valid.length
    ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
    : null;

  const sizes = [3, 5, 12, 25, 50, 100, 200, 500, 1000];
  const stats = { pb, mean };

  for (const n of sizes) {
    const label = n === 3 ? 'mo3' : `ao${n}`;
    stats[label] = {
      current: wcaAverage(times, n),
      best: bestAverage(times, n),
    };
  }
  return stats;
}

// ─── General Helpers ──────────────────────────────────────────────────────────

/** Generate a random ID (8 hex chars) */
function uid() {
  return Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0');
}

/** Debounce: returns a function that delays invoking fn until after wait ms. */
function debounce(fn, wait) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

/** Clamp a value between min and max. */
function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

/** Format a Date object as a readable string. */
function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Format a Date object as time string. */
function formatDatetime(ts) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/**
 * Ordinal suffix for a number (1st, 2nd, 3rd, ...).
 */
function ordinal(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Copy text to clipboard, fallback for older browsers.
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  }
}

/**
 * Download a string as a file.
 */
function downloadFile(content, filename, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Slugify a string for use as an HTML id.
 */
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Exported via global scope (no modules needed)
// All functions above are available globally once this file is loaded.
