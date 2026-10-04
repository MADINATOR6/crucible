import { openWorkbook, cellRef } from './xlsx.js';

const valueOf = (cell) => cell && typeof cell === 'object' ? cell.v : cell;
const textOf = (cell) => String(valueOf(cell) ?? '');
const placeholder = (cell) => /^(?:-|\.)?$/.test(textOf(cell).trim());
const rawOf = (cell) => cell?.t === 'd' ? `${cell.date?.d}/${cell.date?.m}` : valueOf(cell) ?? null;
const warning = (code, raw) => ({ code, raw });
const normalise = (text) => String(text).trim().replace(/\s+/g, ' ').toLowerCase().replace(/dumbell/g, 'dumbbell');
const headers = ['reps', 'target rpe', 'load', 'actual rpe', 'coach comments', 'athlete comments'];
const dayNumber = (cell) => /^Day\s+(\d+)\s*$/i.exec(textOf(cell).trim());

export function parseReps(cell) {
  const raw = rawOf(cell);
  const out = { repsMin: null, repsMax: null, repsRaw: raw === null ? null : String(raw), warnings: [] };
  const fail = (code) => { out.warnings.push(warning(code, raw)); return out; };
  if (placeholder(cell)) return out;
  let min, max;
  if (cell?.t === 'd') {
    min = cell.date?.d; max = cell.date?.m;
    if (!Number.isInteger(min) || !Number.isInteger(max)) return fail('reps_invalid');
    if (min > max) return fail('reps_date_reversed');
    out.warnings.push(warning('reps_date_converted', raw));
  } else if (typeof valueOf(cell) === 'number') {
    min = max = valueOf(cell);
  } else if (typeof valueOf(cell) === 'string') {
    const text = textOf(cell).trim();
    const range = /^(\d+)\s*[-–]\s*(\d+)$/.exec(text);
    if (range) {
      min = Number(range[1]); max = Number(range[2]);
      if (min > max) return fail('reps_range_reversed');
    } else if (/^\d+$/.test(text)) min = max = Number(text);
    else return fail('reps_text');
  } else return fail('reps_invalid');
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 100) return fail('reps_invalid');
  out.repsMin = min; out.repsMax = max;
  return out;
}

export function parseRpe(cell) {
  const raw = rawOf(cell), out = { value: null, warnings: [] };
  if (placeholder(cell)) return out;
  let number = valueOf(cell);
  if (typeof number === 'string') {
    const match = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)/.exec(number.trim());
    if (!match) { out.warnings.push(warning('rpe_text', raw)); return out; }
    if (match[0] !== number.trim()) out.warnings.push(warning('rpe_text_cleaned', raw));
    number = Number(match[0]);
  }
  if (cell?.t === 'd' || typeof number !== 'number' || !Number.isFinite(number) || number < 1 || number > 11) {
    out.warnings.push(warning('rpe_out_of_range', raw));
  } else {
    out.value = number;
    if (number > 10) out.warnings.push(warning('rpe_above_10', raw));
    else if (!Number.isInteger(number * 2)) out.warnings.push(warning('rpe_not_half_step', raw));
  }
  return out;
}

export function parseLoad(cell) {
  const raw = rawOf(cell), out = { load: null, loadRange: null, warnings: [] };
  if (placeholder(cell)) return out;
  const fail = (code) => { out.warnings.push(warning(code, raw)); return out; };
  if (cell?.t === 'd') return fail('load_invalid');
  const unitOf = (unit) => /^(lb|lbs|pounds?)$/i.test(unit) ? 'lb' : 'kg';
  const knownUnit = (unit) => /^(kg|kgs|kilos?|lb|lbs|pounds?)$/i.test(unit);
  let number = valueOf(cell), unit = '';
  if (typeof number === 'string') {
    const text = number.trim();
    const range = /^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*([a-z]{1,6})?$/i.exec(text);
    if (range) {
      const min = Number(range[1]), max = Number(range[2]);
      if (!(min > 0 && max >= min) || !Number.isFinite(max)) return fail('load_invalid');
      out.loadRange = { min, max, unit: unitOf(range[3] || '') };
      if (range[3] && !knownUnit(range[3])) out.warnings.push(warning('load_unit_unknown', raw));
      return fail('load_range');
    }
    const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*([a-z]{1,6})?$/i.exec(text);
    if (!match) return fail('load_text');
    number = Number(match[1]); unit = match[2] || '';
  }
  if (typeof number !== 'number' || !Number.isFinite(number) || number <= 0) return fail('load_invalid');
  out.load = { value: number, unit: unitOf(unit), raw };
  if (!unit) out.warnings.push(warning('load_assumed_kg', raw));
  else if (!knownUnit(unit)) out.warnings.push(warning('load_unit_unknown', raw));
  return out;
}

export function parseWeekLabel(text) {
  const match = /^Week\s+(\d+)\b/i.exec(String(text).trim());
  const target = /^Week\s+\d+\s*[-–]\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*\[\s*(\d+(?:\.\d+)?)\s*kg\s*\]/i.exec(String(text).trim());
  return { number: match ? Number(match[1]) : null, target: target ? {
    squat: Number(target[1]), bench: Number(target[2]), deadlift: Number(target[3]), total: Number(target[4]),
  } : null };
}

export function classifyLabel(text, catalogue = {}) {
  let name = String(text ?? '').trim(), supersetGroup = null;
  const prefix = /^([A-Z]\d+)\s*:\s*/.exec(name);
  if (prefix) { supersetGroup = prefix[1]; name = name.slice(prefix[0].length).trim(); }
  const out = { kind: 'empty', exerciseId: null, name, supersetGroup };
  if (!name) return out;
  if (/^[0-9X]{3,4}$/.test(name)) return { ...out, kind: 'tempo' };
  if ((catalogue.cues || []).some((cue) => normalise(cue) === normalise(name)) ||
      (catalogue.cuePatterns || []).some((pattern) => new RegExp(pattern, 'i').test(name))) return { ...out, kind: 'cue' };
  const exercise = (catalogue.exercises || []).find((item) => [item.name, ...(item.aliases || [])].some((alias) => normalise(alias) === normalise(name)));
  return { ...out, kind: 'exercise', exerciseId: exercise?.id ?? null, name: exercise?.name ?? name };
}

export function parseAthleteComment(text) {
  const raw = String(text ?? '');
  const out = { bodyLog: [], actualReps: null, actualLoad: null, actualRpe: null };
  for (const line of raw.split(/\r?\n/)) {
    const bw = /\b(\d+(?:\.\d+)?)\s*kg\b/i.exec(line);
    const calories = /\b(\d+(?:\.\d+)?)\s*calor/i.exec(line);
    if (!bw && !calories) continue;
    const day = /^\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i.exec(line)?.[1];
    out.bodyLog.push({ weekday: day ? day[0].toUpperCase() + day.slice(1).toLowerCase() : null,
      bodyweightKg: bw ? Number(bw[1]) : null, calories: calories ? Number(calories[1]) : null, raw: line });
  }
  const reps = /\b(\d+)\s*reps?\b/i.exec(raw), load = /\bdid\s+(\d+(?:\.\d+)?)/i.exec(raw), rpe = /\brpe\s*(\d+(?:\.\d+)?)/i.exec(raw);
  if (reps) out.actualReps = Number(reps[1]);
  if (load) out.actualLoad = { value: Number(load[1]), unit: 'kg' };
  if (rpe) out.actualRpe = Number(rpe[1]);
  return out;
}

// Redact report evidence too, so a warning cannot reintroduce a removed phone number.
// Phone shapes: a run that starts with `+`, `(` or `0`, uses only digits, spaces, newlines, dots, dashes and
// brackets, and holds 9+ digits (so +61 499 888 777, (03) 9999 1234, 04 1234 5678 and newline-split numbers go);
// plus any unbroken run of 7+ digits. A plain list of loads such as "100 120 140" is left alone.
const PHONE_RUN = /(?:\+\s*\(?\d|\(\s*\d|\b0\d)[\d \t\r\n().-]{6,}\d/g;
const redact = (raw) => String(raw ?? '')
  .replace(PHONE_RUN, (run) => (run.replace(/\D/g, '').length >= 9 ? '[redacted]' : run))
  .replace(/\d{7,}/g, '[redacted]');
const evidence = (raw) => { const text = redact(raw); return text.length > 200 ? text.slice(0, 199) + '…' : text; };

export async function importProgramme(bytes, options = {}) {
  return parseProgramme(await openWorkbook(bytes), options);
}

/** getSheet is asynchronous in xlsx.js, so both public import entry points return a Promise. */
export async function parseProgramme(workbook, { catalogue = {}, fileName = '', now = () => new Date() } = {}) {
  const report = { blocks: 0, weeks: 0, days: 0, entries: 0, sets: 0, completedSets: 0,
    placeholders: 0, dateRepsConverted: 0, assumedKgLoads: 0, numericCommentsAsReps: 0, warningsByType: {}, warnings: [], unparsedCells: [] };
  const warn = (code, sheet, cell, raw = rawOf(cell)) => {
    report.warningsByType[code] = (report.warningsByType[code] || 0) + 1;
    report.warnings.push({ code, sheet: redact(sheet), ref: cell ? cellRef(cell.r, cell.c) : null, raw: evidence(raw) });
  };
  const programme = { schema: 1, importedAt: now().toISOString(), source: {
    fileName: redact(String(fileName).split(/[\\/]/).pop()), sheetCount: workbook.sheetNames.length,
  }, overview: { results: [] }, blocks: [], report };
  const baseName = String(fileName).split(/[\\/]/).pop();
  if (redact(baseName) !== baseName) warn('redacted_number', '', null, baseName);
  for (const sheetName of workbook.sheetNames) {
    if (redact(sheetName) !== sheetName) warn('redacted_number', sheetName, null, sheetName);
    const blockMatch = /^Block\s*(\d+)\s*[-–]\s*(.*?)\s*$/i.exec(sheetName.trim());
    if (!blockMatch && sheetName.trim().toUpperCase() !== 'TRAINING OVERVIEW') {
      warn('sheet_ignored', sheetName, null, sheetName); continue;
    }
    const sheet = await workbook.getSheet(sheetName);
    const cells = sheet.rows.flat().filter(Boolean);
    const consumed = new Set(), privateCells = new Set(), redactedCells = new Set();
    const key = (cell) => `${cell.r}:${cell.c}`;
    const consume = (cell) => { if (cell) consumed.add(key(cell)); };
    const safe = (cell) => {
      if (!cell || privateCells.has(key(cell))) return '';
      const raw = textOf(cell), text = redact(raw);
      if (text !== raw && !redactedCells.has(key(cell))) {
        redactedCells.add(key(cell)); warn('redacted_number', sheetName, cell);
      }
      return text;
    };
    const at = (r, c) => { const cell = sheet.rows[r]?.[c]; return cell && !privateCells.has(key(cell)) ? cell : undefined; };
    if (!blockMatch) {
      const names = ['date', 'squat', 'bench', 'deadlift', 'total', 'comments'];
      const headerRow = sheet.rows.findIndex((row) => names.every((name) => row?.some((cell) => normalise(textOf(cell)) === name)));
      if (headerRow < 0) { warn('overview_header_missing', sheetName, null, ''); continue; }
      const columns = names.map((name) => sheet.rows[headerRow].findIndex((cell) => normalise(textOf(cell)) === name));
      for (let r = headerRow + 1; r <= sheet.maxRow; r++) {
        if (!sheet.rows[r]?.some((cell) => textOf(cell).trim())) break;
        const row = columns.map((c) => at(r, c)), date = row[0]?.date;
        const validDate = row[0]?.t === 'd' && date && [date.y, date.m, date.d].every(Number.isInteger);
        if (!validDate) warn('overview_date', sheetName, row[0] || { r, c: columns[0] }, rawOf(row[0]));
        const number = (cell) => typeof valueOf(cell) === 'number' && cell?.t !== 'd' && Number.isFinite(valueOf(cell)) ? valueOf(cell) : null;
        programme.overview.results.push({ date: validDate ? `${String(date.y).padStart(4, '0')}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}` : null,
          squat: number(row[1]), bench: number(row[2]), deadlift: number(row[3]), totalText: safe(row[4]), comment: safe(row[5]) });
      }
      continue;
    }
    const firstDayRow = Math.min(...cells.filter((cell) => dayNumber(cell)).map((cell) => cell.r), Infinity);
    // The top identity block is not imported, including an adjacent name and a name below its label.
    for (const cell of cells) {
      if (/^athlete\s*:?$/i.test(textOf(cell).trim())) {
        privateCells.add(key(cell)); consume(cell);
        if (cell.r < firstDayRow && /^athlete\s*:?$/i.test(textOf(cell).trim())) {
          const adjacent = cells.find((other) => other.r === cell.r && other.c > cell.c && !placeholder(other));
          const below = cells.find((other) => other.r > cell.r && other.r < firstDayRow && other.c === cell.c && !placeholder(other));
          for (const other of [adjacent, below]) {
            if (other && !dayNumber(other) && !/^(?:week\s+\d+\b|(?:block goal|additional instructions|average daily calories|average morning bw)$)/i.test(textOf(other).trim())) {
              privateCells.add(key(other)); consume(other);
            }
          }
        }
      }
    }
    for (const cell of cells) {
      if (privateCells.has(key(cell))) continue;
      if (placeholder(cell)) { report.placeholders++; consume(cell); }
      safe(cell);
      if (headers.includes(normalise(textOf(cell)))) consume(cell);
    }
    const metadata = (label) => {
      const cell = cells.find((item) => !privateCells.has(key(item)) && normalise(textOf(item)) === label);
      if (!cell) return '';
      consume(cell);
      for (let r = cell.r + 1; r <= cell.r + 6; r++) {
        const next = at(r, cell.c);
        if (next?.t === 's' && !placeholder(next)) { consume(next); return safe(next).trim(); }
      }
      return '';
    };
    const block = { id: `b${Number(blockMatch[1])}`, number: Number(blockMatch[1]), name: redact(blockMatch[2]),
      goal: metadata('block goal'), instructions: metadata('additional instructions'), weeks: [] };
    const starts = [...new Set(cells.filter((cell) => !privateCells.has(key(cell)) && dayNumber(cell)).map((cell) => cell.c))].sort((a, b) => a - b);
    if (!starts.length) warn('block_days_missing', sheetName, null, '');
    let previousWeekNumber = 0;
    for (let g = 0; g < starts.length; g++) {
      const start = starts[g], end = starts[g + 1] ?? Math.max(sheet.maxCol + 1, start + 7);
      const groupCells = cells.filter((cell) => cell.c >= start && cell.c < end && !privateCells.has(key(cell)));
      const firstDay = groupCells.find((cell) => cell.c === start && dayNumber(cell));
      const labelCell = groupCells.find((cell) => cell.r < firstDay.r && parseWeekLabel(textOf(cell)).number !== null);
      consume(labelCell);
      const parsedLabel = parseWeekLabel(textOf(labelCell));
      const number = parsedLabel.number ?? previousWeekNumber + 1;
      previousWeekNumber = number;
      if (!labelCell) warn('week_label_missing', sheetName, firstDay, '');
      const week = { number, label: safe(labelCell).trim(), target: parsedLabel.target, avgCalories: null, avgBodyweightKg: null, bodyLog: [], days: [] };
      for (const cell of groupCells) {
        const label = normalise(textOf(cell));
        if (!['average daily calories', 'average morning bw'].includes(label)) continue;
        consume(cell);
        const next = groupCells.find((item) => item.r === cell.r && item.c > cell.c && item.t === 'n' && Number.isFinite(item.v));
        if (next) consume(next);
        if (labelCell && cell.r >= labelCell.r && cell.r <= labelCell.r + 3) {
          week[label === 'average daily calories' ? 'avgCalories' : 'avgBodyweightKg'] = next?.v ?? null;
        }
      }
      let columns = headers.map((_, i) => start + i + 1), day = null, entry = null, previousSet = null;
      const record = (result, cell, set) => {
        consume(cell);
        for (const item of result.warnings) {
          warn(item.code, sheetName, cell, item.raw);
          if (set && !set.warnings.includes(item.code)) set.warnings.push(item.code);
          if (item.code === 'reps_date_converted') report.dateRepsConverted++;
          if (item.code === 'load_assumed_kg' || item.code === 'load_unit_unknown') report.assumedKgLoads++;
        }
        if (cell && redactedCells.has(key(cell)) && set && !set.warnings.includes('redacted_number')) set.warnings.push('redacted_number');
      };
      const append = (old, text) => [old, text].filter(Boolean).join('\n') || null;
      const comments = (coach, athlete, set) => {
        for (const cell of [coach, athlete]) if (cell && set && redactedCells.has(key(cell)) && !set.warnings.includes('redacted_number')) set.warnings.push('redacted_number');
        if (coach && !placeholder(coach) && set) { consume(coach); set.coachComment = append(set.coachComment, safe(coach)); }
        if (!athlete || placeholder(athlete)) return;
        const parsed = parseAthleteComment(safe(athlete));
        week.bodyLog.push(...parsed.bodyLog);
        // Drop a line from the note only when it is nothing but a weekday/bodyweight/calorie entry.
        const bodyLines = new Set(parsed.bodyLog.map((line) => line.raw));
        const bodyOnly = (line) => bodyLines.has(line) && !line
          .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
          .replace(/\d+(?:\.\d+)?\s*kg\b/gi, '').replace(/\d+(?:\.\d+)?\s*calor\w*/gi, '')
          .replace(/[\s,;:.()\-]/g, '');
        const note = safe(athlete).split(/\r?\n/).filter((line) => !bodyOnly(line)).join('\n').trim();
        if (set || !note) consume(athlete);
        if (!set) return;
        set.athleteComment = append(set.athleteComment, note);
        if (parsed.actualReps !== null) set.actualReps = parsed.actualReps;
        if (parsed.actualLoad !== null) {
          if (parsed.actualLoad.value > 0 && Number.isFinite(parsed.actualLoad.value)) set.actualLoad = parsed.actualLoad;
          else record({ warnings: [warning('load_invalid', rawOf(athlete))] }, athlete, set);
        }
        if (parsed.actualRpe !== null) {
          const rpe = parseRpe(parsed.actualRpe);
          record({ warnings: rpe.warnings.map((item) => ({ ...item, raw: rawOf(athlete) })) }, athlete, set);
          if (set.actualRpe === null) set.actualRpe = rpe.value;
        }
        if (/^\d+$/.test(safe(athlete).trim()) && Number(safe(athlete)) >= 1 && Number(safe(athlete)) <= 30 && set.repsMin !== null && set.repsMax > set.repsMin) {
          set.actualReps = Number(safe(athlete)); report.numericCommentsAsReps++;
          record({ warnings: [warning('numeric_comment_as_reps', rawOf(athlete))] }, athlete, set);
        }
        set.completed = set.actualRpe !== null || set.actualReps !== null || set.actualLoad !== null;
      };
      for (let r = firstDay.r; r <= sheet.maxRow; r++) {
        const label = at(r, start), dayMatch = dayNumber(label);
        const rowCells = (sheet.rows[r] || []).filter((cell) => cell && cell.c >= start && cell.c < end && !privateCells.has(key(cell)));
        if (dayMatch) {
          consume(label); day = { number: Number(dayMatch[1]), entries: [] }; week.days.push(day); entry = null; previousSet = null;
        }
        const foundHeaders = headers.map((header) => rowCells.find((cell) => normalise(textOf(cell)) === header));
        // A header row names at least two columns, or is made only of header texts (a partial, shifted header).
        const ignorable = (cell) => placeholder(cell) || (cell.c === start && ['exercise', 'exercises', 'movement', 'lift'].includes(normalise(textOf(cell))));
        const headerOnly = foundHeaders.some(Boolean) && rowCells.every((cell) => ignorable(cell) || headers.includes(normalise(textOf(cell))));
        if (dayMatch || foundHeaders.filter(Boolean).length >= 2 || headerOnly) {
          // Undiscovered headers keep their default offset, shifted by the same amount as the first discovered one.
          const first = foundHeaders.findIndex(Boolean);
          if (first >= 0) {
            const delta = foundHeaders[first].c - (start + first + 1);
            columns = headers.map((_, i) => foundHeaders[i]?.c ?? (start + i + 1 + delta));
          }
          foundHeaders.forEach(consume); continue;
        }
        if (rowCells.some((cell) => ['average daily calories', 'average morning bw'].includes(normalise(textOf(cell))))) continue;
        if (!rowCells.some((cell) => textOf(cell).trim())) { entry = null; continue; }
        const data = columns.map((c) => c < end ? at(r, c) : undefined);
        const hasSet = data.slice(0, 4).some((cell) => !placeholder(cell));
        const labelText = safe(label).trim();
        const classified = classifyLabel(placeholder(label) ? '' : labelText, catalogue);
        if (classified.kind === 'exercise') {
          consume(label);
          entry = { exerciseId: classified.exerciseId, name: redact(classified.name), rawName: labelText.replace(/^[A-Z]\d+\s*:\s*/, '').trim(),
            supersetGroup: classified.supersetGroup, tempo: null, cues: [], sets: [] };
          day.entries.push(entry);
          if (!classified.exerciseId) warn('unknown_exercise', sheetName, label);
        } else if ((classified.kind === 'tempo' || classified.kind === 'cue') && entry) {
          consume(label);
          if (classified.kind === 'tempo') entry.tempo = classified.name;
          else entry.cues.push(labelText);
        }
        if (!hasSet) { comments(data[4], data[5], previousSet); continue; }
        let orphan = false;
        if (!entry) {
          orphan = true; warn('orphan_set', sheetName, data[0] || label || { r, c: columns[0] });
          entry = day.entries.at(-1) ?? null;
          if (!entry) {
            data.slice(0, 4).forEach(consume); comments(data[4], data[5], null); continue;
          }
          if (classified.kind === 'tempo' || classified.kind === 'cue') {
            consume(label);
            if (classified.kind === 'tempo') entry.tempo = classified.name;
            else entry.cues.push(labelText);
          }
        }
        const reps = parseReps(data[0]), target = parseRpe(data[1]), load = parseLoad(data[2]), actual = parseRpe(data[3]);
        const set = { index: entry.sets.length + 1, repsMin: reps.repsMin, repsMax: reps.repsMax,
          repsRaw: reps.repsRaw === null ? null : redact(reps.repsRaw), targetRpe: target.value,
          load: load.load ? { ...load.load, raw: typeof load.load.raw === 'string' ? redact(load.load.raw) : load.load.raw } : null,
          loadRange: load.loadRange, actualRpe: actual.value, actualReps: null, actualLoad: null, coachComment: null, athleteComment: null,
          completed: actual.value !== null, source: { sheet: redact(sheetName), row: r + 1, col: columns[0] }, warnings: orphan ? ['orphan_set'] : [] };
        [reps, target, load, actual].forEach((result, i) => record(result, data[i], set));
        if (classified.kind === 'exercise' && !classified.exerciseId) set.warnings.push('unknown_exercise');
        if (label && redactedCells.has(key(label)) && !set.warnings.includes('redacted_number')) set.warnings.push('redacted_number');
        comments(data[4], data[5], set); entry.sets.push(set); previousSet = set;
      }
      if (week.days.some((item) => item.entries.some((item) => item.sets.length))) block.weeks.push(week);
      else warn('empty_week_group', sheetName, labelCell || firstDay);
    }
    for (const cell of cells) if (!consumed.has(key(cell)) && textOf(cell).trim()) {
      report.unparsedCells.push({ sheet: redact(sheetName), ref: cellRef(cell.r, cell.c), raw: evidence(rawOf(cell)), reason: 'No import rule consumed this cell' });
    }
    programme.blocks.push(block);
  }
  programme.blocks.sort((a, b) => a.number - b.number);
  report.blocks = programme.blocks.length;
  for (const block of programme.blocks) for (const week of block.weeks) {
    report.weeks++; report.days += week.days.length;
    for (const day of week.days) {
      report.entries += day.entries.length;
      for (const entry of day.entries) for (const set of entry.sets) { report.sets++; if (set.completed) report.completedSets++; }
    }
  }
  return programme;
}
