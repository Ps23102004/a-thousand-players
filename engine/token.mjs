// Replay link for one recorded round, stamped with the headless result so the browser can prove it matches.
//   node engine/token.mjs p0653 2 [--dir data/run-main] [--base http://localhost:5181]
import { readFileSync } from 'node:fs';
import { createSim, runRound } from './sim.mjs';
import { createPolicy } from './policy.mjs';
import { fighterFor } from './crowd-worker-lib.mjs';

const [pid, round] = process.argv.slice(2);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const dir = arg('dir', 'data/run-main'), base = arg('base', 'http://localhost:5181'), label = arg('label', 'base');
const tuning = arg('tuning') ? JSON.parse(readFileSync(arg('tuning'), 'utf8')) : null;
const persona = JSON.parse(readFileSync(`${dir}/personas.json`, 'utf8')).find(p => p.id === pid);
const line = readFileSync(`${dir}/runs${label === 'base' ? '' : '-' + label}.jsonl`, 'utf8').trim().split('\n').map(JSON.parse).find(r => r.p === pid && r.round === +round);
if (!persona || !line) { console.error('not found'); process.exit(1); }
const fighter = fighterFor(pid);
const sim = await createSim({ seed: line.seed, fighter, tuning });
const res = await runRound(sim, createPolicy(persona, line.seed)); if (!sim.crashed) sim.dispose();
const token = { seed: line.seed, tuning, fighter, maxT: 99, persona, exp: { hash: res.hash, out: res.out, t: res.t } };
if (sim.crashed) console.error('headless run crashed:', sim.crashed);
const b64 = Buffer.from(JSON.stringify(token)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
console.log(`${base}/game/replay.html?t=${b64}`);
console.error(`headless: ${res.out} at ${res.t}s hash ${res.hash} (recorded ${line.out} at ${line.t}s)`);
