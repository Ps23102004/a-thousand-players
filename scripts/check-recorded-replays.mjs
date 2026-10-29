// Replays a sample of recorded rounds (all bug rounds, the sweep-nerf crash rounds, every 90th base round) with the recorded-build
// rules from data/run-main/meta.json and checks events, outcome and time match the recording exactly. Usage: node scripts/check-recorded-replays.mjs
import { readFileSync } from 'node:fs';
import { createSim, runRound } from '../engine/sim.mjs';
import { createPolicy } from '../engine/policy.mjs';
import { fighterFor } from '../engine/crowd-worker-lib.mjs';
const personas = new Map(JSON.parse(readFileSync('data/run-main/personas.json','utf8')).map(p=>[p.id,p]));
const meta = JSON.parse(readFileSync('data/run-main/meta.json','utf8')).recordedWith;
const nerf = JSON.parse(readFileSync('data/patches/sweep-nerf.json','utf8'));
const runs = readFileSync('data/run-main/runs.jsonl','utf8').trim().split('\n').map(l=>JSON.parse(l)).filter(r=>r.p&&r.ev&&r.tuning==='base');
const nerfRuns = readFileSync('data/run-main/runs-sweep-nerf.jsonl','utf8').trim().split('\n').map(l=>JSON.parse(l)).filter(r=>r.p&&r.ev);
const pick = [...nerfRuns.filter(r=>r.ev.some(e=>e[1]==='crash')).map(r=>({...r,nerf:1})),...runs.filter(r=>r.ev.some(e=>['airborne','oob','stuck','softlock'].includes(e[1]))), ...runs.filter((_,i)=>i%90===0)];
let same0 = 0, same1 = 0;
for (const r of pick) {
  for (const [flag, tag] of [[0,'legacy'],[1,'fixed']]) {
    const tun = flag === 0 ? { ...meta, ...(r.nerf ? nerf : {}) } : { ...(r.nerf ? nerf : {}) };
    const sim = await createSim({ seed: r.seed, fighter: fighterFor(r.p), tuning: tun });
    const res = await runRound(sim, createPolicy(personas.get(r.p), r.seed));
    const same = JSON.stringify(res.ev) === JSON.stringify(r.ev) && res.out === r.out && res.t === r.t;
    if (flag === 0 && same) same0++; if (flag === 1 && same) same1++;
    if (flag === 0 && !same) console.log('legacy mismatch', r.p, r.round, r.seed, res.out, r.out, res.t, r.t);
    try { sim.dispose(); } catch {}
  }
}
console.log('rounds', pick.length, 'legacy identical to recorded', same0, 'fixed identical', same1);
