// Rest timer pill. Uses the wall clock (not a tick count) so it stays right if the screen sleeps.
let state = null;

function fmt(s) { const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; }

function ensureEl() {
  let el = document.getElementById('rest-timer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'rest-timer';
    el.className = 'rest-timer';
    el.setAttribute('role', 'timer');
    el.innerHTML = '<span class="rt-label">Rest</span><b class="rt-time" aria-live="off">0:00</b><button class="btn small" data-rt="add" aria-label="Add 30 seconds">+30s</button><button class="btn small ghost" data-rt="skip" aria-label="Dismiss rest timer">×</button>';
    el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-rt]')?.dataset.rt;
      if (act === 'add' && state) { state.end += 30000; tick(); }
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
    try { navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ }
    setTimeout(() => { if (state?.done) stopRest(); }, 15000);
  }
}

export function startRest(seconds) {
  if (!(seconds > 0)) return;
  stopRest();
  const el = ensureEl();
  el.classList.remove('done'); el.querySelector('.rt-label').textContent = 'Rest';
  state = { end: Date.now() + seconds * 1000, done: false, timer: setInterval(tick, 500) };
  tick();
}

export function stopRest() {
  if (state) { clearInterval(state.timer); state = null; }
  document.getElementById('rest-timer')?.remove();
}

/** Suggested rest in seconds: longer after the main lifts and their variants, shorter for accessories. */
export function suggestedRest(exercise) { return exercise?.lift ? 180 : 90; }
