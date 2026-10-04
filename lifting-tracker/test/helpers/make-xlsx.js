// Small, stored-entry XLSX writer for synthetic tests. No files or dependencies.
import { cellRef } from '../../src/import/xlsx.js';

const encoder = new TextEncoder();
const xml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function excelSerial(y, m, d) {
  const days = (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 31)) / 86400000;
  return days + (Date.UTC(y, m - 1, d) >= Date.UTC(1900, 2, 1) ? 1 : 0);
}

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}

function zip(files) {
  const locals = [], directory = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const n = encoder.encode(name), body = encoder.encode(content), crc = crc32(body);
    const local = new Uint8Array(30 + n.length + body.length);
    const lh = new DataView(local.buffer);
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, body.length, true);
    lh.setUint32(22, body.length, true);
    lh.setUint16(26, n.length, true);
    local.set(n, 30); local.set(body, 30 + n.length);
    locals.push(local);

    const central = new Uint8Array(46 + n.length);
    const ch = new DataView(central.buffer);
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, body.length, true); ch.setUint32(24, body.length, true);
    ch.setUint16(28, n.length, true); ch.setUint32(42, offset, true);
    central.set(n, 46); directory.push(central);
    offset += local.length;
  }
  const directorySize = directory.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22), eh = new DataView(end.buffer);
  eh.setUint32(0, 0x06054b50, true);
  eh.setUint16(8, directory.length, true); eh.setUint16(10, directory.length, true);
  eh.setUint32(12, directorySize, true); eh.setUint32(16, offset, true);
  const result = new Uint8Array(offset + directorySize + end.length);
  let at = 0;
  for (const part of [...locals, ...directory, end]) { result.set(part, at); at += part.length; }
  return result;
}

function sheetXml(cells) {
  const rows = new Map();
  for (const { r, c, v, t, date } of cells) {
    const ref = cellRef(r, c);
    const kind = t || (date ? 'd' : typeof v === 'number' ? 'n' : 's');
    const cell = kind === 'd'
      ? `<c r="${ref}" s="1"><v>${date ? excelSerial(...date) : v}</v></c>`
      : kind === 'n'
        ? `<c r="${ref}"><v>${v}</v></c>`
        : kind === 'b' || kind === 'e'
          ? `<c r="${ref}" t="${kind}"><v>${kind === 'b' ? Number(Boolean(v)) : xml(v)}</v></c>`
        : `<c r="${ref}" t="inlineStr"><is><t>${xml(v)}</t></is></c>`;
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push([c, cell]);
  }
  const body = [...rows].sort(([a], [b]) => a - b)
    .map(([r, values]) => `<row r="${r + 1}">${values.sort(([a], [b]) => a - b).map(([, value]) => value).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

export function makeXlsx({ sheets = [] } = {}) {
  const files = {
    'xl/styles.xml': '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
    'xl/workbook.xml': `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, i) => `<sheet name="${xml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
  };
  sheets.forEach((sheet, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sheet.cells || []); });
  return zip(files);
}

export function makeZipWithoutWorkbook() { return zip({ 'note.txt': 'synthetic archive' }); }
