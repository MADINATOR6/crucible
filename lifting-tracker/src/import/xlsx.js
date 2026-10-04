// Minimal, dependency-free .xlsx reader (ES module; Node 18+ and browsers).
// Reads sheets, shared strings, merged ranges and date-formatted cells.
// It does not write files, evaluate formulas or run macros: formula cells keep
// their cached value.

const td = new TextDecoder('utf-8');

function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Parse a zip archive. Returns Map(name -> () => Promise<Uint8Array>). */
export function openZip(input) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file (no end-of-central-directory record).');
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (u32(b, p) !== 0x02014b50) throw new Error('Corrupt zip central directory.');
    const method = u16(b, p + 10);
    const csize = u32(b, p + 20);
    const nameLen = u16(b, p + 28);
    const extraLen = u16(b, p + 30);
    const commentLen = u16(b, p + 32);
    const localOff = u32(b, p + 42);
    const name = td.decode(b.subarray(p + 46, p + 46 + nameLen));
    entries.set(name, async () => {
      if (u32(b, localOff) !== 0x04034b50) throw new Error('Corrupt zip local header: ' + name);
      const ln = u16(b, localOff + 26);
      const le = u16(b, localOff + 28);
      const start = localOff + 30 + ln + le;
      const data = b.subarray(start, start + csize);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      throw new Error('Unsupported zip compression method ' + method + ' for ' + name);
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function unescapeXml(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, g) => {
    if (g === 'amp') return '&';
    if (g === 'lt') return '<';
    if (g === 'gt') return '>';
    if (g === 'quot') return '"';
    if (g === 'apos') return "'";
    const cp = g[1] === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
    return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
  });
}

function attrs(tag) {
  const out = {};
  const re = /([\w:.-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(tag))) out[m[1]] = unescapeXml(m[2]);
  return out;
}

function textOf(xml) {
  // Concatenate <t> nodes, skipping phonetic runs (<rPh>).
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let s = '';
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g;
  let m;
  while ((m = re.exec(clean))) s += m[1] ? unescapeXml(m[1]) : '';
  return s;
}

/** "AB12" -> {row: 11, col: 27} (zero-based). */
export function parseRef(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(m[2]) - 1, col: col - 1 };
}

export function colName(col) {
  let n = col + 1, s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

export function cellRef(row, col) { return colName(col) + (row + 1); }

const BUILTIN_DATE_FMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function isDateFormatCode(code) {
  const c = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[ymdhs]/i.test(c) && !/^(general|0|#)/i.test(c.trim());
}

/** Excel serial -> {y, m, d, serial}. Handles the 1900 leap-year bug. */
export function serialToYmd(serial, date1904 = false) {
  let days = Math.floor(serial);
  let ms;
  if (date1904) ms = Date.UTC(1904, 0, 1) + days * 86400000;
  else {
    if (days >= 60) days -= 1; // Excel treats 1900 as a leap year
    ms = Date.UTC(1899, 11, 31) + days * 86400000;
  }
  const d = new Date(ms);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), serial };
}

async function readText(zip, name) {
  const get = zip.get(name);
  if (!get) return null;
  return td.decode(await get());
}

function parseStyles(xml) {
  const customFmts = new Map();
  if (xml) {
    const nf = /<numFmt\b[^>]*>/g;
    let m;
    while ((m = nf.exec(xml))) {
      const a = attrs(m[0]);
      customFmts.set(Number(a.numFmtId), a.formatCode || '');
    }
  }
  const xfDate = [];
  if (xml) {
    const cx = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
    if (cx) {
      const re = /<xf\b[^>]*?(?:\/>|>)/g;
      let m;
      while ((m = re.exec(cx[1]))) {
        const id = Number(attrs(m[0]).numFmtId || 0);
        const custom = customFmts.get(id);
        xfDate.push(custom !== undefined ? isDateFormatCode(custom) : BUILTIN_DATE_FMTS.has(id));
      }
    }
  }
  return xfDate;
}

function parseSheet(xml, shared, xfDate, date1904) {
  const rows = [];
  let maxRow = -1, maxCol = -1;
  const rowRe = /<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rm;
  while ((rm = rowRe.exec(xml))) {
    const body = rm[1];
    if (!body) continue;
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm;
    while ((cm = cellRe.exec(body))) {
      const a = attrs(cm[1]);
      const pos = parseRef(a.r || '');
      if (!pos) continue;
      const inner = cm[2] || '';
      const vm = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner);
      const raw = vm ? unescapeXml(vm[1]) : null;
      const type = a.t || 'n';
      let cell = null;
      if (type === 's') {
        const s = raw === null ? null : shared[Number(raw)];
        if (s !== undefined && s !== null) cell = { t: 's', v: s };
      } else if (type === 'str') {
        if (raw !== null) cell = { t: 's', v: raw };
      } else if (type === 'inlineStr') {
        const is = /<is\b[^>]*>([\s\S]*?)<\/is>/.exec(inner);
        if (is) cell = { t: 's', v: textOf(is[1]) };
      } else if (type === 'b') {
        if (raw !== null) cell = { t: 'b', v: raw === '1' };
      } else if (type === 'e') {
        if (raw !== null) cell = { t: 'e', v: raw };
      } else if (raw !== null && raw !== '') {
        const num = Number(raw);
        if (Number.isFinite(num)) {
          const isDate = xfDate[Number(a.s || 0)] === true;
          cell = isDate
            ? { t: 'd', v: num, date: serialToYmd(num, date1904) }
            : { t: 'n', v: num };
        }
      }
      if (!cell) continue;
      cell.r = pos.row; cell.c = pos.col;
      (rows[pos.row] ||= [])[pos.col] = cell;
      if (pos.row > maxRow) maxRow = pos.row;
      if (pos.col > maxCol) maxCol = pos.col;
    }
  }
  const merges = [];
  const mre = /<mergeCell\b[^>]*>/g;
  let mm;
  while ((mm = mre.exec(xml))) {
    const ref = attrs(mm[0]).ref || '';
    const [a, b] = ref.split(':');
    const pa = parseRef(a || ''), pb = parseRef(b || a || '');
    if (pa && pb) merges.push({ r1: pa.row, c1: pa.col, r2: pb.row, c2: pb.col });
  }
  return { rows, maxRow, maxCol, merges };
}

/**
 * Open a workbook. Returns { sheetNames, date1904, getSheet(name) }.
 * Sheets are parsed lazily. Each parsed sheet is
 * { name, rows: Array<Array<cell|undefined>|undefined>, maxRow, maxCol, merges }
 * where cell = { r, c, t: 's'|'n'|'d'|'b'|'e', v, date? }.
 */
export async function openWorkbook(input) {
  const zip = openZip(input);
  const wbXml = await readText(zip, 'xl/workbook.xml');
  if (!wbXml) throw new Error('Not an .xlsx workbook (xl/workbook.xml missing).');
  const relsXml = (await readText(zip, 'xl/_rels/workbook.xml.rels')) || '';
  const rels = new Map();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const a = attrs(m[0]);
    rels.set(a.Id, a.Target);
  }
  const date1904 = /<workbookPr\b[^>]*date1904="(1|true)"/.test(wbXml);
  const sheets = [];
  for (const m of wbXml.matchAll(/<sheet\b[^>]*>/g)) {
    const a = attrs(m[0]);
    let target = rels.get(a['r:id']) || '';
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
    sheets.push({ name: a.name, path: target });
  }
  const ssXml = await readText(zip, 'xl/sharedStrings.xml');
  const shared = [];
  if (ssXml) for (const m of ssXml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) shared.push(m[1] ? textOf(m[1]) : '');
  const xfDate = parseStyles(await readText(zip, 'xl/styles.xml'));
  const cache = new Map();
  return {
    sheetNames: sheets.map((s) => s.name),
    date1904,
    async getSheet(name) {
      if (cache.has(name)) return cache.get(name);
      const s = sheets.find((x) => x.name === name);
      if (!s) throw new Error('No such sheet: ' + name);
      const xml = await readText(zip, s.path);
      if (xml === null) throw new Error('Sheet part missing: ' + s.path);
      const parsed = { name, ...parseSheet(xml, shared, xfDate, date1904) };
      cache.set(name, parsed);
      return parsed;
    },
  };
}
