import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { runInNewContext } from 'node:vm';
import { explore } from './explorer.mjs';

const html = await readFile(new URL('./fixtures/bugged-game.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// Execute the actual fixture script offline. This models its clock, fill rectangles,
// inputs and browser events; it does not verify Chrome rendering or screenshot capture.
function fixturePage(bug) {
  const page = new EventEmitter(), listeners = new Map(), timers = [];
  const pixels = new Uint8Array(64 * 36 * 4);
  let time = 0, nextFrame = 16, raf, startClick, started = false, navigated = false, paints = 0;
  const ctx = {
    fillRect(x, y, width, height) {
      if (width === 640 && height === 360) paints++;
      const hex = this.fillStyle.slice(1);
      const rgb = hex.length === 3 ? [...hex].map(c => parseInt(c + c, 16))
        : [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
      for (let py = 0; py < 36; py++) for (let px = 0; px < 64; px++) {
        if ((px + 0.5) * 10 < x || (px + 0.5) * 10 >= x + width || (py + 0.5) * 10 < y || (py + 0.5) * 10 >= y + height) continue;
        pixels.set([...rgb, 255], (py * 64 + px) * 4);
      }
    },
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  };
  const canvas = { style: {}, hidden: true, getContext: () => ctx, focus() {} };
  const button = { addEventListener: (_name, callback) => { startClick = callback; }, remove() { started = true; } };
  const location = {
    search: `?bug=${bug}`,
    set href(_url) { navigated = true; page.emit('framenavigated', page); },
  };
  const sandbox = {
    URLSearchParams, location, performance: { now: () => time },
    document: { querySelector: selector => selector === 'canvas' ? canvas : button },
    addEventListener: (name, callback) => listeners.set(name, callback),
    requestAnimationFrame: callback => { raf = callback; },
    setTimeout: (callback, ms) => timers.push({ at: time + ms, callback }),
  };
  const keyEvent = (name, key) => listeners.get(name)?.({ key: key === 'Space' ? ' ' : key, preventDefault() {} });
  Object.assign(page, {
    goto: async () => { runInNewContext(script, sandbox); },
    locator: selector => {
      const isCanvas = selector === 'canvas';
      return {
        count: async () => isCanvas || !started ? 1 : 0,
        nth: () => ({
          isVisible: async () => isCanvas ? !canvas.hidden : !started,
          isEnabled: async () => true, textContent: async () => 'Start delivery',
          click: async () => { if (!isCanvas) startClick({ currentTarget: button }); },
        }),
      };
    },
    keyboard: { down: async key => keyEvent('keydown', key), up: async key => keyEvent('keyup', key) },
    mouse: { move: async () => {}, down: async () => {}, up: async () => {} },
    viewportSize: () => ({ width: 960, height: 640 }),
    isClosed: () => false, mainFrame: () => page,
    url: () => navigated ? 'about:blank' : `http://fixture/game?bug=${bug}`,
  });
  return {
    page, now: () => time, paints: () => paints,
    capture: async () => ({ pixels: pixels.slice(), png: Buffer.from('offline rectangle sample'), region: 'largest-visible-canvas' }),
    sleep: async ms => {
      const end = time + ms;
      while (nextFrame <= end && !navigated) {
        time = nextFrame; nextFrame += 16;
        for (const timer of timers.filter(timer => !timer.done && timer.at <= time)) {
          timer.done = true;
          try { timer.callback(); } catch (error) { page.emit('pageerror', error); }
        }
        if (!navigated) { const callback = raf; raf = null; callback?.(time); }
      }
      time = end;
    },
  };
}

for (const [bug, expected] of Object.entries({ none: [], blank: ['blank'], freeze: ['freeze'], error: ['page-error'], deadkeys: ['deadkeys'], crash: ['crash'] })) {
  test(`actual ${bug} fixture script produces only its planted finding offline`, async () => {
    const out = await mkdtemp(join(tmpdir(), 'blackbox-fixture-test-'));
    const fixture = fixturePage(bug);
    try {
      const report = await explore({ ...fixture, url: `http://fixture/game?bug=${bug}`, seconds: 23, seed: 1, out });
      assert.equal(report.status, bug === 'crash' ? 'crashed' : 'completed');
      assert.deepEqual(report.findings.map(f => f.kind), expected);
      if (bug === 'deadkeys') {
        assert.equal(report.controls, 'unresponsive');
        assert.ok(fixture.paints() > 100, 'deadkeys keeps repainting the same scene');
      }
      if (bug === 'error') assert.ok(fixture.paints() > 1000, 'timer error leaves animation running');
      if (bug === 'crash') assert.ok(report.durationMs < 23000, 'about:blank stops exploration early');
    } finally { await rm(out, { recursive: true, force: true }); }
  });
}
