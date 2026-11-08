// Text helpers. Every value that comes from a source passes through clean() before display.

// C0, DEL, C1 controls, bidi marks/overrides/isolates. ESC is in C0, so escape sequences lose their introducer.
const CONTROL = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u061c\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]', 'g');
const BREAKS = new RegExp('[\\t\\r\\n\\u2028\\u2029]+', 'g');

export function clean(value, max = 200) {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(BREAKS, ' ').replace(CONTROL, '?');
  return cut(text, max);
}

// ponytail: counts code points, not display cells; wide CJK/emoji can overflow a column.
export function cut(text, max) {
  if (!Number.isFinite(max)) return text;
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, Math.max(0, max - 1)).join('') + '…';
}

export function num(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : 'n/a';
}

export function pad(text, width) {
  const length = Array.from(text).length;
  return length >= width ? cut(text, width) : text + ' '.repeat(width - length);
}

export function stamp(value) {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 16).replace('T', ' ') + 'Z' : 'n/a';
}

export function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function age(value, now) {
  const date = toDate(value);
  if (!date) return 'n/a';
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  const abs = Math.abs(seconds);
  const text = abs < 60 ? `${abs}s` : abs < 3600 ? `${Math.floor(abs / 60)}m` : abs < 172800 ? `${Math.floor(abs / 3600)}h` : `${Math.floor(abs / 86400)}d`;
  return seconds >= 0 ? `${text} ago` : `in ${text}`;
}
