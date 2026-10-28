// Play ONE recorded round in a fresh process (a crash poisons the WASM instance) and report its bug events.
//   node engine/check-round.mjs '{"p":"p0653","round":2,"seed":529060,"label":"base"}' data/run-main
import { readFileSync } from 'node:fs';
import { createSim, runRound } from './sim.mjs';
import { createPolicy } from './policy.mjs';
import { fighterFor } from './crowd-worker-lib.mjs';

const BUG = ['crash', 'stuck', 'oob', 'nan', 'clip', 'airborne', 'softlock'];
const r = JSON.parse(process.argv[2]), dir = process.argv[3] || 'data/run-main';
const persona = JSON.parse(readFileSync(`${dir}/personas.json`, 'utf8')).find(p => p.id === r.p);
const tuning = r.label && r.label !== 'base' ? JSON.parse(readFileSync(`data/patches/${r.label}.json`, 'utf8')) : null;
const sim = await createSim({ seed: r.seed, fighter: fighterFor(r.p), tuning });
const res = await runRound(sim, createPolicy(persona, r.seed));
console.log(JSON.stringify({ ...r, out: res.out, t: res.t, hp: res.hp, bugs: [...new Set(res.ev.filter(e => BUG.includes(e[1])).map(e => e[1]))], crash: sim.crashed || null }));
