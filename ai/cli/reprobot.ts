// Offline orchestration; only the default Nano mode contacts a model. Never loads environment files.
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createSim } from '../../engine/sim.mjs';
import { runExperiment, type ReproResults, type Sim } from '../reprobot';
import { chooseAction, spotlightStats } from '../spotlight';
import sample from '../../data/samples/repro.json';
import type { Oracle } from '../../lib/types';

const { values } = parseArgs({ options: { 'results-from': { type: 'string' }, 'fake-model': { type: 'boolean' }, 'dry-run': { type: 'boolean' }, 'max-calls': { type: 'string', default: '40' }, out: { type: 'string', default: 'data/reprobot/results.json' } } });
const cap = Number(values['max-calls']);
if (!Number.isInteger(cap) || cap < 0 || cap > 40) throw new Error('--max-calls must be an integer from 0 to 40');
if (values['results-from'] && values['fake-model']) throw new Error('Choose either --results-from or --fake-model');
const recorded = new Set<number>();
for (const path of ['data/run-main/runs.jsonl', 'data/run-main/runs-sweep-nerf.jsonl']) {
  for (const line of readFileSync(path, 'utf8').split('\n')) if (line.trim()) { const row = JSON.parse(line); if (Number.isInteger(row.seed)) recorded.add(row.seed); }
}
const seeds: number[] = [];
for (let candidate = 2_000_000; seeds.length < 20; candidate++) if (!recorded.has(candidate)) seeds.push(candidate);
if (values['dry-run']) {
  console.log(JSON.stringify({ mode: values['results-from'] ? 'import' : values['fake-model'] ? 'fake' : 'nano', seeds, maxCalls: cap, output: values.out }, null, 2));
} else {
  let result: ReproResults;
  if (values['results-from']) {
    result = JSON.parse(readFileSync(values['results-from'], 'utf8')) as ReproResults;
    if (result.placeholder || !['nano', 'fake'].includes(result.model) || result.requestedRounds !== 20 || !Array.isArray(result.rounds) || result.rounds.length > 20 || !result.totals || !Number.isInteger(result.maxCalls) || result.maxCalls < 0 || result.maxCalls > 40 || result.rounds.some(r => !Number.isInteger(r.seed) || recorded.has(r.seed) || typeof r.matched !== 'boolean' || typeof r.completed !== 'boolean' || ![r.nanoCalls, r.cacheHits, r.fallbacks].every(n => Number.isInteger(n) && n >= 0) || r.fallbacks > r.nanoCalls || (r.matched ? !Number.isFinite(r.tFirstMatch) : r.tFirstMatch !== null)) || new Set(result.rounds.map(r => r.seed)).size !== result.rounds.length || result.reproduced !== result.rounds.filter(r => r.matched).length || (['nanoCalls', 'cacheHits', 'fallbacks'] as const).some(k => result.totals[k] !== result.rounds.reduce((n, r) => n + r[k], 0)) || result.totals.nanoCalls > result.maxCalls || typeof result.budgetHit !== 'boolean') throw new Error('Invalid or inconsistent fresh-play results');
  } else {
    result = await runExperiment({ seeds, oracle: sample.response.oracle as Oracle, maxCalls: cap, model: values['fake-model'] ? 'fake' : 'nano', createSim: async seed => await createSim({ seed }) as unknown as Sim, choose: values['fake-model'] ? async () => ({ action: 'advance', fallback: false }) : async obs => {
      const before = spotlightStats.fallbacks;
      const action = await chooseAction(obs);
      return { action, fallback: spotlightStats.fallbacks > before };
    } });
  }
  const tmp = `${values.out}.tmp`;
  writeFileSync(tmp, JSON.stringify(result, null, 2) + '\n');
  renameSync(tmp, values.out);
  console.log(`Wrote ${values.out}: ${result.reproduced}/${result.requestedRounds} reproduced, ${result.rounds.length} started, ${result.totals.nanoCalls} calls, ${result.totals.fallbacks} fallbacks${result.budgetHit ? ', budget hit' : ''}.`);
}
