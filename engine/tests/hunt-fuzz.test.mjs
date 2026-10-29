// Property test: input fuzzing (random masks every tick, mashing, holding every key) never crashes the game, never
// produces NaN and never lets a fighter or crate leave the arena. Small by default so `npm test` stays fast; the bug
// hunt ran it with HUNT_FUZZ_ROUNDS=500 HUNT_FUZZ_MAXT=99 (sharded with HUNT_FUZZ_FROM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { FUZZ_MODES, fuzzController, checkedRound } from './hunt-lib.mjs';

const N = +(process.env.HUNT_FUZZ_ROUNDS || 10), FROM = +(process.env.HUNT_FUZZ_FROM || 0), maxT = +(process.env.HUNT_FUZZ_MAXT || 20);
const modes = Object.keys(FUZZ_MODES);

test(`fuzzed input: ${N} rounds x ${maxT}s, no crash / NaN / escape`, async () => {
  const rows = [];
  for (let i = FROM; i < FROM + N; i++) {
    const mode = modes[i % modes.length], seed = 7000 + i, fighter = i % 2 ? 'rook' : 'kai';
    const { res, sim, bad } = await checkedRound(fuzzController(mode, seed), { seed, fighter, maxT });
    const bugEv = res.ev.filter(e => ['crash', 'nan', 'oob', 'stuck', 'airborne', 'clip', 'softlock'].includes(e[1]));
    rows.push({ i, mode, seed, fighter, out: res.out, t: res.t, hash: res.hash, crashed: sim.crashed || null, bad, bugEv });
    if (sim.crashed) break; // the WASM instance is poisoned; report what we have
  }
  if (process.env.HUNT_OUT) writeFileSync(process.env.HUNT_OUT, JSON.stringify(rows, null, 1));
  const failures = rows.filter(r => r.crashed || r.bad.length || r.bugEv.some(e => ['crash', 'nan', 'oob'].includes(e[1])));
  assert.deepEqual(failures.map(r => ({ mode: r.mode, seed: r.seed, fighter: r.fighter, crashed: r.crashed, bad: r.bad })), []);
});
