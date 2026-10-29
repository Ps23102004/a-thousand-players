// applyTuning (engine/sim.mjs) is fed tuning from replay tokens and Balance-mode answers. It may only set keys listed in
// data/baseline-tuning.json or rules.* keys RULES already has, only to finite numbers, and never touch a prototype
// (bug hunt A10: "rules.__proto__" swapped RULES' prototype in the replay page).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyTuning, TUNABLE } from '../sim.mjs';
import { ANIMATIONS } from '../../game/src/animation.js';
import { RULES, RULE_DEFAULTS } from '../../game/src/tuning.js';
import { ROOT } from './helpers.mjs';

const baseline = JSON.parse(readFileSync(`${ROOT}/data/baseline-tuning.json`, 'utf8')).map(p => p.key);
const snapshot = () => JSON.stringify({ RULES, ANIMATIONS, rp: Object.getPrototypeOf(RULES) === Object.prototype });
afterEach(() => applyTuning(null));

test('the non-rules keys applyTuning accepts are exactly the non-rules keys of data/baseline-tuning.json', () => {
  assert.deepEqual([...TUNABLE].sort(), baseline.filter(k => !k.startsWith('rules.')).sort());
  for (const k of baseline.filter(k => k.startsWith('rules.'))) assert.ok(Object.hasOwn(RULE_DEFAULTS, k.slice(6)), k);
});

test('known keys with finite numbers still apply', () => {
  applyTuning({ 'anim.JAB.damage': 40, 'anim.SWEEP.recovery': 0.9, 'rules.guardDamageMultiplier': 1, 'rival.decisionDelayMin': 0.5, 'rules.grabReleaseFix': 0 });
  assert.equal(ANIMATIONS.JAB.damage, 40); assert.equal(ANIMATIONS.SWEEP.recovery, 0.9); assert.equal(ANIMATIONS.SWEEP.duration, 0.9);
  assert.equal(RULES.guardDamageMultiplier, 1); assert.equal(RULES.decisionDelayMin, 0.5); assert.equal(RULES.grabReleaseFix, 0);
});

test('prototype keys are ignored and leave no trace', () => {
  const before = snapshot();
  applyTuning(JSON.parse('{"rules.__proto__": {"polluted": 1}, "rules.constructor": 3, "rules.toString": 1, "rules.hasOwnProperty": 1, "anim.JAB.__proto__": {"polluted": 1}, "anim.JAB.constructor": 1, "anim.__proto__.damage": 1, "__proto__": {"polluted": 1}}'));
  assert.equal(Object.getPrototypeOf(RULES), Object.prototype);
  assert.equal(Object.getPrototypeOf(ANIMATIONS.JAB), Object.prototype);
  assert.equal(RULES.polluted, undefined); assert.equal(ANIMATIONS.JAB.polluted, undefined); assert.equal({}.polluted, undefined);
  assert.equal(typeof RULES.toString, 'function'); assert.ok(!Object.hasOwn(RULES, 'constructor'));
  assert.equal(snapshot(), before);
});

test('unknown keys and non-finite values are ignored', () => {
  const before = snapshot();
  applyTuning({
    'rules.notARule': 5, 'anim.FIREBALL.damage': 9, 'anim.SWEEP.speed': 2, 'anim.JAB.keyframes': 0, 'anim.JAB.type': 1, 'anim.JAB.duration': 2,
    'anim.THROW_PERSON.reach': 3, 'anim.JAB.damage': NaN, 'anim.CROSS.damage': Infinity, 'anim.HOOK.damage': '30', 'rules.postureOnHit': null,
    'rules.postureOnBlock': {}, 'rival.decisionDelayMin': -Infinity, 'rules.staggerKnockdownLoad': [2],
  });
  assert.equal(snapshot(), before);
});
