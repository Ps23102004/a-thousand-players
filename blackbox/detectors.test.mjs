import test from 'node:test';
import assert from 'node:assert/strict';
import { frameDiff, isBlank, frozenStreak, classifyControlsResponse, summarize } from './detectors.mjs';
import * as detectors from './detectors.mjs';

const solid = (r, g = r, b = r) => Uint8Array.from({ length: 64 * 36 * 4 }, (_, i) => [r, g, b, 255][i % 4]);
const scene = () => { const f = solid(20, 40, 80); f.fill(255, 400, 600); return f; };
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
  assert.equal(classifyControlsResponse([0, 0, 0, 0]), 'unresponsive');
  assert.equal(classifyControlsResponse([0, 0.02, 0, 0]), 'responsive');
  assert.equal(classifyControlsResponse([0]), 'inconclusive');
});
test('summary separates healthy, dead controls, later freeze, blank and independent errors', () => {
  const base = { frames: [{ blank: false }, { blank: false }, { blank: false }], diffs: [0, 0], inputsSent: [5, 5], controlDiffs: [0, 0, 0, 0], events: [] };
  const codes = (v) => summarize(v).findings.map(f => f.kind);
  assert.deepEqual(codes(base), ['deadkeys']);
  assert.deepEqual(codes({ ...base, controlDiffs: [0.02, 0, 0, 0] }), ['freeze']);
  assert.deepEqual(codes({ ...base, diffs: [0.1, 0.2], controlDiffs: [0.02, 0, 0, 0] }), []);
  assert.deepEqual(codes({ ...base, frames: [{ blank: true }, { blank: true }] }), ['blank']);
  assert.deepEqual(codes({ ...base, events: [{ kind: 'crash', message: 'closed' }] }), ['crash']);
  assert.deepEqual(codes({ ...base, diffs: [0.1, 0.2], controlDiffs: [0.1], events: [{ kind: 'page-error', message: 'oops' }, { kind: 'console-error', message: 'bad' }, { kind: 'failed-request', url: 'x' }] }), ['page-error', 'console-error', 'failed-request']);
});
test('summary retains a sustained blank/freeze observation even if the game later recovers', () => {
  const base = { frames: [{ blank: false }, { blank: false }, { blank: false }, { blank: false }], diffs: [0.1, 0, 0, 0.1], inputsSent: [5, 5, 5, 5], controlDiffs: [0.02, 0, 0, 0], events: [] };
  assert.deepEqual(summarize(base).findings.map(f => f.kind), ['freeze']);
  assert.deepEqual(summarize({ ...base, frames: [{ blank: true }, { blank: true }, { blank: false }], diffs: [0.1, 0.1] }).findings.map(f => f.kind), ['blank']);
});

test('visual classifier gives sustained blank precedence over frozen pixels', () => {
  const observation = {
    frames: [false, false, true, true, true].map(blank => ({ blank })),
    diffs: [0.1, 0.3, 0, 0], inputsSent: [5, 5, 5, 5], responded: true,
  };
  assert.equal(detectors.classifyVisualState(observation), 'blank');
  assert.equal(detectors.classifyVisualState({
    ...observation, frames: observation.frames.map(() => ({ blank: false })),
  }), 'freeze');
  assert.deepEqual(summarize({ ...observation, controlDiffs: [0.1] }).findings.map(f => f.kind), ['blank']);
  assert.deepEqual(summarize({ ...observation, controlDiffs: [0.1], events: [{ kind: 'crash' }] }).findings.map(f => f.kind), ['crash']);
  assert.equal(detectors.classifyVisualState({
    frames: [false, false, false, true, true].map(blank => ({ blank })),
    diffs: [0, 0, 0.3, 0], inputsSent: [5, 5, 5, 5], responded: true,
  }), 'blank', 'sustained blank wins even after a non-blank freeze');
});

test('a blank sample cannot contribute to a non-blank freeze streak', () => {
  const observation = {
    frames: [false, false, false, true].map(blank => ({ blank })),
    diffs: [0.1, 0, 0], inputsSent: [5, 5, 5], controlDiffs: [0.1],
  };
  assert.deepEqual(summarize(observation).findings, []);
  assert.equal(detectors.classifyVisualState(observation), null);
  assert.equal(detectors.classifyVisualState({
    ...observation, frames: [true, false, false].map(blank => ({ blank })),
    diffs: [0, 0], inputsSent: [5, 5], responded: true,
  }), null);
});

test('freeze still requires prior response, two non-blank intervals and delivered inputs', () => {
  const observation = {
    frames: [false, false, false].map(blank => ({ blank })),
    diffs: [0, 0], inputsSent: [5, 5],
  };
  assert.equal(detectors.classifyVisualState(observation), null);
  assert.equal(detectors.classifyVisualState({ ...observation, responded: true }), 'freeze');
  assert.equal(detectors.classifyVisualState({ ...observation, responded: true, inputsSent: [0, 5] }), null);
});
