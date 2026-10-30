import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
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

test('safe start labels use whole words and reject destructive or external actions first', () => {
  const safe = ['start', 'play', 'new', 'continue', 'ok', 'accept', 'begin', 'resume', 'deploy', 'retry', 'launch', 'enter', 'go', 'got it', 'New Game', 'RESUME ->', 'Play', 'PLAY NOW', 'Start delivery'];
  const unsafe = ['restart', 'quit', 'exit', 'reset', 'delete', 'new game+', 'close', 'buy', 'purchase', 'sign in', 'log in', 'download', 'share', 'Restart mission', 'Play and restart', 'Continue to purchase', 'Enter to sign in', 'New Game Plus', 'display', 'ongoing', 'closed', 'got item', '', 'Controls & settings'];
  for (const label of safe) assert.equal(explorer.isSafeStartLabel(label.toUpperCase()), true, label);
  for (const label of unsafe) {
    assert.equal(explorer.isSafeStartLabel(label), false, label);
    assert.equal(explorer.isSafeStartLabel(label.toUpperCase()), false, label);
  }
  for (const label of unsafe.slice(0, 13)) assert.equal(explorer.isSafeStartLabel(`Play / ${label}`), false, label);
});

for (const label of ['Start free trial', 'Go Premium', 'Play for real money', 'Deposit & Play',
  'Unlock and play', 'Continue with Google', 'Forfeit and play again', 'Abandon run and start new',
  'Play and bet', 'Play and wager', 'Continue with Facebook', 'Continue with Apple']) {
  test(`startup rejects risky label: ${label}`, () => {
    for (const text of [label, label.toUpperCase(), label.replaceAll(' ', '-'), label.replaceAll(' ', '_')]) {
      assert.equal(explorer.isSafeStartLabel(text), false, text);
    }
  });
}

test('ordinary startup and replay labels remain allowed', () => {
  for (const label of ['Start', 'Play', 'New Game', 'Continue', 'Play again']) {
    assert.equal(explorer.isSafeStartLabel(label), true, label);
  }
});

async function fakeRun(seed, crash = false, configure = () => {}, options = {}) {
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
  await configure(page, out);
  try {
    const report = await explore({ page, url: 'http://fake/game', seconds: 12, seed, out,
      ...options, now: options.now ?? (() => time), sleep: options.sleep ?? (async ms => { time += ms; if (crash && time > 6000 && !closed) { closed = true; page.emit('close'); } }),
      capture: async path => {
        const pixels = Uint8Array.from({ length: 9216 }, (_, i) => [20, 40, time % 200, 255][i % 4]);
        return { pixels, png: Buffer.from(path) };
      },
      ...('capture' in options ? { capture: options.capture } : {}),
    });
    const trace = options.skipTrace ? [] : JSON.parse(await readFile(join(out, 'inputs.json'), 'utf8'));
    assert.deepEqual(JSON.parse(await readFile(join(out, 'report.json'), 'utf8')).findings, report.findings);
    return { report, trace };
  } finally { await rm(out, { recursive: true, force: true }); }
}
test('offline fake records errors, frames, and every rotating input with reproducible choices', async () => {
  const a = await fakeRun(42), b = await fakeRun(42), c = await fakeRun(43);
  assert.deepEqual(a.trace, b.trace);
  assert.notDeepEqual(a.trace, c.trace);
  assert.deepEqual(a.report.findings.map(f => f.kind), ['page-error']);
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

for (const fallbackFails of [false, true]) {
  test(`intercepted canvas click reaches budget with ${fallbackFails ? 'keyboard-only recovery' : 'centre mouse fallback'}`, async () => {
    const clicks = [];
    const { report, trace } = await fakeRun(1, false, page => {
      page.locator = selector => ({
        count: async () => selector === 'canvas' ? 1 : 0,
        nth: () => ({
          isVisible: async () => true,
          click: async () => { throw new Error('locator.click: Timeout 1500ms exceeded; overlay intercepts pointer events'); },
          boundingBox: async () => ({ x: 100, y: 50, width: 640, height: 360 }),
        }),
      });
      page.mouse.click = async (x, y) => { clicks.push([x, y]); if (fallbackFails) throw new Error('mouse unavailable'); };
      if (fallbackFails) page.mouse.move = async () => { throw new Error('must stay keyboard only'); };
    });
    assert.equal(report.status, 'completed');
    assert.ok(report.durationMs >= 12000);
    assert.ok(report.events.some(e => e.kind === 'click-intercepted'));
    assert.ok(!report.events.some(e => e.kind === 'explorer-error'));
    assert.deepEqual(clicks, [[420, 230]]);
    assert.ok(trace.some(i => i.type === 'canvas-click' && i.status === 'failed'));
    assert.ok(trace.some(i => i.type === 'keydown' && i.t >= 10000 && i.status === 'sent'));
    assert.equal(trace.some(i => i.type === 'mousemove'), !fallbackFails);
  });
}

test('Resume is clicked but Restart mission is never clicked, even when Play times out', async () => {
  const clicked = [];
  const { report } = await fakeRun(1, false, page => {
    page.locator = selector => ({
      count: async () => selector === 'canvas' ? 0 : 3,
      nth: i => ({
        isVisible: async () => true, isEnabled: async () => true,
        textContent: async () => ['Restart mission', 'Play', 'RESUME ->'][i],
        click: async () => { clicked.push(i); if (i === 1) throw new Error('Timeout 1500ms exceeded'); },
      }),
    });
  });
  assert.equal(report.status, 'completed');
  assert.ok(report.durationMs >= 12000);
  assert.ok(clicked.includes(2));
  assert.ok(!clicked.includes(0));
  assert.ok(report.events.some(e => e.kind === 'click-intercepted'));
});

test('console warnings and page errors report environment refusals separately with counts', async () => {
  const message = 'The root document of this element is not valid for pointer lock.';
  const { report } = await fakeRun(1, false, page => {
    page.goto = async () => {
      page.emit('pageerror', new Error(message));
      page.emit('console', { type: () => 'error', text: () => message });
      page.emit('console', { type: () => 'warning', text: () => 'WebGL driver message: GPU stall due to ReadPixels' });
      page.emit('pageerror', new Error('TypeError: undefined is not a function'));
    };
  });
  assert.deepEqual(report.environment.map(e => [e.kind, e.count]), [['pointer-lock-refused', 2], ['webgl-context-warning', 1]]);
  assert.deepEqual(report.findings.map(e => e.message), ['TypeError: undefined is not a function']);
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

test('native dialogs are recorded and settled without aborting exploration', async () => {
  const handled = [];
  const { report } = await fakeRun(1, false, page => {
    page.goto = async () => {
      for (const type of ['alert', 'confirm', 'prompt', 'beforeunload']) {
        page.emit('dialog', {
          type: () => type, message: () => `fixture ${type}`,
          dismiss: async () => { handled.push([type, 'dismiss']); },
          accept: async () => { handled.push([type, 'accept']); },
        });
      }
    };
  });
  assert.equal(report.status, 'completed');
  assert.deepEqual(handled, ['alert', 'confirm', 'prompt', 'beforeunload'].map(type => [type, 'dismiss']));
  assert.equal(report.events.filter(e => e.kind === 'dialog').length, 4);
});

test('startup skips cross-origin links, downloads, new tabs and external form targets', async () => {
  const targets = [
    { href: 'https://other.test/play' }, { href: '/play', target: '_blank' },
    { href: '/save', download: '' }, { href: 'javascript:location.href="https://other.test"' },
    { formAction: 'https://other.test/submit' }, { formAction: '/submit', formTarget: '_blank' },
    { href: '/game' },
  ];
  const clicked = [];
  const { report } = await fakeRun(1, false, page => {
    page.locator = selector => ({ count: async () => selector === 'canvas' ? 0 : targets.length, nth: i => ({
      isVisible: async () => true, isEnabled: async () => true,
      textContent: async () => `Play ${i}`, evaluate: async () => targets[i],
      click: async () => { clicked.push(i); },
    }) });
  });
  assert.equal(report.status, 'completed');
  assert.deepEqual(clicked, [6]);
});

test('initial redirect adopts the landed origin for startup links, exploration and restoration', async () => {
  const landed = 'https://www.fake.test/fixtures/game';
  let current = 'http://fake/game', departed = false;
  const navigations = [], clicks = [], foreignInputs = [];
  const { report, trace } = await fakeRun(1, false, page => {
    page.url = () => current;
    page.goto = async url => {
      navigations.push(url);
      current = url === 'http://fake/game' ? landed : url;
      page.emit('framenavigated', page);
    };
    page.locator = selector => ({ count: async () => selector === 'canvas' ? 0 : 1,
      nth: () => ({ isVisible: async () => true, isEnabled: async () => true,
        textContent: async () => 'Play', evaluate: async () => ({ href: 'https://www.fake.test/play' }),
        click: async () => { clicks.push(current); } }) });
    page.keyboard.down = async key => {
      if (new URL(current).origin !== new URL(landed).origin) foreignInputs.push(key);
      if (!departed) { departed = true; current = 'https://foreign.test/'; page.emit('framenavigated', page); }
    };
  });
  assert.equal(report.status, 'completed');
  assert.deepEqual(navigations, ['http://fake/game', landed]);
  assert.deepEqual(clicks, [landed, landed]);
  assert.deepEqual(foreignInputs, []);
  assert.ok(report.frames.length > 0);
  assert.ok(report.controlDiffs.length > 0);
  assert.ok(trace.some(input => input.type === 'keydown' && input.status === 'sent'));
  assert.equal(report.events.filter(event => event.kind === 'navigation-away').length, 1);
});

test('unexpected external navigation is recorded and restored before any further input', async () => {
  let current = 'http://fake/game', navigated = false, restored = 0;
  const foreignInputs = [];
  const { report } = await fakeRun(1, false, page => {
    page.url = () => current;
    page.goto = async url => { if (navigated) restored++; current = url; };
    page.keyboard.down = async key => {
      if (new URL(current).origin !== 'http://fake') foreignInputs.push(key);
      if (!navigated) { navigated = true; current = 'https://other.test/checkout'; page.emit('framenavigated', page); }
    };
    page.keyboard.up = async key => { if (new URL(current).origin !== 'http://fake') foreignInputs.push(key); };
  });
  assert.deepEqual(foreignInputs, []);
  assert.equal(restored, 1);
  assert.equal(report.status, 'completed');
  assert.ok(report.events.some(e => e.kind === 'navigation-away'));
});

test('foreign console and network events are ignored while away and from foreign owners after restore', async () => {
  let current = 'http://fake/game', departed = false;
  const { report } = await fakeRun(1, false, page => {
    page.url = () => current;
    const emitNoise = (tag, ownerURL) => {
      const owner = { url: () => ownerURL };
      for (const type of ['error', 'warning']) for (let i = 0; i < 2; i++) {
        page.emit('console', { type: () => type, text: () => tag, ...(ownerURL ? { page: () => owner } : {}) });
      }
      const req = { url: () => `https://cdn.test/${tag}.js`, resourceType: () => 'script',
        failure: () => ({ errorText: tag }), ...(ownerURL ? { frame: () => owner } : {}) };
      page.emit('requestfailed', req);
      page.emit('response', { status: () => 503, url: req.url, request: () => req });
    };
    page.goto = async url => {
      current = url;
      if (departed) {
        emitNoise('foreign-late', 'https://foreign.test/');
        emitNoise('game-cdn', current);
      }
    };
    page.keyboard.down = async () => {
      if (departed) return;
      departed = true; current = 'https://foreign.test/'; page.emit('framenavigated', page);
      emitNoise('foreign-away');
    };
  });
  assert.equal(report.status, 'completed');
  assert.ok(!report.events.some(event => /foreign-/.test(`${event.message} ${event.url}`)));
  assert.ok(!report.findings.some(event => /foreign-/.test(`${event.message} ${event.url}`)));
  assert.equal(report.events.filter(event => ['console-error', 'console-warning', 'failed-request'].includes(event.kind)).length, 6);
  assert.deepEqual(report.findings.map(event => event.kind).sort(), ['console-error', 'console-warning', 'failed-request', 'failed-request']);
});

test('restore navigation aborts are ignored but game aborts and other restore failures remain evidence', async () => {
  let current = 'http://fake/game', departed = false;
  const { report } = await fakeRun(1, false, page => {
    page.url = () => current;
    const fail = (name, errorText) => page.emit('requestfailed', {
      url: () => `http://fake/${name}.js`, resourceType: () => 'script', frame: () => page,
      failure: () => ({ errorText }),
    });
    page.goto = async url => {
      current = url;
      if (departed) {
        fail('restore-abort', 'net::ERR_ABORTED');
        fail('restore-failure', 'net::ERR_FAILED');
      }
    };
    page.keyboard.down = async () => {
      if (departed) return;
      fail('game-abort', 'net::ERR_ABORTED');
      departed = true; current = 'https://foreign.test/'; page.emit('framenavigated', page);
    };
  });
  assert.equal(report.status, 'completed');
  assert.deepEqual(report.events.filter(event => event.kind === 'failed-request').map(event => event.url),
    ['http://fake/game-abort.js', 'http://fake/restore-failure.js']);
  assert.deepEqual(report.findings.map(event => event.url), ['http://fake/game-abort.js', 'http://fake/restore-failure.js']);
});

test('popup pages are closed and downloads cancelled while exploration continues', async () => {
  let closed = false, cancelled = false;
  const { report } = await fakeRun(1, false, page => {
    page.goto = async () => {
      page.emit('popup', { url: () => 'https://other.test/', close: async () => { closed = true; } });
      page.emit('download', { url: () => 'http://fake/file', cancel: async () => { cancelled = true; } });
    };
    page.bringToFront = async () => {};
  });
  assert.equal(closed, true); assert.equal(cancelled, true);
  assert.equal(report.status, 'completed');
  assert.ok(report.events.some(e => e.kind === 'popup'));
  assert.ok(report.events.some(e => e.kind === 'download'));
});

for (const [surface, method] of [['keyboard', 'down'], ['keyboard', 'up'], ['mouse', 'move'], ['mouse', 'down'], ['mouse', 'up']]) {
  test(`transient ${surface}.${method} failure becomes an environment note and exploration continues`, async () => {
    let calls = 0;
    const { report, trace } = await fakeRun(1, false, page => {
      page[surface][method] = async () => { if (++calls === 1) throw new Error('transient dispatch failure'); };
    });
    assert.equal(report.status, 'completed');
    assert.ok(report.durationMs >= 12000);
    assert.ok(calls > 1);
    assert.ok(trace.some(i => i.status === 'failed'));
    assert.ok(report.environment.some(e => e.kind === 'input-error'));
  });
}

for (const stage of ['startup', 'input', 'capture', 'decoder']) {
  test(`hard deadline saves a partial report when ${stage} never resolves`, { timeout: 5000 }, async () => {
    const wallStart = performance.now();
    const { report } = await fakeRun(1, false, page => {
      const hang = () => new Promise(() => {});
      if (stage === 'startup') page.goto = hang;
      if (stage === 'input') page.keyboard.down = hang;
      if (stage === 'capture') page.viewportSize = () => { throw new Error('unused'); };
      if (stage === 'decoder') page.context = () => ({ newPage: hang });
    }, { seconds: stage === 'input' ? 0.25 : 0.05, ...(['capture', 'decoder'].includes(stage) ? { capture: stage === 'capture' ? () => new Promise(() => {}) : undefined } : {}) });
    assert.ok(performance.now() - wallStart < 4000);
    assert.equal(report.status, 'incomplete');
    assert.ok(report.events.some(e => e.kind === 'deadline-exceeded'));
  });
}

test('a failed trace write still saves an incomplete report', async () => {
  const { report } = await fakeRun(1, false, async (page, out) => { await mkdir(join(out, 'inputs.json')); }, { skipTrace: true });
  assert.equal(report.status, 'incomplete');
  assert.ok(report.events.some(e => e.kind === 'report-write-error'));
});

for (const binding of ['ArrowUp', 'Space', 'Enter', 'mouse']) {
  test(`a static game responding only to ${binding} is probed before declaring deadkeys`, async () => {
    let state = 0;
    const { report } = await fakeRun(1, false, page => {
      page.goto = async () => {};
      page.keyboard.down = async key => { if (key === binding) state++; };
      page.mouse.down = async () => { if (binding === 'mouse') state++; };
    }, { capture: async () => ({ png: Buffer.from('fixture'), pixels: Uint8Array.from({ length: 9216 }, (_, i) => [30 + state % 100, 40, 80, 255][i % 4]) }) });
    assert.equal(report.controls, 'responsive');
    assert.ok(report.frames.some(f => f.label === `control-probe:${binding}`));
    assert.deepEqual(report.findings, []);
  });
}

test('ordinary console warnings are retained as observations without single-warning findings', async () => {
  const { report } = await fakeRun(1, false, page => {
    page.goto = async () => page.emit('console', { type: () => 'warning', text: () => 'optional audio skipped' });
  });
  assert.ok(report.events.some(e => e.kind === 'console-warning' && e.message === 'optional audio skipped'));
  assert.deepEqual(report.findings, []);
});

test('fresh-context New Game and guest continue are allowed while tricky destructive labels stay blocked', () => {
  const allowed = ['New Game', 'New-Game', 'New_Game', 'Continue as guest'];
  const blocked = [
    'Play again (delete save)', 'Exit to menu', 'Buy now', 'Log in to play', 'OK, quit',
    'Login to play', 'Log-in to play', 'Signin to continue', 'Sign-in to continue',
    'Play again (deletes save)', 'Play (erase save)', 'Remove save & play', 'Wipe slot and play',
    'Pay to play', 'Go to checkout', 'Continue to store', 'Play while resetting saves',
    'New Game+', 'New Game Plus', 'New-Game-Plus', 'New_Game+',
    'Continue to subscribe', 'Accept payment', 'Play and install update', 'Close',
  ];
  for (const label of allowed) assert.equal(explorer.isSafeStartLabel(label), true, label);
  for (const label of blocked) assert.equal(explorer.isSafeStartLabel(label), false, label);
});

test('normal real-clock budget expiry completes, releases held keys and saves the report', async () => {
  const held = new Set();
  const { report } = await fakeRun(1, false, page => {
    page.goto = async () => {};
    page.keyboard.down = async key => held.add(key);
    page.keyboard.up = async key => held.delete(key);
  }, { seconds: 0.3, now: () => performance.now(), sleep: ms => new Promise(resolve => setTimeout(resolve, ms + 10)) });
  assert.equal(report.status, 'completed');
  assert.equal(held.size, 0);
});

test('default capture cannot issue another browser command after the deadline', async () => {
  let resolveRects, screenshots = 0;
  const { report } = await fakeRun(1, false, page => {
    page.goto = async () => {};
    page.bringToFront = async () => {};
    page.context = () => ({ newPage: async () => ({ close: async () => {}, evaluate: async () => Array(9216).fill(80) }) });
    page.locator = () => ({ count: async () => 0, evaluateAll: () => new Promise(resolve => { resolveRects = resolve; }) });
    page.screenshot = async () => { screenshots++; return Buffer.from('png'); };
  }, { seconds: 0.05, capture: undefined });
  assert.equal(report.status, 'incomplete');
  resolveRects([]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(screenshots, 0);
});

test('failed navigation restoration stops without dispatching any input to the foreign page', async () => {
  let current = 'http://fake/game', navigated = false;
  const foreignInputs = [];
  const { report } = await fakeRun(1, false, page => {
    page.url = () => current;
    page.goto = async () => { if (navigated) throw new Error('restore refused'); };
    page.keyboard.down = async key => {
      if (current !== 'http://fake/game') foreignInputs.push(key);
      if (!navigated) { navigated = true; current = 'https://other.test/'; page.emit('framenavigated', page); }
    };
    page.keyboard.up = async key => { if (current !== 'http://fake/game') foreignInputs.push(key); };
  });
  assert.equal(report.status, 'incomplete');
  assert.deepEqual(foreignInputs, []);
  assert.ok(report.events.some(e => e.message === 'restore refused'));
});

test('startup destination checks use resolved link and form URLs including an external base URL', async () => {
  const clicked = [];
  const { report } = await fakeRun(1, false, page => {
    page.locator = selector => ({ count: async () => selector === 'canvas' ? 0 : 3, nth: i => ({
      isVisible: async () => true, isEnabled: async () => true,
      textContent: async () => `Play ${i}`,
      evaluate: async fn => fn({
        href: i === 0 ? 'https://other.test/play' : undefined,
        form: i === 1 ? { action: 'http://fake/submit', target: '' } : null,
        formAction: 'https://other.test/submit',
        getAttribute: name => i === 0 && name === 'href' ? '/play' : i === 1 && name === 'formaction' ? '/submit' : null,
      }),
      click: async () => clicked.push(i),
    }) });
  });
  assert.equal(report.status, 'completed');
  assert.deepEqual(clicked, [2]);
});

test('an output path blocked by a file returns an incomplete report without destroying that file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'blackbox-storage-'));
  const out = join(dir, 'blocked');
  const page = new EventEmitter();
  Object.assign(page, { isClosed: () => false, url: () => 'http://fake/game' });
  try {
    await writeFile(out, 'keep this file');
    const report = await explore({ page, url: 'http://fake/game', seconds: 1, out, capture: async () => {} });
    assert.equal(report.status, 'incomplete');
    assert.ok(report.events.some(e => e.kind === 'explorer-error'));
    assert.ok(report.events.some(e => e.kind === 'report-write-error'));
    assert.equal(await readFile(out, 'utf8'), 'keep this file');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

for (const surface of ['keyboard', 'mouse']) {
  test(`late ${surface}.down after cleanup is eventually released on the start origin`, async () => {
    let finishDown, held = false, ups = 0;
    const { report } = await fakeRun(1, false, page => {
      page.goto = async () => {};
      page[surface].down = () => new Promise(resolve => { finishDown = () => { held = true; resolve(); }; });
      page[surface].up = async () => { ups++; held = false; };
    }, { seconds: 0.05, now: () => performance.now(), sleep: async () => {} });
    assert.equal(report.status, 'incomplete');
    assert.ok(ups > 0, 'cleanup sends up even before a pending down settles');
    finishDown();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(held, false, 'late dispatch cannot leave input held');
    assert.ok(ups >= 2, 'late down receives another release');
  });
}

test('decoder page resolving after the run is closed', async () => {
  let resolvePage, closed = false;
  const { report } = await fakeRun(1, false, page => {
    page.context = () => ({ newPage: () => new Promise(resolve => { resolvePage = resolve; }) });
  }, { seconds: 0.05, capture: undefined });
  assert.equal(report.status, 'incomplete');
  resolvePage({ close: async () => { closed = true; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed, true);
});

test('cleanup waits for in-flight popup and download work without late refocusing', async () => {
  let closed = false, cancelled = false, focused = 0;
  const { report } = await fakeRun(1, false, page => {
    page.goto = async () => {
      page.emit('popup', { url: () => 'http://fake/popup', close: async () => { await new Promise(r => setTimeout(r, 30)); closed = true; } });
      page.emit('download', { url: () => 'http://fake/file', cancel: async () => { await new Promise(r => setTimeout(r, 30)); cancelled = true; } });
    };
    page.bringToFront = async () => { focused++; };
  }, { seconds: 0.5 });
  assert.equal(report.status, 'completed');
  assert.equal(closed, true);
  assert.equal(cancelled, true);
  assert.equal(focused, 0);
});

test('popups and downloads emitted after return still receive cleanup', async () => {
  let source, closed = false, cancelled = false;
  await fakeRun(1, false, page => { source = page; page.goto = async () => {}; });
  source.emit('popup', { url: () => 'http://fake/late', close: async () => { closed = true; } });
  source.emit('download', { url: () => 'http://fake/late', cancel: async () => { cancelled = true; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed, true);
  assert.equal(cancelled, true);
  source.emit('close');
  assert.equal(source.listenerCount('popup'), 0);
});

test('start label heuristic rejects commerce and destructive bypasses', () => {
  for (const label of ['Donate and play', 'Shop and play', 'Order and play', 'Start over',
    'Play then donate', 'Start shopping', 'Continue to store', 'Order now and start',
    'Go to checkout', 'Subscribe and play', 'Reset and play', 'Start-over',
    'Erase and play', 'Wipe and play', 'Delete and start']) {
    assert.equal(explorer.isSafeStartLabel(label), false, label);
  }
});

test('periodic samples wait five seconds from the previous captured sample with a fake clock', async () => {
  let clock = 0, captures = 0;
  const { report } = await fakeRun(1, false, page => { page.goto = async () => {}; }, {
    seconds: 30, now: () => clock, sleep: async ms => { clock += ms; },
    capture: async () => {
      if (++captures === 1) clock += 10000;
      return { png: Buffer.from('sample'), pixels: Uint8Array.from({length:9216}, (_,i) => [20,40,80,255][i%4]) };
    },
  });
  const samples = report.frames.filter(f => ['initial','periodic'].includes(f.label));
  assert.ok(samples.length >= 3);
  for (let i=1;i<samples.length;i++) assert.ok(samples[i].t - samples[i-1].t >= 5000, JSON.stringify(samples));
});

test('beforeunload is accepted during intended origin recovery so ensureStartPage does not throw', async () => {
  let current = 'http://fake/game', departed = false, accepted = 0;
  const { report } = await fakeRun(1, false, page => {
    page.url = () => current;
    page.goto = async url => {
      if (!departed) return;
      await new Promise(resolve => page.emit('dialog', {
        type: () => 'beforeunload', message: () => 'Leave external page?',
        accept: async () => { accepted++; current = url; resolve(); },
        dismiss: async () => { resolve(); },
      }));
    };
    page.keyboard.down = async () => {
      if (!departed) { departed = true; current = 'https://external.test/game'; page.emit('framenavigated', page); }
    };
  });
  assert.equal(report.status, 'completed');
  assert.equal(accepted, 1);
  assert.ok(!report.events.some(e => e.kind === 'explorer-error'));
  assert.ok(report.events.some(e => e.kind === 'dialog' && e.action === 'accept'));
});

test('a healthy capture started before the exploration deadline can finish completed', async () => {
  let captures = 0;
  const { report } = await fakeRun(1, false, page => { page.goto = async () => {}; }, {
    seconds: 0.05, now: () => performance.now(), sleep: async () => {},
    capture: async () => {
      if (++captures === 1) await new Promise(resolve => setTimeout(resolve, 70));
      return { png: Buffer.from('healthy'), pixels: Uint8Array.from({length:9216}, (_,i) => [20,40,80,255][i%4]) };
    },
  });
  assert.equal(report.status, 'completed');
  assert.ok(report.frames.length > 0);
  assert.ok(!report.events.some(e => e.kind === 'deadline-exceeded'));
});

for (const keyboardOnly of [false, true]) {
  for (const freezes of [false, true]) {
    test(`${keyboardOnly ? 'keyboard-only' : 'normal'} complete probes detect ${freezes ? 'freeze' : 'deadkeys'}`, async () => {
      let clock = 0, state = 0;
      const { report } = await fakeRun(1, false, page => {
        page.goto = async () => {};
        page.keyboard.down = async () => { if (freezes && clock < 7000) state++; };
        if (keyboardOnly) {
          page.locator = selector => ({ count: async () => selector === 'canvas' ? 1 : 0,
            nth: () => ({ isVisible: async () => true, click: async () => { throw new Error('intercepted'); },
              boundingBox: async () => ({x:0,y:0,width:100,height:100}) }) });
          page.mouse.click = async () => { throw new Error('mouse unavailable'); };
        }
      }, { seconds:23, now:() => clock, sleep: async ms => { clock += ms; },
        capture: async () => ({png:Buffer.from('board'),pixels:Uint8Array.from({length:9216},(_,i)=>[20 + state % 200,40,80,255][i%4])}) });
      assert.equal(report.expectedControlProbes, keyboardOnly ? 10 : 11);
      assert.equal(report.controls, freezes ? 'responsive' : 'unresponsive');
      assert.deepEqual(report.findings.map(f=>f.kind), [freezes ? 'freeze' : 'deadkeys']);
      if (freezes) assert.equal(report.freezeAssessment, 'suspected');
    });
  }
}

test('returning to start reruns startup once and focuses the canvas before more controls', async () => {
  let current = 'http://fake/game', started = false, focused = false, departed = false, starts = 0, focuses = 0;
  const badInputs = [];
  const { report } = await fakeRun(1, false, page => {
    page.url = () => current;
    page.goto = async url => { current = url; started = false; focused = false; };
    page.locator = selector => ({ count: async () => selector === 'canvas' || !started ? 1 : 0,
      nth: () => ({ isVisible: async () => selector === 'canvas' ? started : !started,
        isEnabled: async () => true, textContent: async () => 'Start game',
        click: async () => { if (selector === 'canvas') { focused = true; focuses++; } else { started = true; starts++; } } }) });
    page.keyboard.down = async key => {
      if (!started || !focused) badInputs.push(key);
      if (!departed) { departed = true; current = 'https://external.test/'; page.emit('framenavigated', page); }
    };
  });
  assert.equal(report.status, 'completed');
  assert.deepEqual(badInputs, []);
  assert.equal(starts, 2);
  assert.equal(focuses, 2);
});

test('repeated script departure terminates incomplete after two restoration attempts', async () => {
  let current = 'http://fake/game', restores = -1;
  const { report } = await fakeRun(1, false, page => {
    page.url = () => current;
    page.goto = async url => { restores++; current = url; };
    page.keyboard.down = async () => { current = 'https://external.test/loop'; page.emit('framenavigated', page); };
  });
  assert.equal(report.status, 'incomplete');
  assert.equal(restores, 2);
  assert.equal(report.restorationAttempts, 2);
  assert.ok(report.events.some(e => /restoration limit/i.test(e.message ?? '')));
});

test('capture completion at the budget does not start another stalled capture', async () => {
  let captures = 0;
  const { report } = await fakeRun(1, false, page => { page.goto = async () => {}; }, {
    seconds:0.05, now:() => performance.now(), sleep:async () => {},
    capture:async () => {
      if (++captures > 1) return new Promise(() => {});
      await new Promise(resolve => setTimeout(resolve,70));
      return {png:Buffer.from('complete'),pixels:Uint8Array.from({length:9216},(_,i)=>[20,40,80,255][i%4])};
    },
  });
  assert.equal(report.status,'completed');
  assert.equal(captures,1);
});

test('healthy captures finishing just before the budget stay completed', async () => {
  let capturedBeforeDeadline = false, started;
  const { report } = await fakeRun(1,false,page => { page.goto = async () => {}; }, {
    seconds:0.1, now:() => { started ??= performance.now(); return performance.now(); },
    sleep:async () => {},
    capture:async () => {
      await new Promise(resolve => setTimeout(resolve,35));
      capturedBeforeDeadline ||= performance.now() - started < 100;
      return {png:Buffer.from('complete'),pixels:Uint8Array.from({length:9216},(_,i)=>[20,40,80,255][i%4])};
    },
  });
  assert.equal(capturedBeforeDeadline,true);
  assert.equal(report.status,'completed');
  assert.ok(!report.events.some(e => e.kind === 'deadline-exceeded'));
});
