// Rest timer pill. Uses the wall clock (not a tick count) so it stays right if the screen sleeps.
import { swipeDismiss } from './dom.js';
let state = null;
const STORAGE_KEY = 'lifting-tracker-rest';
function keepRest() {
  try {
    if (state) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ end: state.end, vibrate: state.vibrate }));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* Timer still works when browser storage is unavailable. */ }
}

function fmt(s) { const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; }

function ensureEl() {
  let el = document.getElementById('rest-timer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'rest-timer';
    el.className = 'rest-timer';
    el.setAttribute('role', 'timer');
    swipeDismiss(el, stopRest);
    el.innerHTML = '<span class="rt-label">Rest</span><b class="rt-time" aria-live="off">0:00</b><button class="btn small" data-rt="add" aria-label="Add 30 seconds">+30s</button><button class="btn small ghost" data-rt="skip" aria-label="Dismiss rest timer">×</button>';
    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-rt]')?.dataset.rt;
      if (act === 'add' && state) { state.end += 30000; state.done = false; el.classList.remove('done'); el.querySelector('.rt-label').textContent = 'Rest'; keepRest(); tick(); }
      if (act === 'skip') stopRest();
    });
    document.body.append(el);
  }
  return el;
}

function tick() {
  if (!state) return;
  const el = document.getElementById('rest-timer'); if (!el) return;
  const left = Math.max(0, Math.ceil((state.end - Date.now()) / 1000));
  el.querySelector('.rt-time').textContent = fmt(left);
  if (left === 0 && !state.done) {
    state.done = true; el.classList.add('done'); el.querySelector('.rt-label').textContent = 'Go';
    try { if (state.vibrate) navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ }
    const finished = state;
    setTimeout(() => { if (state === finished && state.done) stopRest(); }, 15000);
  }
}

export function startRest(seconds, { vibrate = true } = {}) {
  if (!(seconds > 0)) return;
  stopRest();
  const el = ensureEl();
  el.classList.remove('done'); el.querySelector('.rt-label').textContent = 'Rest';
  state = { end: Date.now() + seconds * 1000, done: false, vibrate, timer: setInterval(tick, 500) };
  keepRest();
  tick();
}

export function stopRest() {
  if (state) { clearInterval(state.timer); state = null; }
  keepRest();
  document.getElementById('rest-timer')?.remove();
}

/** Resume only a still-running timer in this tab; never replay an expired alarm. */
export function restoreRest() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    const left = saved?.end - Date.now();
    if (Number.isFinite(left) && left > 0 && left <= 86400000) startRest(left / 1000, { vibrate: saved.vibrate === true });
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* Optional recovery, including private browsing. */ }
}

/** Suggested rest in seconds: longer after the main lifts and their variants, shorter for accessories. */
export function suggestedRest(exercise) { return exercise?.lift ? 180 : 90; }
