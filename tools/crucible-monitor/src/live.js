// Interactive live view. Streams are injected so tests can drive it without a real terminal.
import path from 'node:path';
import { buildPanels, renderLines } from './panels.js';
import { clean, cut } from './text.js';

export const ENTER = '\x1b[?1049h\x1b[?25l\x1b[H\x1b[2J';
export const LEAVE = '\x1b[0m\x1b[?25h\x1b[?1049l';

// Collects once and builds panels; never throws (a failed refresh keeps the previous panels).
export async function snapshot(collectFn, options, refresh) {
  const started = Date.now();
  let data = null;
  try { data = await collectFn(options); refresh.error = null; } catch (error) { refresh.error = error?.message || String(error); }
  refresh.at = new Date();
  refresh.ms = Date.now() - started;
  refresh.count++;
  return data ? buildPanels(data, refresh.at, refresh) : null;
}

export function startLive({ out, stdin, collectFn, options, interval, color, onExit }) {
  const refresh = { count: 0, interval };
  let panels = null;
  let offset = 0;
  let busy = false;
  let stopped = false;
  let timer = null;

  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    stdin.off('data', onKey);
    out.off('resize', onResize);
    try { stdin.setRawMode(false); } catch { /* stream already closed */ }
    stdin.pause();
    out.write(LEAVE);
  }

  function draw() {
    if (stopped) return;
    const rows = out.rows || 24;
    const cols = out.columns || 80;
    if (rows < 5 || cols < 20) {
      out.write('\x1b[H\x1b[2J' + cut('Too small (20x5 min). Enlarge, or q quits.', cols));
      return;
    }
    const body = rows - 2;
    const { lines, starts } = panels ? renderLines(panels, cols) : { lines: ['Loading…'], starts: [] };
    offset = Math.max(0, Math.min(offset, lines.length - body));
    const titles = new Set(starts);
    const bold = (text) => (color ? `\x1b[1m${text}\x1b[0m` : text);
    const inverse = (text) => (color ? `\x1b[7m${text}\x1b[0m` : text);
    const header = cut(`crucible-monitor · ${clean(path.basename(options.repo), 40)} · refresh #${refresh.count} at ${refresh.at ? refresh.at.toLocaleTimeString() : '…'} every ${interval}s · read-only${refresh.error ? ` · REFRESH FAILED: ${clean(refresh.error, 80)} (showing previous data)` : ''}`, cols);
    const footer = cut(`lines ${lines.length ? offset + 1 : 0}-${Math.min(lines.length, offset + body)} of ${lines.length} · ↑↓/jk PgUp/PgDn Home/End · 1-8 panel · r refresh · q quit`, cols);
    const frame = [inverse(header)];
    for (let i = 0; i < body; i++) {
      const index = offset + i;
      const line = lines[index] ?? '';
      frame.push(titles.has(index) ? bold(line) : line);
    }
    frame.push(inverse(footer));
    out.write('\x1b[H' + frame.map((l) => l + '\x1b[K').join('\r\n'));
  }

  async function tick() {
    if (busy || stopped) return;
    busy = true;
    const next = await snapshot(collectFn, options, refresh);
    if (next) panels = next;
    busy = false;
    draw();
  }

  const page = () => Math.max(1, (out.rows || 24) - 3);

  function onKey(key) {
    const s = key.toString('utf8');
    if (s === 'q' || s === 'Q' || s === '\x03') { stop(); onExit(0); return; }
    if (s === '\x1b[A' || s === 'k') offset--;
    else if (s === '\x1b[B' || s === 'j') offset++;
    else if (s === '\x1b[5~') offset -= page();
    else if (s === '\x1b[6~' || s === ' ') offset += page();
    else if (s === '\x1b[H' || s === '\x1b[1~' || s === 'g') offset = 0;
    else if (s === '\x1b[F' || s === '\x1b[4~' || s === 'G') offset = Number.MAX_SAFE_INTEGER;
    else if (/^[1-8]$/.test(s) && panels) offset = renderLines(panels).starts[Number(s) - 1];
    else if (s === 'r' || s === 'R') { tick(); return; }
    else return;
    offset = Math.max(0, offset);
    draw();
  }

  function onResize() { out.write('\x1b[2J'); draw(); }

  try {
    out.write(ENTER);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onKey);
    out.on('resize', onResize);
    draw();
  } catch (error) {
    stop(); // never leave the alternate screen or raw mode behind
    throw error;
  }
  const ready = tick().then(() => { if (!stopped) timer = setInterval(tick, interval * 1000); });
  return { stop, ready, state: () => ({ offset, panels, refresh }) };
}
