// Weekly summary notification (Android Chrome, installed app). The app writes the summary text into IndexedDB
// (meta "weeklySummary") whenever data changes; the service worker shows it on its weekly "periodicsync" event, so
// nothing is sent anywhere. Periodic background sync fires at the browser's discretion, roughly weekly at most.
import { workingSets } from '../core/sets.js';
import { sessionPoints, trend } from '../core/progress.js';
import { round1, convert } from '../core/units.js';
import { addDays } from '../core/weeks.js';
import { todayIso, toast } from './dom.js';

export const SUMMARY_TAG = 'weekly-summary';
const NAMES = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };

/** { title, body, asOf, lastSession } for the 7 days to `today`. */
export function weeklySummary(app, today = todayIso()) {
  const unit = app.settings.unit, toU = (kg) => round1(convert(kg, 'kg', unit));
  const work = workingSets(app.events()).filter((e) => e.date <= today);
  const from = addDays(today, -6);
  const week = work.filter((e) => e.date >= from);
  const days = new Set(week.map((e) => e.date)).size;
  const sets = { squat: [], bench: [], deadlift: [] };
  for (const e of work) { const lift = app.exercise(e.exerciseId)?.lift; if (sets[lift]) sets[lift].push({ date: e.date, weightKg: e.weightKg, reps: e.reps, rpe: e.rpe ?? null }); }
  const lifts = Object.keys(sets).map((lift) => {
    const pts = sessionPoints(sets[lift]), hard = pts.filter((p) => p.hard);
    if (!hard.length) return null;
    const tr = trend(pts, { weeks: 8 });
    const now = tr ? tr.at(hard.at(-1).x) : hard.at(-1).y;
    return `${NAMES[lift]} ${toU(now)}${tr ? ` (${tr.slopePerWeek >= 0 ? '+' : '−'}${toU(Math.abs(tr.slopePerWeek))}/wk)` : ''}`;
  }).filter(Boolean);
  const lead = days ? `${days} session${days === 1 ? '' : 's'}, ${week.length} working sets in the last 7 days.` : 'No sessions in the last 7 days.';
  return { title: 'Your training week', body: `${lead}${lifts.length ? ` Estimated max (${unit}): ${lifts.join(' · ')}.` : ''}`, asOf: today, lastSession: work.at(-1)?.date ?? null };
}

/** Keeps the stored summary current while the notification is switched on. */
export function keepSummaryFresh(app) {
  let timer;
  const write = () => { clearTimeout(timer); timer = setTimeout(() => { if (app.settings.weeklySummary && !app.usingExample) app.store.put('meta', { key: 'weeklySummary', value: weeklySummary(app) }).catch(() => {}); }, 1500); };
  app.subscribe(write); write();
}

export const summarySupported = () => 'serviceWorker' in navigator && 'Notification' in window && 'periodicSync' in ServiceWorkerRegistration.prototype;

/** Turns the weekly notification on or off: asks for notification permission and registers the weekly sync. */
export async function setWeeklySummary(app, on) {
  if (!on) {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.periodicSync?.unregister(SUMMARY_TAG).catch(() => {});
    return app.saveSettings({ weeklySummary: false });
  }
  if (!summarySupported()) { toast('Weekly notifications need Chrome on Android with the app installed.', 4200); return app.saveSettings({ weeklySummary: false }); }
  if ((await Notification.requestPermission()) !== 'granted') { toast('Notifications are blocked for this app in your phone settings.', 4200); return app.saveSettings({ weeklySummary: false }); }
  const reg = await navigator.serviceWorker.ready;
  try {
    await reg.periodicSync.register(SUMMARY_TAG, { minInterval: 7 * 24 * 60 * 60 * 1000 });
  } catch {
    toast('Install the app to your home screen first (browser menu → Install app), then switch this on.', 5200);
    return app.saveSettings({ weeklySummary: false });
  }
  await app.saveSettings({ weeklySummary: true });
  toast('Weekly summary on. Android decides the exact day.');
}
