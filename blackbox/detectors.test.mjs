import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { frameDiff, isBlank, frozenStreak, classifyControlsResponse, summarize } from './detectors.mjs';
import * as detectors from './detectors.mjs';

const solid = (r, g = r, b = r) => Uint8Array.from({ length: 64 * 36 * 4 }, (_, i) => [r, g, b, 255][i % 4]);
const scene = () => { const f = solid(20, 40, 80); f.fill(255, 400, 600); return f; };

test('real Chrome freeze report retains complete repeat probes when the last suite hits the budget', async () => {
  const chrome = JSON.parse(await readFile(new URL('./fixtures/chrome-freeze-report.json', import.meta.url), 'utf8'));
  const frames = chrome.frames.filter(f => ['initial', 'periodic'].includes(f.label));
  assert.deepEqual(frames.map(f => f.t), [274, 5403, 10587, 15769, 20884]);
  assert.deepEqual(chrome.diffs.map(d => Number(d.toFixed(4))), [0.0007, 0.0049, 0, 0]);
  assert.deepEqual(chrome.controlDiffs.map(d => Number(d.toFixed(4))), [0.0051, 0.0045, 0.0051, 0.0045, 0.0051, 0.0045, 0.0051, 0.0045, 0, 0, 0]);
  assert.deepEqual(chrome.intervalActivity, [null, null, false, null]);
  assert.equal(chrome.animationEvidence, false);
  const result = summarize({ ...chrome, frames });
  assert.equal(result.controls, 'responsive');
  assert.equal(result.frozenIntervals, 2);
  assert.deepEqual(result.findings.map(f => f.kind), ['freeze']);
  assert.equal(result.freezeAssessment, 'suspected');
});

test('complete unchanged repeat probes apply only to a continuous still streak', () => {
  const base = { frames: [0, 5000, 10000, 15000].map(t => ({ t, blank: false })),
    diffs: [0, 0, 0], inputsSent: [5, 5, 5], controlDiffs: [0.1], animationEvidence: false };
  assert.deepEqual(summarize({ ...base, intervalActivity: [false, null, null] }).findings.map(f => f.kind), ['freeze']);
  for (const observation of [
    { intervalActivity: [null, null, null] },
    { intervalActivity: [null, null, false] },
    { intervalActivity: [false, true, null] },
    { intervalActivity: [false, null, null], diffs: [0, 0.1, 0] },
    { intervalActivity: [false, null, null], inputsSent: [5, 0, 5] },
    { intervalActivity: [false, null, null], frames: [0, 5000, 10000, 15000].map((t, i) => ({ t, blank: i === 2 })) },
  ]) assert.deepEqual(summarize({ ...base, ...observation }).findings, [], JSON.stringify(observation));
});
test('page error classifier separates automation refusals from game defects', () => {
  const cases = [
    ['The root document of this element is not valid for pointer lock.', 'pointer-lock-refused'],
    ['Pointer lock request denied by browser', 'pointer-lock-refused'],
    ['THREE.PointerLockControls: Unable to use Pointer Lock API', null],
    ["Failed to execute 'requestPointerLock' on 'Element': A user gesture is required.", 'pointer-lock-refused'],
    ['NotAllowedError: User gesture is required', 'user-gesture-refused'],
    ['Fullscreen request denied: user activation is required', 'fullscreen-refused'],
    ["Failed to execute 'requestFullscreen': Permissions check failed", 'fullscreen-refused'],
    ['WebGL context warning: GPU driver reset', null],
    ['[.WebGL-context-0x123]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels', 'webgl-context-warning'],
    ['[.WebGL-0x123]GL Driver Message: GPU stall due to ReadPixels', 'webgl-context-warning'],
    ['TypeError: undefined is not a function', null],
    ['TypeError: canvas.requestPointerLock is not a function', null],
    ['TypeError: fullscreen handler is undefined', null],
    ['WebGL context setup failed: invalid shader source', null],
    ['Uncaught Error: planted game defect', null],
  ];
  for (const [message, kind] of cases) assert.equal(detectors.classifyPageError(message), kind, message);
});

test('environment errors are counted without suppressing real errors or an associated freeze', () => {
  const refusal = 'The root document of this element is not valid for pointer lock.';
  const base = {
    frames: [0, 5000, 10000, 15000, 20000].map(t => ({ t, blank: false })),
    diffs: [0.1, 0, 0, 0.1], inputsSent: [5, 5, 5, 5], controlDiffs: [0.1], animationEvidence: true, intervalActivity: [false, false, false, false],
    events: [{ t: 1000, kind: 'page-error', message: refusal }, { t: 4000, kind: 'console-error', message: refusal }],
  };
  const report = summarize(base);
  assert.deepEqual(report.environment.map(e => [e.kind, e.message, e.count]), [['pointer-lock-refused', refusal, 2]]);
  assert.deepEqual(report.findings.map(e => e.kind), ['freeze']);
  assert.equal(report.findings[0].likelyCause, 'pointer-lock-refused');
  const defect = { t: 12000, kind: 'page-error', message: 'TypeError: undefined is not a function' };
  const withDefect = summarize({ ...base, events: [...base.events, defect] });
  assert.equal(withDefect.findings[0].message, defect.message);
  assert.equal(withDefect.findings.find(e => e.kind === 'freeze').likelyCause, undefined);
  assert.equal(summarize({ ...base, events: [{ t: 16000, kind: 'page-error', message: refusal }] }).findings[0].likelyCause, undefined, 'later refusal cannot explain an earlier freeze');
  assert.equal(summarize({ ...base, events: [...base.events, { t: 6000, kind: 'click-intercepted' }] }).findings[0].likelyCause, undefined, 'last event must be an environment refusal');
});
test('RGBA difference is normalized RGB mean; alpha is ignored', () => {
  assert.equal(frameDiff(solid(0), solid(255)), 1);
  assert.equal(frameDiff(solid(0), solid(255, 0, 0)), 1 / 3);
  assert.equal(frameDiff(scene(), scene()), 0);
  const transparent = solid(0); transparent[3] = 0;
  assert.equal(frameDiff(solid(0), transparent), 0);
});
test('requires complete 64 by 36 RGBA samples', () => {
  assert.throws(() => frameDiff(new Uint8Array(4), solid(0)), /64x36/);
  assert.throws(() => isBlank(new Uint8Array()), /64x36/);
});
test('blank includes near black and white, but not a flat colored game or a square', () => {
  assert.equal(isBlank(solid(0)), true);
  assert.equal(isBlank(solid(254)), true);
  assert.equal(isBlank(solid(5)), true);
  assert.equal(isBlank(solid(20, 40, 80)), false);
  assert.equal(isBlank(scene()), false);
});
test('freeze needs two unchanged intervals with inputs in each', () => {
  assert.equal(frozenStreak([0.1, 0, 0], [3, 4, 5]), 2);
  assert.equal(frozenStreak([0, 0], [0, 4]), 1);
  assert.equal(frozenStreak([0, 0.1], [4, 4]), 0);
  assert.equal(frozenStreak([], []), 0);
});
test('controls require enough actual probes and distinguish response from uncertainty', () => {
  assert.equal(classifyControlsResponse(Array(11).fill(0)), 'unresponsive');
  assert.equal(classifyControlsResponse([0, 0.02, 0, 0]), 'responsive');
  assert.equal(classifyControlsResponse([0]), 'inconclusive');
});
test('summary separates healthy, dead controls, later freeze, blank and independent errors', () => {
  const base = { frames: [{ blank: false }, { blank: false }, { blank: false }], diffs: [0, 0], inputsSent: [5, 5], controlDiffs: Array(11).fill(0), events: [] };
  const codes = (v) => summarize(v).findings.map(f => f.kind);
  assert.deepEqual(codes(base), ['deadkeys']);
  assert.deepEqual(codes({ ...base, controlDiffs: [0.02, 0, 0, 0], animationEvidence: true, intervalActivity: [false, false] }), ['freeze']);
  assert.deepEqual(codes({ ...base, diffs: [0.1, 0.2], controlDiffs: [0.02, 0, 0, 0] }), []);
  assert.deepEqual(codes({ ...base, frames: [{ t: 0, blank: true }, { t: 5000, blank: true }] }), ['blank']);
  assert.deepEqual(codes({ ...base, events: [{ kind: 'crash', message: 'closed' }] }), ['crash']);
  assert.deepEqual(codes({ ...base, diffs: [0.1, 0.2], controlDiffs: [0.1], events: [{ kind: 'page-error', message: 'oops' }, { kind: 'console-error', message: 'bad' }, { kind: 'failed-request', url: 'x' }] }), ['page-error']);
});
test('summary retains a sustained blank/freeze observation even if the game later recovers', () => {
  const base = { frames: [{ blank: false }, { blank: false }, { blank: false }, { blank: false }], diffs: [0.1, 0, 0, 0.1], inputsSent: [5, 5, 5, 5], intervalActivity: [false, false, false, false], animationEvidence: true, controlDiffs: [0.02, 0, 0, 0], events: [] };
  assert.deepEqual(summarize(base).findings.map(f => f.kind), ['freeze']);
  assert.deepEqual(summarize({ ...base, frames: [{ t: 0, blank: true }, { t: 5000, blank: true }, { t: 10000, blank: false }], diffs: [0.1, 0.1] }).findings.map(f => f.kind), ['blank']);
});

test('visual classifier gives sustained blank precedence over frozen pixels', () => {
  const observation = {
    frames: [false, false, true, true, true].map((blank, i) => ({ t: i * 5000, blank })),
    diffs: [0.1, 0.3, 0, 0], inputsSent: [5, 5, 5, 5], intervalActivity: [false, false, false, false], animationEvidence: true,
  };
  assert.equal(detectors.classifyVisualState(observation), 'blank');
  assert.equal(detectors.classifyVisualState({
    ...observation, frames: observation.frames.map(() => ({ blank: false })),
  }), 'freeze');
  assert.deepEqual(summarize({ ...observation, controlDiffs: [0.1] }).findings.map(f => f.kind), ['blank']);
  assert.deepEqual(summarize({ ...observation, controlDiffs: [0.1], events: [{ kind: 'crash' }] }).findings.map(f => f.kind), ['crash']);
  assert.equal(detectors.classifyVisualState({
    frames: [false, false, false, true, true].map((blank, i) => ({ t: i * 5000, blank })),
    diffs: [0, 0, 0.3, 0], inputsSent: [5, 5, 5, 5], intervalActivity: [false, false, false, false], animationEvidence: true,
  }), 'blank', 'sustained blank wins even after a non-blank freeze');
});

test('a blank sample cannot contribute to a non-blank freeze streak', () => {
  const observation = {
    frames: [false, false, false, true].map((blank, i) => ({ t: i * 5000, blank })),
    diffs: [0.1, 0, 0], inputsSent: [5, 5, 5], controlDiffs: [0.1],
  };
  assert.deepEqual(summarize(observation).findings, []);
  assert.equal(detectors.classifyVisualState(observation), null);
  assert.equal(detectors.classifyVisualState({
    ...observation, frames: [true, false, false].map((blank, i) => ({ t: i * 5000, blank })),
    diffs: [0, 0], inputsSent: [5, 5], animationEvidence: true,
  }), null);
});

test('freeze still requires prior response, two non-blank intervals and delivered inputs', () => {
  const observation = {
    frames: [false, false, false].map((blank, i) => ({ t: i * 5000, blank })),
    diffs: [0, 0], inputsSent: [5, 5], intervalActivity: [false, false],
  };
  assert.equal(detectors.classifyVisualState(observation), null);
  assert.equal(detectors.classifyVisualState({ ...observation, animationEvidence: true }), 'freeze');
  assert.equal(detectors.classifyVisualState({ ...observation, animationEvidence: true, inputsSent: [0, 5] }), null);
});

test('input response alone is not evidence of idle animation in a turn-based game', () => {
  const result = summarize({ frames: [{ blank: false }, { blank: false }, { blank: false }],
    diffs: [0, 0], inputsSent: [5, 5], controlDiffs: [0.02, 0, 0, 0] });
  assert.deepEqual(result.findings, []);
});
test('a response to interval probes rules out a freeze even after earlier animation', () => {
  const result = summarize({ frames: [0, 5000, 10000].map(t => ({ t, blank: false })),
    diffs: [0, 0], inputsSent: [5, 5], controlDiffs: [0.1], animationEvidence: true,
    intervalActivity: [true, true] });
  assert.deepEqual(result.findings, []);
});
test('WASD-only probing is insufficient to declare deadkeys', () => {
  assert.equal(classifyControlsResponse([0, 0, 0, 0]), 'inconclusive');
});

test('capability names and generic failure words do not conceal programming bugs or GPU resets', () => {
  for (const message of [
    'requestPointerLock failed: invalid element null', 'Fullscreen failed: game state corrupt',
    "DOMException: Failed to execute 'requestPointerLock' on 'Element': Element is not connected",
    "TypeError: Failed to execute 'requestPointerLock' on 'Element': parameter 1 is not of type 'PointerLockOptions'",
    'Error: PointerLock initialization failed: level canvas is null',
    'WebGL context warning: GPU driver reset', 'WebGL: CONTEXT_LOST_WEBGL',
    'NetworkError: game asset request failed',
  ]) assert.equal(detectors.classifyPageError(message), null, message);
});
test('specific autoplay and browser permission denials are environment notes', () => {
  for (const [message, kind] of [
    ["NotAllowedError: play() failed because the user didn't interact with the document first.", 'user-gesture-refused'],
    ['NotAllowedError: Permission denied', 'permission-refused'],
    ['net::ERR_INTERNET_DISCONNECTED', 'network-policy-refused'],
    ['WebGL is using software rendering', 'webgl-context-warning'],
    ['SecurityError: Blocked by permissions policy', 'permission-policy-refused'],
    ["Access to fetch has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header", 'network-policy-refused'],
  ]) assert.equal(detectors.classifyPageError(message), kind, message);
});
test('single request failures and console noise are observations; only repeated identical noise is a finding', () => {
  for (const kind of ['failed-request', 'console-error', 'console-warning']) {
    const noise = { t: 1, kind, message: 'optional resource unavailable', ...(kind === 'failed-request' ? { url: 'http://fixture/favicon.ico' } : {}) };
    assert.deepEqual(summarize({ events: [noise] }).findings, []);
    const repeated = summarize({ events: [noise, { ...noise, t: 2 }] }).findings;
    assert.equal(repeated.length, 1);
    assert.equal(repeated[0].kind, kind);
    assert.equal(repeated[0].count, 2);
    if (kind === 'failed-request') assert.deepEqual(summarize({ events: [noise, { ...noise, url: 'http://fixture/other' }] }).findings, []);
  }
  assert.equal(summarize({ events: [{ kind: 'page-error', message: 'broken' }] }).findings.length, 1);
  assert.equal(summarize({ events: [{ kind: 'crash', message: 'closed' }] }).findings.length, 1);
});

 test('periodic animation cannot override zero control probe differences', () => {
  const result = summarize({ controlDiffs: Array(11).fill(0), diffs: [0.01], frames: [{blank:false},{blank:false}] });
  assert.notEqual(result.controls, 'responsive');
 });
 test('idle animation makes nonzero input differences inconclusive', () => {
  assert.equal(summarize({ animationEvidence: true, controlDiffs: Array(11).fill(0.01) }).controls, 'inconclusive');
 });

test('static until input game can freeze after a response without idle animation', () => {
  const result = summarize({ frames: [0,5000,10000].map(t => ({ t, blank:false })),
    diffs: [0,0], inputsSent: [5,5], controlDiffs: [0.1], animationEvidence: false, intervalActivity: [false,false] });
  assert.deepEqual(result.findings.map(f => f.kind), ['freeze']);
});

test('single critical resource and renderer initialization failures are low confidence findings', () => {
  for (const event of [
    {kind:'failed-request',url:'http://fixture/main',resourceType:'script',message:'HTTP 404'},
    {kind:'failed-request',url:'http://fixture/game',resourceType:'document',message:'offline'},
    {kind:'failed-request',url:'http://fixture/game.wasm?v=1',message:'HTTP 404'},
    {kind:'failed-request',url:'http://fixture/level.json',message:'HTTP 404'},
    ...['WebGL init error','Rendering context lost','Initialization failed'].map(message => ({kind:'console-error',message})),
  ]) {
    const findings = summarize({events:[event]}).findings;
    assert.equal(findings.length,1,JSON.stringify(event));
    assert.equal(findings[0].confidence,'low');
  }
});

test('blank samples closer than five seconds are not consecutive blank evidence', () => {
  assert.deepEqual(summarize({frames:[{t:0,blank:true},{t:4999,blank:true}]}).findings, []);
  assert.equal(summarize({frames:[{t:0,blank:true},{t:5000,blank:true}]}).findings[0].kind, 'blank');
  assert.deepEqual(summarize({frames:[{blank:true},{blank:true}]}).findings, []);
});

test('deadkeys coverage matches normal and keyboard-only probe sets and exposes missing evidence', () => {
  assert.equal(classifyControlsResponse(Array(10).fill(0), 10), 'unresponsive');
  assert.equal(classifyControlsResponse(Array(10).fill(0), 11), 'inconclusive');
  assert.equal(classifyControlsResponse(Array(9).fill(0), 10), 'inconclusive');
  const partial = summarize({ controlDiffs: Array(9).fill(0), expectedControlProbes: 10,
    frames:[0,5000,10000].map(t=>({t,blank:false})),diffs:[0,0],inputsSent:[5,5],intervalActivity:[null,null] });
  assert.equal(partial.controls, 'inconclusive');
  assert.equal(partial.freezeAssessment, 'inconclusive');
});

test('real games 2026-10-30: a page that never visibly started is "not started", not dead controls', () => {
  const still = { frames: [{ blank: false }, { blank: false }, { blank: false }], diffs: [0, 0], inputsSent: [5, 5], controlDiffs: Array(11).fill(0), events: [] };
  const notStarted = summarize({ ...still, started: false });
  assert.deepEqual(notStarted.findings.map(f => f.kind), []);
  assert.equal(notStarted.controls, 'inconclusive');
  assert.ok(notStarted.environment.some(e => e.kind === 'not-started'));
  assert.deepEqual(summarize({ ...still, started: true }).findings.map(f => f.kind), ['deadkeys'], 'a started game with dead inputs is still reported');
});

test('real games 2026-10-30: a still interval where the explorer pressed a resume/start button is a self-pause, not a freeze', () => {
  const v = { frames: [{ blank: false }, { blank: false }, { blank: false }, { blank: false }], diffs: [0, 0, 0], inputsSent: [5, 5, 5], controlDiffs: [0.02], animationEvidence: true, intervalActivity: [false, false, false], events: [] };
  assert.deepEqual(summarize(v).findings.map(f => f.kind), ['freeze']);
  const paused = summarize({ ...v, resumedIntervals: [true, true, true], events: [{ kind: 'resume-click', text: 'RESUME', t: 1 }] });
  assert.deepEqual(paused.findings.map(f => f.kind), []);
  assert.ok(paused.environment.some(e => e.kind === 'self-paused'));
});

test('real game (warzone): the same page error repeated every frame is one finding with a count, not thousands', () => {
  const events = [
    ...Array.from({ length: 500 }, (_, i) => ({ t: 25000 + i * 16, kind: 'page-error', message: "Cannot read properties of undefined (reading 'value')" })),
    { t: 26000, kind: 'page-error', message: 'a different bug' },
  ];
  const r = summarize({ frames: [{ blank: false }, { blank: false }], diffs: [0.1], inputsSent: [1], controlDiffs: [0.1], events });
  const pe = r.findings.filter(f => f.kind === 'page-error');
  assert.equal(pe.length, 2);
  assert.equal(pe.find(f => /reading 'value'/.test(f.message)).count, 500);
  assert.equal(pe.find(f => f.message === 'a different bug').count, 1);
});
