import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { explore, INPUT_KEYS } from './explorer.mjs';
import * as explorer from './explorer.mjs';

test('canvas clip selects the largest visible on-screen rectangle without mutating boxes', () => {
  const boxes = [
    { x: 0, y: 0, width: 1000, height: 1000, visible: false },
    { x: 100, y: 70, width: 640, height: 360, visible: true },
    { x: 0, y: 0, width: 320, height: 180, visible: true },
    { x: 1000, y: 0, width: 2000, height: 2000, visible: true },
    { x: 0, y: 0, width: 0, height: 600, visible: true },
  ];
  const original = structuredClone(boxes);
  assert.deepEqual(explorer.selectCanvasClip(boxes, { width: 960, height: 640 }), { x: 100, y: 70, width: 640, height: 360 });
  assert.deepEqual(boxes, original);
});

test('canvas clip intersects viewport edges and ranks by visible area', () => {
  const viewport = { width: 960, height: 640 };
  assert.deepEqual(explorer.selectCanvasClip([
    { x: -100, y: -20, width: 600, height: 400, visible: true },
  ], viewport), { x: 0, y: 0, width: 500, height: 380 });
  assert.deepEqual(explorer.selectCanvasClip([
    { x: 950, y: 630, width: 2000, height: 2000, visible: true },
    { x: 0, y: 0, width: 300, height: 200, visible: true },
  ], viewport), { x: 0, y: 0, width: 300, height: 200 });
});

test('canvas clip falls back to the page for absent, hidden, off-screen or invalid boxes', () => {
  const viewport = { width: 960, height: 640 };
  assert.equal(explorer.selectCanvasClip([], viewport), null);
  assert.equal(explorer.selectCanvasClip([
    { x: 0, y: 0, width: 50, height: 50, visible: false },
    { x: -50, y: 0, width: 50, height: 50, visible: true },
    { x: 960, y: 0, width: 50, height: 50, visible: true },
    { x: 0, y: 0, width: NaN, height: 50, visible: true },
    { x: 0, y: 0, width: 50, height: -1, visible: true },
  ], viewport), null);
});

async function fakeRun(seed, crash = false) {
  const out = await mkdtemp(join(tmpdir(), 'blackbox-test-'));
  let time = 0, closed = false;
  const page = new EventEmitter();
  Object.assign(page, {
    goto: async () => { page.emit('console', { type: () => 'error', text: () => 'console evidence' }); page.emit('pageerror', new Error('page evidence')); page.emit('requestfailed', { url: () => 'http://fake/missing', failure: () => ({ errorText: 'offline' }) }); },
    locator: () => ({ count: async () => 0 }),
    keyboard: { down: async () => {}, up: async () => {} },
    mouse: { move: async () => {}, down: async () => {}, up: async () => {}, click: async () => {} },
    viewportSize: () => ({ width: 1280, height: 720 }),
    isClosed: () => closed, url: () => closed ? 'about:blank' : 'http://fake/game',
    mainFrame: () => page,
  });
  try {
    const report = await explore({ page, url: 'http://fake/game', seconds: 12, seed, out,
      now: () => time, sleep: async ms => { time += ms; if (crash && time > 6000 && !closed) { closed = true; page.emit('close'); } },
      capture: async path => {
        const pixels = Uint8Array.from({ length: 9216 }, (_, i) => [20, 40, time % 200, 255][i % 4]);
        return { pixels, png: Buffer.from(path) };
      },
    });
    const trace = JSON.parse(await readFile(join(out, 'inputs.json'), 'utf8'));
    assert.deepEqual(JSON.parse(await readFile(join(out, 'report.json'), 'utf8')).findings, report.findings);
    return { report, trace };
  } finally { await rm(out, { recursive: true, force: true }); }
}
test('offline fake records errors, frames, and every rotating input with reproducible choices', async () => {
  const a = await fakeRun(42), b = await fakeRun(42), c = await fakeRun(43);
  assert.deepEqual(a.trace, b.trace);
  assert.notDeepEqual(a.trace, c.trace);
  assert.deepEqual(a.report.findings.map(f => f.kind), ['console-error', 'page-error', 'failed-request']);
  assert.ok(a.report.frames.length >= 3);
  for (const key of INPUT_KEYS) assert.ok(a.trace.some(i => i.type === 'keydown' && i.key === key), key);
  for (const type of ['mousemove', 'mousedown', 'mouseup']) assert.ok(a.trace.some(i => i.type === type));
  assert.ok(a.trace.every(i => Number.isFinite(i.t) && i.status));
});
test('page close stops early and preserves prior evidence and input trace', async () => {
  const { report, trace } = await fakeRun(1, true);
  assert.equal(report.status, 'crashed');
  assert.ok(report.durationMs < 12000);
  assert.ok(report.findings.some(f => f.kind === 'crash'));
  assert.ok(trace.length > 0);
});

test('default capture screenshots the selected canvas clip, or the page without a visible canvas', async () => {
  for (const visible of [true, false]) {
    const out = await mkdtemp(join(tmpdir(), 'blackbox-capture-test-'));
    let time = 0;
    const screenshots = [], box = { x: 80, y: 90, width: 640, height: 360, visible };
    const pixels = Uint8Array.from({ length: 9216 }, (_, i) => [20, 40, 80, 255][i % 4]);
    const decoder = { evaluate: async () => Array.from(pixels), close: async () => {} };
    const page = new EventEmitter();
    Object.assign(page, {
      context: () => ({ newPage: async () => decoder }), bringToFront: async () => {},
      goto: async () => {}, isClosed: () => false,
      viewportSize: () => ({ width: 960, height: 640 }),
      locator: selector => ({
        count: async () => selector === 'canvas' ? 1 : 0,
        nth: () => ({ isVisible: async () => visible, click: async () => {} }),
        evaluateAll: async () => [box],
      }),
      screenshot: async options => { screenshots.push(options); return Buffer.from('fake PNG'); },
      keyboard: { down: async () => {}, up: async () => {} },
      mouse: { move: async () => {}, down: async () => {}, up: async () => {} },
    });
    try {
      const report = await explore({ page, url: 'http://fake/game', seconds: 1, out,
        now: () => time, sleep: async ms => { time += ms; } });
      assert.equal(report.status, 'completed');
      assert.ok(screenshots.length > 0);
      for (const options of screenshots) {
        assert.deepEqual(options.clip, visible ? { x: 80, y: 90, width: 640, height: 360 } : undefined);
      }
      assert.ok(report.frames.every(frame => frame.region === (visible ? 'largest-visible-canvas' : 'viewport')));
    } finally { await rm(out, { recursive: true, force: true }); }
  }
});
