import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { openZip, openWorkbook, serialToYmd, parseRef, colName, cellRef } from '../../src/import/xlsx.js';

// Real workbooks are deflate-compressed; the shared fixture helper writes stored entries only, so this test
// builds a small compressed zip itself (CRC is not checked by the reader).
function zipDeflated(files) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const raw = enc.encode(text);
    const data = deflateRawSync(raw);
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.forEach((b, i) => { local[30 + i] = b; });
    parts.push(local, data);
    const cd = Buffer.alloc(46 + nameBytes.length);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(raw.length, 24); cd.writeUInt16LE(nameBytes.length, 28); cd.writeUInt32LE(offset, 42);
    nameBytes.forEach((b, i) => { cd[46 + i] = b; });
    central.push(cd);
    offset += local.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, cdBuf, end]));
}

test('reads deflate-compressed zip entries', async () => {
  const zip = openZip(zipDeflated({ 'a.txt': 'hello '.repeat(200), 'dir/b.txt': 'world' }));
  assert.deepEqual([...zip.keys()].sort(), ['a.txt', 'dir/b.txt']);
  assert.equal(new TextDecoder().decode(await zip.get('a.txt')()), 'hello '.repeat(200));
  assert.equal(new TextDecoder().decode(await zip.get('dir/b.txt')()), 'world');
});

test('reads a compressed workbook: shared strings, numbers, date-formatted cells, merges', async () => {
  const files = {
    'xl/workbook.xml': '<workbook><workbookPr/><sheets><sheet name="S1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Reps</t></si><si><r><t>Rich </t></r><r><t>text &amp; more</t></r></si></sst>',
    'xl/styles.xml': '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="d-mmm"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1"><v>42.5</v></c></row>'
      + '<row r="2"><c r="A2" s="1"><v>45873</v></c><c r="B2" s="2"><v>45873</v></c><c r="C2" t="inlineStr"><is><t>inline</t></is></c></row></sheetData>'
      + '<mergeCells><mergeCell ref="A4:C5"/></mergeCells></worksheet>',
  };
  const wb = await openWorkbook(zipDeflated(files));
  assert.deepEqual(wb.sheetNames, ['S1']);
  const sh = await wb.getSheet('S1');
  assert.equal(sh.rows[0][0].v, 'Reps');
  assert.equal(sh.rows[0][1].v, 'Rich text & more');
  assert.deepEqual([sh.rows[0][2].t, sh.rows[0][2].v], ['n', 42.5]);
  assert.equal(sh.rows[1][0].t, 'd'); assert.equal(sh.rows[1][1].t, 'd'); // built-in date format and a custom "d-mmm" format
  assert.deepEqual(sh.rows[1][0].date, { y: 2025, m: 8, d: 4, serial: 45873 });
  assert.equal(sh.rows[1][2].v, 'inline');
  assert.deepEqual(sh.merges, [{ r1: 3, c1: 0, r2: 4, c2: 2 }]);
});

test('date serials, including the 1900 leap-year bug, and 1904 workbooks', () => {
  assert.deepEqual(serialToYmd(1), { y: 1900, m: 1, d: 1, serial: 1 });
  assert.deepEqual(serialToYmd(59), { y: 1900, m: 2, d: 28, serial: 59 });
  assert.deepEqual(serialToYmd(61), { y: 1900, m: 3, d: 1, serial: 61 });
  assert.deepEqual(serialToYmd(45873), { y: 2025, m: 8, d: 4, serial: 45873 });
  assert.equal(serialToYmd(0, true).y, 1904);
});

test('cell reference helpers round-trip', () => {
  for (const [ref, row, col] of [['A1', 0, 0], ['Z1', 0, 25], ['AA10', 9, 26], ['AZ3', 2, 51], ['BA1', 0, 52]]) {
    assert.deepEqual(parseRef(ref), { row, col });
    assert.equal(cellRef(row, col), ref);
  }
  assert.equal(parseRef('nope'), null);
  assert.equal(colName(701), 'ZZ');
});

test('non-zip and truncated input fail with a clear error', async () => {
  assert.throws(() => openZip(new Uint8Array([1, 2, 3, 4])), /Not a zip/);
  await assert.rejects(() => openWorkbook(zipDeflated({ 'x.txt': 'no workbook' })), /not an \.xlsx/i);
});
