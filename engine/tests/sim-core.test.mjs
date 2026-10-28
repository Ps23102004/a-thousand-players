import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, runRound, inputController, applyTuning, mulberry32, hashString, distBucket, KEYS, BIT, STATES, DT, ROUND_TICKS, COUNTDOWN_TICKS } from '../sim.mjs';
import { createPolicy, syntheticPersona } from '../policy.mjs';
import { ANIMATIONS } from '../../game/src/animation.js';
import { RULES, RULE_DEFAULTS } from '../../game/src/tuning.js';
import { play } from './helpers.mjs';

const OUTS = new Set(['win', 'loss', 'draw']);

test('constants: 60 Hz, 99 s round, 12 keys with unique bits, modifiers ordered before attack keys', () => {
  assert.equal(DT, 1 / 60);
  assert.equal(ROUND_TICKS, 99 * 60);
  assert.equal(COUNTDOWN_TICKS, 120);
  assert.equal(KEYS.length, 12);
  assert.equal(new Set(Object.values(BIT)).size, 12);
  assert.equal(BIT.KeyA, 1);
  assert.equal(BIT.KeyE, 1 << 11);
  for (const mod of ['KeyA', 'KeyD', 'KeyS', 'KeyW', 'ShiftLeft']) for (const atk of ['KeyJ', 'KeyK', 'KeyL', 'KeyF']) assert.ok(KEYS.indexOf(mod) < KEYS.indexOf(atk), `${mod} before ${atk}`);
  assert.equal(STATES.length, new Set(STATES).size);
  assert.ok(STATES.includes('MOUNT') && STATES.includes('KNOCKDOWN'));
});

test('mulberry32: same seed same stream, values in [0,1), seeds differ, seed is coerced to uint32', () => {
  const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
  const xs = Array.from({ length: 50 }, () => a()), ys = Array.from({ length: 50 }, () => b()), zs = Array.from({ length: 50 }, () => c());
  assert.deepEqual(xs, ys);
  assert.notDeepEqual(xs, zs);
  for (const x of xs) assert.ok(x >= 0 && x < 1);
  assert.equal(new Set(xs).size, 50);
  assert.deepEqual(Array.from({ length: 5 }, mulberry32(2 ** 32 + 7)), Array.from({ length: 5 }, mulberry32(7)));
  const mean = Array.from({ length: 20000 }, mulberry32(9)).reduce((s, x) => s + x, 0) / 20000;
  assert.ok(Math.abs(mean - 0.5) < 0.02, `mean ${mean}`);
});

test('hashString is FNV-1a 32-bit', () => {
  assert.equal(hashString(''), 2166136261);
  assert.equal(hashString('a'), 0xe40c292c);
  assert.equal(hashString('foobar'), 0xbf9cf968);
  assert.notEqual(hashString('p0001'), hashString('p0002'));
});

test('distBucket boundaries: far > 2.2, mid 1.3..2.2 inclusive, close < 1.3', () => {
  assert.equal(distBucket(2.2000001), 'far');
  assert.equal(distBucket(2.2), 'mid');
  assert.equal(distBucket(1.3), 'mid');
  assert.equal(distBucket(1.2999), 'close');
  assert.equal(distBucket(0), 'close');
  assert.equal(distBucket(50), 'far');
});

test('determinism: same seed twice gives the same hash, events, inputs and full result; different seeds differ', async () => {
  const cases = [[0, 8000], [5, 15919], [9, 23838]];
  const hashes = new Set();
  for (const [i, seed] of cases) {
    const persona = syntheticPersona(i), fighter = i % 2 ? 'rook' : 'kai';
    const a = (await play(persona, seed, { fighter, trace: true })).res, b = (await play(persona, seed, { fighter, trace: true })).res;
    assert.equal(a.hash, b.hash, `hash ${persona.id}`);
    assert.deepEqual(a.ev, b.ev);
    assert.deepEqual(a.inputs, b.inputs);
    assert.equal(JSON.stringify(a), JSON.stringify(b), 'entire result incl. trace is byte-identical');
    hashes.add(a.hash);
  }
  assert.equal(hashes.size, cases.length, 'three different seeds give three different hashes');
  const p = syntheticPersona(2);
  const s1 = (await play(p, 1, {})).res, s2 = (await play(p, 2, {})).res;
  assert.notEqual(s1.hash, s2.hash, 'same persona, different seed');
});

test('result shape and internal consistency', async () => {
  const { res } = await play(syntheticPersona(3), 777);
  assert.ok(OUTS.has(res.out));
  assert.equal(res.hp.length, 2);
  assert.match(res.hash, /^[0-9a-f]{16}[0-9a-f]+$/);
  assert.equal(res.trace, null, 'no trace unless asked for');
  assert.ok(res.t > 0 && res.t <= 99);
  assert.equal(res.dmg[0], Math.round((100 - res.hp[1]) * 10) / 10);
  assert.equal(res.dmg[1], Math.round((100 - res.hp[0]) * 10) / 10);
  if (res.out === 'win') { assert.ok(res.hp[1] <= 0 || res.hp[0] > res.hp[1]); }
  if (res.out === 'loss') { assert.ok(res.hp[0] <= 0 || res.hp[0] < res.hp[1]); }
  if (res.ko) { assert.ok(res.ko.t <= res.t && Math.abs(res.ko.x) < 40); assert.equal(res.ko.t, res.t); }
  assert.ok(res.maxCombo >= 0);
  assert.ok(res.ev.length <= 220);
  let last = 0;
  for (const e of res.ev) { assert.ok(e[0] >= last, 'events are time-ordered'); last = e[0]; assert.ok(e[2] === 0 || e[2] === 1); assert.equal(typeof e[1], 'string'); }
});

test('trace option: 10 Hz rows [x0,x1,hp0,hp1,state0,state1] with valid state indexes', async () => {
  const { res } = await play(syntheticPersona(4), 4242, { trace: true, maxT: 6 });
  assert.equal(res.trace.dt, 0.1);
  assert.deepEqual(res.trace.states, STATES);
  assert.equal(res.trace.f.length, Math.floor(res.t * 60 / 6));
  for (const row of res.trace.f) {
    assert.equal(row.length, 6);
    assert.ok(row[4] >= 0 && row[4] < STATES.length && row[5] >= 0 && row[5] < STATES.length);
    assert.ok(row[2] <= 100 && row[3] <= 100);
  }
  assert.deepEqual(res.trace.ev, res.ev);
});

test('maxT ends the round at that time; values above 99 s are clamped to 99', async () => {
  const idle = { step: () => 0 };
  let sim = await createSim({ seed: 3, maxT: 5, rivalAI: false });
  let res = await runRound(sim, idle);
  assert.equal(res.t, 5); assert.equal(sim.tick, 300); assert.equal(res.out, 'draw'); sim.dispose();
  sim = await createSim({ seed: 3, maxT: 5000, rivalAI: false });
  res = await runRound(sim, idle);
  assert.equal(res.t, 99); assert.equal(sim.tick, ROUND_TICKS); sim.dispose();
});

test('timeout outcome compares hp: ahead wins, behind loses, level draws', async () => {
  for (const [dhp, want] of [[+5, 'win'], [-5, 'loss'], [0, 'draw']]) {
    const sim = await createSim({ seed: 11, maxT: 1, rivalAI: false });
    const res = await runRound(sim, { step(s) { if (s.tick === 0) s.rival.health -= dhp; return 0; } });
    assert.equal(res.out, want, `rival hp delta ${dhp}`);
    assert.equal(res.ko, null, 'a timeout is not a KO');
    sim.dispose();
  }
});

test('KO: rival at 0 hp is a win, player at 0 hp is a loss, with ko.x / ko.t of the loser', async () => {
  let sim = await createSim({ seed: 5, rivalAI: false });
  let res = await runRound(sim, { step(s) { if (s.tick === 30) s.rival.health = 0; return 0; } });
  assert.equal(res.out, 'win'); assert.equal(res.ko.t, 0.5 + 0.02); assert.ok(res.hp[1] <= 0); sim.dispose();
  sim = await createSim({ seed: 5, rivalAI: false });
  res = await runRound(sim, { step(s) { if (s.tick === 30) s.player.health = 0; return 0; } });
  assert.equal(res.out, 'loss'); assert.ok(res.ko && res.ko.t > 0); assert.ok(res.hp[0] <= 0);
  assert.equal(res.ko.x, Math.round(sim.player.rigidBody.translation().x * 100) / 100); sim.dispose();
});

test('observe(): initial state after the countdown, both fighters on the floor facing each other', async () => {
  const sim = await createSim({ seed: 1, fighter: 'kai' });
  const o = sim.observe();
  assert.equal(o.t, 0);
  assert.equal(o.me.hp, 100); assert.equal(o.rival.hp, 100);
  assert.ok(Math.abs(o.dist - 2) < 0.1, `dist ${o.dist}`);
  assert.equal(o.bucket, distBucket(o.dist));
  assert.equal(o.me.facing, 1); assert.equal(o.rival.facing, -1);
  assert.equal(o.me.state, 'IDLE'); assert.equal(o.rivalPhase, 'idle'); assert.equal(o.mePhase, 'idle');
  assert.equal(o.me.guarding, false); assert.equal(o.me.grappled, false); assert.equal(o.me.onGround, false);
  assert.equal(sim.player.name, 'KAI'); assert.equal(sim.rival.name, 'ROOK');
  sim.dispose();
  const sim2 = await createSim({ seed: 1, fighter: 'rook' });
  assert.equal(sim2.player.name, 'ROOK'); assert.equal(sim2.rival.name, 'KAI');
  sim2.dispose();
});

test('setHeld/step: keys drive the fighter, inputs are logged only when the mask changes, step() on a finished sim is a no-op', async () => {
  const sim = await createSim({ seed: 2, maxT: 2, rivalAI: false });
  const x0 = sim.player.rigidBody.translation().x;
  for (let i = 0; i < 30; i++) sim.step(BIT.KeyD);
  assert.ok(sim.player.rigidBody.translation().x > x0 + 0.5, 'holding D moves the player right');
  assert.deepEqual(sim.inputs, [[0, BIT.KeyD]]);
  sim.step(0); sim.step(0);
  assert.deepEqual(sim.inputs, [[0, BIT.KeyD], [30, 0]]);
  sim.setHeld(0);
  assert.equal(sim.inputs.length, 2, 'setting the same mask again logs nothing');
  while (!sim.done) sim.step(0);
  const tick = sim.tick, hash = sim.hash();
  assert.equal(sim.tick1(), true);
  assert.equal(sim.step(BIT.KeyA), true);
  assert.equal(sim.tick, tick); assert.equal(sim.hash(), hash);
  sim.dispose();
});

test('inputController replays a recorded round exactly (hash, events, outcome, time)', async () => {
  const persona = syntheticPersona(6), seed = 31337;
  const { res: a } = await play(persona, seed);
  const sim = await createSim({ seed, fighter: 'kai' });
  const b = await runRound(sim, inputController(a.inputs));
  sim.dispose();
  assert.equal(b.hash, a.hash); assert.deepEqual(b.ev, a.ev); assert.equal(b.out, a.out); assert.equal(b.t, a.t); assert.deepEqual(b.inputs, a.inputs);
  // and a different seed with the same inputs is a different round
  const sim2 = await createSim({ seed: seed + 1, fighter: 'kai' });
  const c = await runRound(sim2, inputController(a.inputs)); sim2.dispose();
  assert.notEqual(c.hash, a.hash);
});

test('async controllers (live LLM players) are awaited and give the same round as a sync controller', async () => {
  const persona = syntheticPersona(7), seed = 99;
  const { res: sync } = await play(persona, seed, { maxT: 8 });
  const sim = await createSim({ seed, fighter: 'rook', maxT: 8 });
  const policy = createPolicy(persona, seed);
  const res = await runRound(sim, { step: async s => { await new Promise(r => setImmediate(r)); return policy.step(s); } });
  sim.dispose();
  assert.equal(res.hash, sync.hash);
});

// ------------------------------------------------------------------ tuning
test('applyTuning: anim overrides apply, recovery rescales the clip, null/{} restore the shipped values', () => {
  const jab = ANIMATIONS.JAB, orig = { damage: jab.damage, startup: jab.startup, duration: jab.duration, kf: jab.keyframes.map(k => k.t) };
  try {
    applyTuning({ 'anim.JAB.damage': 33, 'anim.JAB.startup': 0.2, 'anim.JAB.reach': 9 });
    assert.equal(jab.damage, 33); assert.equal(jab.startup, 0.2); assert.equal(jab.reach, 9);
    applyTuning({ 'anim.JAB.recovery': orig.duration * 2 });
    assert.equal(jab.recovery, orig.duration * 2); assert.equal(jab.duration, orig.duration * 2);
    assert.equal(jab.damage, orig.damage, 'absolute overrides: keys not in the new tuning go back to default');
    jab.keyframes.forEach((k, i) => assert.ok(Math.abs(k.t - orig.kf[i] * 2) < 1e-12, 'keyframes stretch with the clip'));
    applyTuning(null);
    assert.equal(jab.damage, orig.damage); assert.equal(jab.duration, orig.duration);
    jab.keyframes.forEach((k, i) => assert.equal(k.t, orig.kf[i]));
    applyTuning({ 'anim.JAB.damage': 1 }); applyTuning({});
    assert.equal(jab.damage, orig.damage, '{} also restores');
  } finally { applyTuning(null); }
});

test('applyTuning: rules.* and rival.decisionDelayMin set RULES; unknown keys are ignored; null restores RULE_DEFAULTS', () => {
  try {
    applyTuning({ 'rules.guardDamageMultiplier': 0.9, 'rules.postureOnBlock': 40, 'rival.decisionDelayMin': 0.5, 'rules.brandNew': 7 });
    assert.equal(RULES.guardDamageMultiplier, 0.9); assert.equal(RULES.postureOnBlock, 40); assert.equal(RULES.decisionDelayMin, 0.5);
    assert.equal(RULES.brandNew, 7, 'rules.* is open-ended');
    assert.equal(RULES.postureOnHit, RULE_DEFAULTS.postureOnHit, 'untouched rules stay default');
    applyTuning({ 'anim.NOT_A_MOVE.damage': 5, 'anim.JAB.nonsense.extra': 1, 'garbage': 3, 'anim.jab.damage': 5 });
    assert.equal(RULES.guardDamageMultiplier, RULE_DEFAULTS.guardDamageMultiplier, 'second call is absolute, not cumulative');
    assert.equal(ANIMATIONS.JAB.damage, 10);
    applyTuning(null);
    for (const k of Object.keys(RULE_DEFAULTS)) assert.equal(RULES[k], RULE_DEFAULTS[k], k);
  } finally { applyTuning(null); delete RULES.brandNew; }
  assert.equal(RULE_DEFAULTS.mountReleaseFix, 1);
  assert.ok(Object.isFrozen(RULE_DEFAULTS));
});

test('createSim applies opts.tuning, a later sim without tuning is back to defaults, dispose() restores', async () => {
  let sim = await createSim({ seed: 1, maxT: 1, tuning: { 'anim.JAB.damage': 25, 'rules.guardDamageMultiplier': 0.77 } });
  assert.equal(ANIMATIONS.JAB.damage, 25); assert.equal(RULES.guardDamageMultiplier, 0.77);
  sim.dispose();
  assert.equal(ANIMATIONS.JAB.damage, 10); assert.equal(RULES.guardDamageMultiplier, RULE_DEFAULTS.guardDamageMultiplier);
  sim = await createSim({ seed: 1, maxT: 1, tuning: { 'rules.postureOnHit': 99 } });
  sim = await createSim({ seed: 1, maxT: 1 }); // previous sim not disposed on purpose
  assert.equal(RULES.postureOnHit, RULE_DEFAULTS.postureOnHit, 'tuning never leaks into the next sim');
  sim.dispose();
});

test('tuning changes the round: more JAB damage / stronger guard give different hashes, identical tuning does not', async () => {
  const persona = syntheticPersona(10), seed = 2024;
  const base = (await play(persona, seed)).res;
  const same = (await play(persona, seed, { tuning: {} })).res;
  const sameNull = (await play(persona, seed, { tuning: null })).res;
  assert.equal(same.hash, base.hash); assert.equal(sameNull.hash, base.hash);
  const jab = (await play(persona, seed, { tuning: { 'anim.JAB.damage': 40, 'anim.CROSS.damage': 40 } })).res;
  assert.notEqual(jab.hash, base.hash);
  const guard = (await play(persona, seed, { tuning: { 'rules.guardDamageMultiplier': 1 } })).res;
  assert.notEqual(guard.hash, base.hash);
  const noop = (await play(persona, seed, { tuning: { 'rules.notARule': 5 } })).res;
  assert.equal(noop.hash, base.hash, 'an unused rule key does not touch the simulation');
});

// ------------------------------------------------------------------ rules.mountReleaseFix
test('rules.mountReleaseFix: 0 (original) and 1 (default) change mount-release outcomes', async () => {
  // Seeds found by sweep: both rounds contain mounts and diverge after the first release.
  for (const [i, seed, fighter] of [[0, 500, 'kai'], [23, 799, 'rook']]) {
    const persona = syntheticPersona(i);
    const dflt = (await play(persona, seed, { fighter })).res;
    const on = (await play(persona, seed, { fighter, tuning: { 'rules.mountReleaseFix': 1 } })).res;
    const off = (await play(persona, seed, { fighter, tuning: { 'rules.mountReleaseFix': 0 } })).res;
    assert.ok(dflt.ev.some(e => e[1] === 'mount'), `${persona.id} has a mount`);
    assert.equal(on.hash, dflt.hash, 'fix is on by default');
    assert.notEqual(off.hash, on.hash, `${persona.id}: fix=0 diverges`);
    assert.notDeepEqual([off.out, off.t, off.hp], [on.out, on.t, on.hp], `${persona.id}: visible outcome differs`);
    const again = (await play(persona, seed, { fighter, tuning: { 'rules.mountReleaseFix': 0 } })).res;
    assert.equal(again.hash, off.hash, 'fix=0 is itself deterministic');
  }
});

test('rules.mountReleaseFix is inert in a round with no mount', async () => {
  const persona = syntheticPersona(8), seed = 604;
  const on = (await play(persona, seed, { tuning: { 'rules.mountReleaseFix': 1 } })).res, off = (await play(persona, seed, { tuning: { 'rules.mountReleaseFix': 0 } })).res;
  assert.ok(!on.ev.some(e => e[1] === 'mount'));
  assert.equal(on.hash, off.hash);
});
