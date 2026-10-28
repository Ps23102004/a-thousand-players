// Play a crowd of personas on Market Brawl across all CPU cores.
//   node engine/crowd.mjs --personas data/run-main/personas.json --out data/run-main [--tuning t.json --label patch] [--seed 1] [--limit 1000]
import { Worker } from 'node:worker_threads';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { cpus } from 'node:os';
import { resolve } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const personasPath = arg('personas', 'data/run-main/personas.json'), outDir = arg('out', 'data/run-main');
const label = arg('label', 'base'), baseSeed = +arg('seed', 1), limit = +arg('limit', 100000), maxRounds = +arg('rounds', 5);
const tuning = arg('tuning') ? JSON.parse(readFileSync(arg('tuning'), 'utf8')) : null;
const traceFirstRound = arg('traces', label === 'base' ? '1' : '0') === '1';

const personas = JSON.parse(readFileSync(personasPath, 'utf8')).slice(0, limit);
const nWorkers = Math.max(1, Math.min(+arg('workers', cpus().length - 1), personas.length));
const chunk = 8, queue = []; for (let i = 0; i < personas.length; i += chunk) queue.push(personas.slice(i, i + chunk));
const t0 = Date.now(); let done = 0, crashes = 0; const results = [];

await new Promise(resolveAll => {
  let active = 0;
  const spawn = () => {
    const w = new Worker(new URL('./crowd-worker.mjs', import.meta.url), { workerData: { tuning, label, baseSeed, traceFirstRound, maxRounds, noQuit: arg('noquit', '0') === '1' } });
    const next = () => {
      const job = queue.shift();
      if (!job) { w.terminate(); if (--active === 0) resolveAll(); return; }
      w.postMessage(job);
    };
    w.on('message', ({ out, rest, poisoned }) => {
      results.push(...out); done += out.length;
      process.stderr.write(`\r${done}/${personas.length} players  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      if (poisoned) { crashes++; if (rest.length) queue.unshift(rest); w.terminate(); active--; spawn(); return; }
      next();
    });
    w.on('error', e => { console.error('\nworker error', e); process.exit(1); });
    active++; next();
  };
  for (let i = 0; i < nWorkers; i++) spawn();
});

results.sort((a, b) => (a.session.p < b.session.p ? -1 : 1));
mkdirSync(outDir, { recursive: true });
const suffix = label === 'base' ? '' : '-' + label;
const runs = results.flatMap(r => r.lines);
writeFileSync(resolve(outDir, `runs${suffix}.jsonl`), runs.map(l => JSON.stringify(l)).join('\n') + '\n');
writeFileSync(resolve(outDir, `sessions${suffix}.json`), JSON.stringify(results.map(r => r.session)));
if (traceFirstRound) {
  const traces = Object.assign({}, ...results.map(r => r.traces));
  const { STATES } = await import('./sim.mjs');
  writeFileSync(resolve(outDir, 'traces.json'), JSON.stringify({ states: STATES, arenaHalfWidth: 10.5, traces }));
}
const sec = (Date.now() - t0) / 1000, wins = runs.filter(r => r.out === 'win').length;
console.error(`\n${personas.length} players, ${runs.length} rounds, ${sec.toFixed(1)}s on ${nWorkers} workers (${(runs.length / sec).toFixed(0)} rounds/s); win rate ${(100 * wins / runs.length).toFixed(1)}%; game crashes ${crashes}`);
