// Determinism across processes: the same seeds played in 4 separate Node processes (two of them in reverse order,
// so any state carried between rounds would show) give identical hashes. Small by default; the bug hunt ran
// HUNT_DET_SEEDS=50 HUNT_DET_MAXT=99. Run as a child with --hashes to print one process's hashes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, runRound } from '../sim.mjs';
import { createPolicy, syntheticPersona } from '../policy.mjs';
import { fighterFor, roundSeed } from '../crowd-worker-lib.mjs';
import { node } from './helpers.mjs';

const N = +(process.env.HUNT_DET_SEEDS || 6), maxT = +(process.env.HUNT_DET_MAXT || 15);
/** The determinism set: synthetic persona i, round 1 under base seed 2027 (not a seed the first crowd run used). */
export const cases = n => Array.from({ length: n }, (_, i) => ({ persona: syntheticPersona(i * 19 + 3), seed: roundSeed('p' + String(i * 19 + 3).padStart(4, '0'), 1, 2027) }));

async function hashes(order) {
  const out = {};
  for (const c of order) {
    const sim = await createSim({ seed: c.seed, fighter: fighterFor(c.persona.id), maxT });
    const res = await runRound(sim, createPolicy(c.persona, c.seed)); if (!sim.crashed) sim.dispose();
    out[c.seed] = res.hash;
  }
  return out;
}

if (process.argv.includes('--hashes')) {
  const cs = cases(N); if (process.argv.includes('--reverse')) cs.reverse();
  console.log(JSON.stringify(await hashes(cs)));
} else {
  test(`${N} seeds hash the same in 4 separate processes (2 in reverse order)`, () => {
    const file = new URL(import.meta.url).pathname;
    const runs = [[], ['--reverse'], [], ['--reverse']].map(extra => {
      const r = node([file, '--hashes', ...extra], { env: { ...process.env, HUNT_DET_SEEDS: String(N), HUNT_DET_MAXT: String(maxT) } });
      assert.equal(r.code, 0, r.stderr);
      return JSON.parse(r.stdout.trim().split('\n').pop());
    });
    assert.equal(Object.keys(runs[0]).length, N);
    for (const r of runs.slice(1)) assert.deepEqual(r, runs[0]);
  });
}
