// node --import tsx --test adapters/clean-getaway/clean-getaway.test.mjs   (needs ~/Developer/clean-getaway)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim, runRound, inputController } from './sim.mjs';
import { createPolicy, createFuzzer } from './policy.mjs';
import { loadPersonas } from '../lib/common.mjs';

test('same seed + same persona twice gives the same hash; replaying recorded inputs matches too', () => {
  const p = loadPersonas(4)[3];
  const a = runRound(createSim({ seed: 9 }), createPolicy(p, 9));
  const b = runRound(createSim({ seed: 9 }), createPolicy(p, 9));
  const c = runRound(createSim({ seed: 9 }), inputController(a.inputs));
  assert.equal(a.out, 'closed');
  assert.equal(a.hash, b.hash);
  assert.equal(a.hash, c.hash);
  assert.deepEqual(a.ev, c.ev);
});

test('player ids are seeded, so two sims with one seed deal the same seat', () => {
  assert.equal(createSim({ seed: 77 }).seat, createSim({ seed: 77 }).seat);
  assert.equal(createSim({ seed: 77 }).playerId, createSim({ seed: 77 }).playerId);
});

test('fuzzer rounds are deterministic', () => {
  const a = runRound(createSim({ seed: 4 }), createFuzzer(4));
  assert.equal(a.hash, runRound(createSim({ seed: 4 }), inputController(a.inputs)).hash);
});

test('constructed bad states trip the invariants', () => {
  const s = createSim({ seed: 2 });
  while (!s.state().actors.length) s.step(null); // into the crime phase, where actors exist
  const st = s.state();
  st.actors[0].zone = 'the-moon';
  st.players[1].score = NaN;
  for (let i = 0; i < 4; i++) s.step(null);
  const kinds = new Set(s.events.map(e => e[1]));
  assert.ok(kinds.has('oob'), JSON.stringify(s.events));
  assert.ok(kinds.has('nan'), JSON.stringify(s.events));
});

test('a rejected action (RuleError) is counted, not reported as a crash', () => {
  const s = createSim({ seed: 3 });
  s.step({ kind: 'verdict', guilty: true }); // wrong phase
  assert.ok(Object.values(s.rejected).reduce((a, b) => a + b, 0) >= 1);
  assert.ok(!s.events.some(e => e[1] === 'crash'));
});
