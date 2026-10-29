// Random-input baseline (roast fix 14): how many rounds per 1,000 show a bug event when the "player" ignores the game
// entirely, to compare with the persona crowd's rate. Fuzzers are the ones in engine/tests/hunt-lib.mjs.
//   node engine/fuzz-baseline.mjs [--rounds 2000] [--modes random,taps,mash] [--seed 60000] [--tuning t.json]
import { readFileSync } from 'node:fs';
import { createSim, runRound } from './sim.mjs';
import { fuzzController } from './tests/hunt-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const n = +arg('rounds', '2000'), base = +arg('seed', '60000'), tuning = arg('tuning') ? JSON.parse(readFileSync(arg('tuning'), 'utf8')) : null;
const BUG = ['crash', 'stuck', 'oob', 'nan', 'clip', 'airborne', 'softlock'];
for (const mode of arg('modes', 'random,taps,mash').split(',')) {
  const sigs = {}; let bugRounds = 0, wins = 0;
  for (let i = 0; i < n; i++) {
    const seed = base + i, sim = await createSim({ seed, fighter: i % 2 ? 'rook' : 'kai', tuning });
    const res = await runRound(sim, fuzzController(mode, seed));
    if (sim.crashed) { console.error(`crash in ${mode} seed ${seed}: ${sim.crashed}`); process.exit(1); } // a crash poisons the WASM instance
    sim.dispose();
    const kinds = [...new Set(res.ev.filter(e => BUG.includes(e[1])).map(e => e[1]))];
    if (kinds.length) { bugRounds++; sigs[kinds.join('+')] = (sigs[kinds.join('+')] || 0) + 1; }
    wins += res.out === 'win';
  }
  console.log(JSON.stringify({ mode, rounds: n, bugRounds, per1000: +(bugRounds * 1000 / n).toFixed(1), winRate: +(wins / n).toFixed(3), signatures: sigs }));
}
