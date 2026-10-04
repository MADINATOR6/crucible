// Synthetic EXAMPLE programme so the app is explorable before you import your own workbook.
// Invented numbers, not anyone's real training. Deterministic (no randomness).

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function set(index, reps, targetRpe, loadKg, done, actualRpeShift = 0) {
  const range = Array.isArray(reps);
  return {
    index,
    repsMin: range ? reps[0] : reps, repsMax: range ? reps[1] : reps, repsRaw: range ? `${reps[0]}-${reps[1]}` : String(reps),
    targetRpe,
    load: loadKg == null ? null : { value: loadKg, unit: 'kg', raw: String(loadKg) }, loadRange: null,
    actualRpe: done ? Math.min(10, Math.max(5, targetRpe + actualRpeShift)) : null,
    actualReps: done && range ? reps[1] - 1 : null,
    actualLoad: null,
    coachComment: null, athleteComment: null,
    completed: !!done, source: { sheet: 'EXAMPLE', row: 0, col: 0 }, warnings: [],
  };
}

function entry(exerciseId, name, sets, cues = []) {
  return { exerciseId, name, rawName: name, supersetGroup: null, tempo: null, cues, sets };
}

export function buildExampleProgramme() {
  const weeks = [];
  for (let w = 1; w <= 4; w++) {
    const done = w <= 3;
    const up = (w - 1) * 2.5; // linear progression on the main lifts
    const sh = (i) => ((w + i) % 3 === 0 ? 0.5 : (w + i) % 2 === 0 ? 0 : -0.5);
    const days = [
      { number: 1, entries: [
        entry('low_bar_squat', 'Low Bar Squat', [0, 1, 2].map((i) => set(i, 5, 7, 140 + up - (i === 2 ? 10 : 0), done, sh(i))), ['Strong unrack, stable walkout']),
        entry('seated_leg_extension', 'Seated Leg Extension', [0, 1].map((i) => set(i, [8, 12], 9, 70 + w * 2.5, done, 0))),
        entry('seated_hamstring_curl', 'Seated Hamstring Curl', [0, 1].map((i) => set(i, [8, 12], 9, 45 + w * 2.5, done, 0))),
      ] },
      { number: 2, entries: [
        entry('comp_bench', 'Competition Bench Press', [0, 1, 2, 3].map((i) => set(i, 4, 8, 100 + up, done, sh(i))), ['Set feet in one spot']),
        entry('paused_bench', 'Paused Bench Press', [0, 1].map((i) => set(i, 4, 8.5, 92.5 + up, done, sh(i + 1)))),
        entry('incline_db_press', 'Incline Dumbbell Press', [0, 1, 2].map((i) => set(i, [8, 12], 9, 32 + w, done, 0))),
        entry('cable_tricep_pushdown', 'Cable Tricep Pushdown', [0, 1, 2].map((i) => set(i, [10, 15], 9, 40 + w * 2.5, done, 0))),
      ] },
      { number: 3, entries: [
        entry('conventional_deadlift', 'Conventional Deadlift', [0, 1, 2].map((i) => set(i, 4, 7, 160 + up, done, sh(i))), ['Slow floor to knee, fast lockout']),
        entry('lat_pulldown', 'Lat Pulldown', [0, 1, 2].map((i) => set(i, [8, 12], 9, 60 + w * 2.5, done, 0))),
        entry('chest_supported_row', 'Chest Supported Row', [0, 1, 2].map((i) => set(i, [8, 12], 9, 55 + w * 2.5, done, 0))),
        entry('back_extension_45', '45 Degree Back Extension', [0, 1].map((i) => set(i, [10, 15], 8, null, done, 0))),
      ] },
      { number: 4, entries: [
        entry('comp_bench', 'Competition Bench Press', [0, 1, 2].map((i) => set(i, 3, 8, 105 + up, done, sh(i)))),
        entry('low_bar_squat', 'Low Bar Squat', [0, 1].map((i) => set(i, 4, 7.5, 130 + up, done, sh(i)))),
        entry('seated_db_shoulder_press', 'Seated Dumbbell Shoulder Press', [0, 1, 2].map((i) => set(i, [8, 12], 9, 24 + w, done, 0))),
        entry('db_bicep_curl', 'Dumbbell Bicep Curl', [0, 1].map((i) => set(i, [10, 15], 9, 14 + (w > 2 ? 2 : 0), done, 0))),
      ] },
    ];
    const bodyLog = WEEKDAYS.slice(0, 5).map((weekday, i) => ({
      weekday, bodyweightKg: Math.round((84.6 - w * 0.2 + (i % 2) * 0.3) * 10) / 10, calories: 2400 + w * 20, raw: `${weekday}: example`,
    }));
    weeks.push({
      number: w, label: `Week ${w}`,
      target: { squat: 140 + (w - 1) * 2.5, bench: 100 + (w - 1) * 2.5, deadlift: 160 + (w - 1) * 2.5, total: 400 + (w - 1) * 7.5 },
      avgCalories: 2400 + w * 20, avgBodyweightKg: Math.round((84.5 - w * 0.2) * 10) / 10, bodyLog, days: done ? days : days,
    });
  }
  return {
    schema: 1, isExample: true, importedAt: '2026-01-01T00:00:00.000Z',
    source: { fileName: 'EXAMPLE', sheetCount: 1 },
    overview: { results: [{ date: '2026-01-05', squat: 140, bench: 100, deadlift: 160, totalText: '400kg', comment: 'EXAMPLE START' }] },
    blocks: [{ id: 'b1', number: 1, name: 'EXAMPLE Strength Block', goal: 'Example data so you can explore the app. Import your own workbook in Data.', instructions: '', weeks }],
    report: { blocks: 1, weeks: 4, days: 16, entries: 0, sets: 0, completedSets: 0, placeholders: 0, dateRepsConverted: 0, assumedKgLoads: 0, numericCommentsAsReps: 0, warningsByType: {}, warnings: [], unparsedCells: [] },
  };
}
