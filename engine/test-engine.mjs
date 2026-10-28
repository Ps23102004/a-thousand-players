// Determinism + throughput check.  node engine/test-engine.mjs [rounds=16]
import { createSim, runRound } from './sim.mjs';
import { createPolicy, syntheticPersona } from './policy.mjs';

const N = +process.argv[2] || 16;
async function play(i, seed, tuning = null) {
  const persona = syntheticPersona(i), sim = await createSim({ seed, tuning, fighter: i % 2 ? 'rook' : 'kai', trace: true });
  const res = await runRound(sim, createPolicy(persona, seed));
  sim.dispose();
  return { persona, res };
}

let bad = 0, ticks = 0; const t0 = performance.now(), outs = { win: 0, loss: 0, draw: 0 }, evc = {};
for (let i = 0; i < N; i++) {
  const seed = 8000 + i * 7919;
  const a = await play(i, seed), b = await play(i, seed);
  const same = a.res.hash === b.res.hash && JSON.stringify(a.res.ev) === JSON.stringify(b.res.ev);
  if (!same) { bad++; console.log('MISMATCH', a.persona.id, seed, a.res.hash, b.res.hash); }
  ticks += a.res.t * 60 * 2; outs[a.res.out]++;
  for (const e of a.res.ev) evc[e[1]] = (evc[e[1]] || 0) + 1;
  console.log(a.persona.id, a.persona.archetype.padEnd(11), a.res.out.padEnd(5), 't=' + String(a.res.t).padStart(5), 'hp', a.res.hp.join('/'), 'combo', a.res.maxCombo, a.res.hash, same ? 'ok' : 'DIFF');
}
const sec = (performance.now() - t0) / 1000;
console.log(`\n${N} seeds x2 runs, mismatches=${bad}, ${(2 * N / sec).toFixed(1)} rounds/s, ${(ticks / sec / 1000).toFixed(0)}k ticks/s`);
console.log('outcomes', outs, 'events', evc);
process.exit(bad ? 1 : 0);
