// Soak: many back-to-back rounds in ONE process (policy players, fuzzed input, extreme tunings mixed) must not leak
// state into later rounds (a canary round replays to the same hash at the start and the end) and must not grow
// memory without bound. Small by default; the bug hunt ran HUNT_SOAK_ROUNDS=200 HUNT_SOAK_MAXT=99.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSim, runRound } from '../sim.mjs';
import { createPolicy, syntheticPersona } from '../policy.mjs';
import { fuzzController, FUZZ_MODES } from './hunt-lib.mjs';
import { ROOT } from './helpers.mjs';

const N = +(process.env.HUNT_SOAK_ROUNDS || 12), maxT = +(process.env.HUNT_SOAK_MAXT || 20);
const base = JSON.parse(readFileSync(`${ROOT}/data/baseline-tuning.json`, 'utf8'));
const extreme = [null, Object.fromEntries(base.map(t => [t.key, t.max])), Object.fromEntries(base.map(t => [t.key, t.min]))];
const modes = Object.keys(FUZZ_MODES);

async function round(i) {
  const seed = 300000 + i * 7919, persona = syntheticPersona(i % 1000), tuning = extreme[i % extreme.length];
  const ctrl = i % 2 ? fuzzController(modes[i % modes.length], seed) : createPolicy(persona, seed);
  const sim = await createSim({ seed, tuning, fighter: i % 3 ? 'kai' : 'rook', maxT });
  const res = await runRound(sim, ctrl);
  assert.equal(sim.crashed, undefined, `round ${i} crashed: ${sim.crashed}`);
  sim.dispose();
  return res;
}
async function canary() {
  const sim = await createSim({ seed: 424242, fighter: 'kai', maxT });
  const res = await runRound(sim, createPolicy(syntheticPersona(5), 424242)); sim.dispose();
  return res.hash;
}

test(`soak: ${N} mixed rounds in one process, no state leak, bounded memory`, async () => {
  const first = await canary();
  globalThis.gc?.(); const m0 = process.memoryUsage();
  const samples = [];
  for (let i = 0; i < N; i++) {
    await round(i);
    if (i % 25 === 24) { globalThis.gc?.(); const m = process.memoryUsage(); samples.push({ i: i + 1, rssMB: +(m.rss / 2 ** 20).toFixed(1), heapMB: +(m.heapUsed / 2 ** 20).toFixed(1), extMB: +((m.external + m.arrayBuffers) / 2 ** 20).toFixed(1) }); }
  }
  globalThis.gc?.(); const m1 = process.memoryUsage();
  if (process.env.HUNT_SOAK_LOG) console.log(JSON.stringify({ m0: m0.rss / 2 ** 20, m1: m1.rss / 2 ** 20, samples }));
  assert.equal(await canary(), first, 'a later round replays differently after the soak: state leaks between rounds');
  assert.ok(m1.heapUsed - m0.heapUsed < 64 * 2 ** 20, `heap grew ${((m1.heapUsed - m0.heapUsed) / 2 ** 20).toFixed(1)} MB`);
});
