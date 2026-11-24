// RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF/LF, BOM, comma/semicolon/tab delimiters.
// Returns { headers, rows, errors, ragged, delim }. Malformed files produce errors instead of guessed data.
export function parseCsv(text) {
  text = String(text ?? '').replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].reduce((best, d) => (count(firstLine, d) > count(firstLine, best) ? d : best), ',');
  const rows = [], errors = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') {
        quoted = false;
        const nx = text[i + 1];
        // Only a delimiter or a line end may follow a closing quote; anything else is malformed.
        if (nx !== undefined && nx !== delim && nx !== '\n' && nx !== '\r') { errors.push(`Unexpected text after a closing quote (line ${rows.length + 1}).`); break; }
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (quoted) errors.push('A quoted field is never closed (unbalanced " in the file).');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter(r => r.some(v => v.trim() !== ''));
  const headers = (nonEmpty.shift() || []).map(h => h.trim());
  const dupes = headers.filter((h, i) => h && headers.indexOf(h) !== i);
  if (dupes.length) errors.push(`Duplicate column names: ${[...new Set(dupes)].join(', ')}.`);
  const ragged = nonEmpty.filter(r => r.length !== headers.length).length;
  return { headers, rows: nonEmpty.map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()]))), errors, ragged, delim };
}

function count(s, ch) { return s.split(ch).length - 1; }

// "1,234" "1.2K" "3.4M" "12%" -> number; blank -> null (missing stays missing, never 0).
// Returns undefined for values that cannot be read safely (junk, or "1,5" which may be 1.5 or 15).
// decimalComma: the file uses ; as delimiter, so "1.234,5" means 1234.5.
export function toNumber(v, { decimalComma = false } = {}) {
  if (v == null) return null;
  let s = String(v).trim().replace(/\s/g, '').replace(/^[$€£]/, '');
  if (!s || s === '-' || s === '--') return null;
  let mult = 1;
  const suffix = s.slice(-1).toUpperCase();
  if (suffix === 'K') mult = 1e3; else if (suffix === 'M') mult = 1e6; else if (suffix === 'B') mult = 1e9;
  if (mult !== 1 || s.endsWith('%')) s = s.slice(0, -1);
  if (decimalComma) s = s.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  else if (s.includes(',')) {
    if (!/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return undefined; // not a thousands separator: ambiguous
    s = s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n * mult : undefined;
}

// Short stable hash (FNV-1a) for duplicate-file detection.
export function fingerprint(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16) + ':' + text.length;
}
