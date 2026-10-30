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
function fixturePage(bug, fixtureScript = script, captureMs = 0) {
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
  const button = { addEventListener: (_name, callback) => { startClick = callback; }, set onclick(callback) { startClick = callback; }, remove() { started = true; } };
  const location = {
    search: `?bug=${bug}`,
    set href(_url) { navigated = true; page.emit('framenavigated', page); },
  };
  const sandbox = {
    URLSearchParams, location, performance: { now: () => time },
    console: { error: message => page.emit('console', { type: () => 'error', text: () => message }) },
    document: { createElement: () => ({}), head: { appendChild: node => page.emit('response', {status: () => 404, url: () => 'http://fixture' + node.src, request: () => ({ resourceType: () => 'script' })}) }, querySelector: selector => selector === 'canvas' ? canvas : button },
    addEventListener: (name, callback) => listeners.set(name, callback),
    requestAnimationFrame: callback => { raf = callback; },
    setTimeout: (callback, ms) => timers.push({ at: time + ms, callback }),
  };
  const keyEvent = (name, key) => listeners.get(name)?.({ key: key === 'Space' ? ' ' : key, preventDefault() {} });
  Object.assign(page, {
    goto: async () => { runInNewContext(fixtureScript, sandbox); },
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
  const sleep = async ms => {
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
  };
  return {
    page, now: () => time, paints: () => paints, sleep,
    capture: async () => {
      // Chrome's screenshot/decode work consumes budget while the game clock runs.
      await sleep(captureMs);
      return { pixels: pixels.slice(), png: Buffer.from('offline rectangle sample'), region: 'largest-visible-canvas' };
    },
  };
}

test('capture latency leaves a partial final repeat suite without losing a confirmed freeze', async () => {
  const fixture = fixturePage('freeze', script, 90);
  const out = await mkdtemp(join(tmpdir(), 'blackbox-latency-'));
  try {
    const report = await explore({ ...fixture, url: 'http://fixture/game?bug=freeze', seconds: 23, seed: 1, out });
    assert.equal(report.status, 'completed');
    assert.equal(report.animationEvidence, false);
    assert.equal(report.controls, 'responsive');
    assert.deepEqual(report.intervalActivity, [null, null, false, null]);
    assert.equal(report.frozenIntervals, 2);
    const lastPeriodic = report.frames.findLastIndex(f => f.label === 'periodic');
    const lastProbes = report.frames.slice(lastPeriodic + 1).filter(f => f.label.startsWith('control-probe:'));
    assert.ok(lastProbes.length > 0 && lastProbes.length < report.expectedControlProbes, 'last suite runs out of budget');
    assert.deepEqual(report.findings.map(f => f.kind), ['freeze']);
  } finally { await rm(out, { recursive: true, force: true }); }
});

for (const [bug, expected] of Object.entries({ none: [], turns: [], 'animated-deadkeys': [], 'delayed-animated-deadkeys': [], blank: ['blank'], error: ['page-error'], deadkeys: ['deadkeys'], crash: ['crash'] })) {
  test(`capture latency preserves the ${bug} fixture findings`, async () => {
    const fixtureScript = bug === 'turns'
      ? (await readFile(new URL('./fixtures/turn-based-game.html', import.meta.url), 'utf8')).match(/<script>([\s\S]*?)<\/script>/)[1] : script;
    const fixture = fixturePage(bug, fixtureScript, 90);
    const out = await mkdtemp(join(tmpdir(), 'blackbox-latency-controls-'));
    try {
      const report = await explore({ ...fixture, url: `http://fixture/game?bug=${bug}`, seconds: 23, seed: 1, out });
      assert.equal(report.status, bug === 'crash' ? 'crashed' : 'completed');
      assert.deepEqual(report.findings.map(f => f.kind), expected);
      if (bug === 'turns') {
        assert.equal(report.animationEvidence, false);
        assert.equal(report.controls, 'responsive');
      }
      if (bug.includes('animated-deadkeys')) {
        assert.equal(report.animationEvidence, true);
        assert.equal(report.controls, 'inconclusive');
      }
    } finally { await rm(out, { recursive: true, force: true }); }
  });
}

for (const [bug, expected] of Object.entries({ none: [], 'single-request': ['failed-request'], 'single-console': ['console-error'], blank: ['blank'], freeze: ['freeze'], error: ['page-error'], deadkeys: ['deadkeys'], crash: ['crash'] })) {
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

test('actual arrow-only turn-based fixture responds without idle animation or false findings', async () => {
  const html = await readFile(new URL('./fixtures/turn-based-game.html', import.meta.url), 'utf8');
  const fixture = fixturePage('none', html.match(/<script>([\s\S]*?)<\/script>/)[1]);
  const out = await mkdtemp(join(tmpdir(), 'blackbox-turns-'));
  try {
    const report = await explore({ ...fixture, url: 'http://fixture/game-turns', seconds: 23, out });
    assert.equal(report.status, 'completed');
    assert.equal(report.animationEvidence, false);
    assert.equal(report.controls, 'responsive');
    assert.deepEqual(report.findings, []);
    assert.ok(report.frames.some(f => f.label === 'control-probe:ArrowUp'));
  } finally { await rm(out, { recursive: true, force: true }); }
});

test('independently animated fixture with dead inputs never reports responsive controls', async () => {
  const fixture = fixturePage('animated-deadkeys');
  const out = await mkdtemp(join(tmpdir(), 'blackbox-animated-dead-'));
  try {
    const report = await explore({ ...fixture, url: 'http://fixture/game?bug=animated-deadkeys', seconds: 23, out });
    assert.equal(report.animationEvidence, true);
    assert.equal(report.controls, 'inconclusive');
    assert.ok(report.controlDiffs.some(d => d > 0));
  } finally { await rm(out, { recursive: true, force: true }); }
});

test('independent animation starting during probes also makes controls inconclusive', async () => {
  const fixture = fixturePage('delayed-animated-deadkeys');
  const out = await mkdtemp(join(tmpdir(), 'blackbox-late-animation-'));
  try {
    const report = await explore({ ...fixture, url:'http://fixture/game?bug=delayed-animated-deadkeys', seconds:23, out });
    assert.ok(report.controlDiffs.some(d => d > 0));
    assert.equal(report.controls,'inconclusive');
  } finally { await rm(out,{recursive:true,force:true}); }
});
