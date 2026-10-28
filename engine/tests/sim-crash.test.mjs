// runRound() must turn a game exception into sim.crashed + a 'crash' event instead of throwing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, runRound } from '../sim.mjs';
import { createPolicy } from '../policy.mjs';
import { CRASH_CASE } from './helpers.mjs';

async function crashWith(step, opts = {}) {
  const sim = await createSim({ seed: 1, maxT: 5, ...opts });
  const res = await runRound(sim, { step });
  return { sim, res };
}

test('a controller that throws is caught: crashed message, crash event, draw, round over', async () => {
  const { sim, res } = await crashWith(s => { if (s.tick === 5) throw new Error('boom'); return 0; });
  assert.equal(sim.crashed, 'Error: boom');
  assert.equal(sim.done, true);
  assert.equal(res.out, 'draw');
  assert.equal(res.t, 0.08);
  const last = res.ev.at(-1);
  assert.deepEqual(last, [0.08, 'crash', 0, 'Error: boom']);
});

test('error name is kept, the message is cut to 40 chars, non-Error throws are stringified', async () => {
  let r = await crashWith(() => { throw new RangeError('x'.repeat(100)); });
  assert.equal(r.sim.crashed, `RangeError: ${'x'.repeat(40)}`);
  r = await crashWith(() => { throw 'plain string'; });
  assert.equal(r.sim.crashed, 'Error: plain string');
  r = await crashWith(() => { throw null; });
  assert.equal(r.sim.crashed, 'Error: null');
});

test('an async controller that rejects is caught too', async () => {
  const { sim, res } = await crashWith(async () => { await null; throw new TypeError('late'); });
  assert.equal(sim.crashed, 'TypeError: late');
  assert.equal(res.out, 'draw');
});

test('an exception inside game code is attributed to its function and game/src file:line', async () => {
  const { sim, res } = await crashWith(s => { if (s.tick === 5) s.player.rigidBody = null; return 0; });
  assert.match(sim.crashed, /^TypeError: /);
  assert.match(sim.crashed, / in \w+ \([\w.]+\.js:\d+\)$/, sim.crashed);
  assert.equal(res.ev.at(-1)[1], 'crash');
  assert.equal(res.ev.at(-1)[3], sim.crashed);
});

test('the crash event is time-stamped, carries who=0, and does not clear earlier events', async () => {
  const { res } = await crashWith(s => { if (s.tick === 30) s.rival.rigidBody.setTranslation({ x: 12, y: 0.5, z: 0 }, true); if (s.tick === 50) throw new Error('later'); return 0; }, { rivalAI: false });
  assert.deepEqual(res.ev.map(e => e[1]), ['oob', 'crash']);
  assert.ok(res.ev[1][0] > res.ev[0][0]);
});

test('a healthy round leaves sim.crashed undefined', async () => {
  const sim = await createSim({ seed: 1, maxT: 2, rivalAI: false });
  await runRound(sim, { step: () => 0 });
  assert.equal(sim.crashed, undefined);
  sim.dispose();
});

test('regression: throwing a carried crate that already shattered no longer traps Rapier (p0047, seed 596926)', async () => {
  const sim = await createSim({ seed: CRASH_CASE.seed, fighter: 'kai' });
  let threwBroken = false;
  const policy = createPolicy(CRASH_CASE.persona, CRASH_CASE.seed);
  const res = await runRound(sim, { step: s => { if (s.player.carriedProp?.isBroken) threwBroken = true; return policy.step(s); } });
  assert.ok(threwBroken, 'precondition: the player really carried a shattered crate in this round');
  assert.equal(sim.crashed, undefined);
  assert.ok(!res.ev.some(e => e[1] === 'crash'));
  assert.ok(res.t > 19.72, `round runs past the old crash time (${res.t})`);
  sim.dispose();
});
