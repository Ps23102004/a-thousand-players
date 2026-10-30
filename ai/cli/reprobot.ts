// Offline orchestration; only the default Nano mode contacts a model. Never loads environment files.
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createSim } from '../../engine/sim.mjs';
import { runReproExperiment, getFreshSeeds, COMMON_ORACLE, RARE_ORACLE, type ReproResults, type Sim } from '../reprobot';
import { createLocalChooser } from '../localplayer';
import { chooseAction, spotlightStats } from '../spotlight';
import { NANO } from '../models';
import type { Action, Observation, Oracle } from '../../lib/types';

const { values } = parseArgs({
  options: {
    chooser: { type: 'string', default: 'fake' },
    build: { type: 'string', default: 'both' },
    rounds: { type: 'string', default: '20' },
    report: { type: 'string', default: 'rare' },
    'max-seconds': { type: 'string', default: '900' },
    'max-calls': { type: 'string' },
    'results-from': { type: 'string' },
    'fake-model': { type: 'boolean' },
    'dry-run': { type: 'boolean' },
    out: { type: 'string' }
  }
});

let chooser = values.chooser ?? 'fake';
if (values['fake-model']) chooser = 'fake';
if (!['nano', 'local', 'fake'].includes(chooser)) {
  throw new Error('--chooser must be nano, local, or fake');
}

const reportType = values.report ?? 'rare';
if (!['rare', 'common'].includes(reportType)) {
  throw new Error('--report must be rare or common');
}

const outPath = values.out ?? (reportType === 'common' ? 'data/reprobot/results-common.json' : 'data/reprobot/results.json');
const oracle: Oracle = reportType === 'common' ? COMMON_ORACLE : RARE_ORACLE;

const buildMode = values.build ?? 'both';
if (!['recorded', 'shipped', 'both'].includes(buildMode)) {
  throw new Error('--build must be recorded, shipped, or both');
}

const roundCount = Number(values.rounds ?? '20');
if (!Number.isInteger(roundCount) || roundCount <= 0 || roundCount > 100) {
  throw new Error('--rounds must be an integer from 1 to 100');
}

const maxSeconds = Number(values['max-seconds'] ?? '900');
if (!Number.isFinite(maxSeconds) || maxSeconds <= 0) {
  throw new Error('--max-seconds must be a positive number');
}

const cap = values['max-calls'] !== undefined ? Number(values['max-calls']) : (chooser === 'nano' ? 40 : undefined);
if (cap !== undefined && (!Number.isInteger(cap) || cap < 0)) {
  throw new Error('--max-calls must be a non-negative integer');
}

if (values['results-from'] && (values['fake-model'] || values.chooser !== 'fake')) {
  throw new Error('Choose either --results-from or model execution flags');
}

const recorded = new Set<number>();
for (const path of ['data/run-main/runs.jsonl', 'data/run-main/runs-sweep-nerf.jsonl']) {
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.trim()) {
      const row = JSON.parse(line);
      if (Number.isInteger(row.seed)) recorded.add(row.seed);
    }
  }
}

const seeds = getFreshSeeds(roundCount);

let modelName = chooser;
let choose: (obs: Observation) => Promise<{ action: Action; fallback: boolean }>;

if (chooser === 'local') {
  const localChooser = createLocalChooser();
  modelName = localChooser.model;
  choose = localChooser.choose;
} else if (chooser === 'nano') {
  modelName = NANO;
  choose = async obs => {
    const before = spotlightStats.fallbacks;
    const action = await chooseAction(obs);
    return { action, fallback: spotlightStats.fallbacks > before };
  };
} else {
  modelName = 'fake';
  choose = async () => ({ action: 'advance' as Action, fallback: false });
}

if (values['dry-run']) {
  console.log(JSON.stringify({
    chooser,
    model: modelName,
    build: buildMode,
    rounds: roundCount,
    report: reportType,
    oracle: oracle.description,
    seeds,
    maxSeconds,
    maxCalls: cap ?? null,
    output: outPath
  }, null, 2));
} else {
  let result: ReproResults;
  if (values['results-from']) {
    result = JSON.parse(readFileSync(values['results-from'], 'utf8')) as ReproResults;
    if (result.placeholder) throw new Error('Invalid or inconsistent fresh-play results');
    if (result.report && !['rare', 'common'].includes(result.report)) {
      throw new Error('Invalid or inconsistent fresh-play results');
    }

    if ('arms' in result && Array.isArray(result.arms)) {
      if (result.arms.length === 0) throw new Error('Invalid or inconsistent fresh-play results');
      for (const arm of result.arms) {
        if (!arm.build || !Array.isArray(arm.rounds)) throw new Error('Invalid or inconsistent fresh-play results');
        for (const r of arm.rounds) {
          if (!Number.isInteger(r.seed) || recorded.has(r.seed) || typeof r.matched !== 'boolean' || typeof r.completed !== 'boolean' || (r.matched && !r.completed)) {
            throw new Error('Invalid or inconsistent fresh-play results');
          }
          const calls = r.calls ?? r.nanoCalls;
          if (![calls, r.cacheHits, r.fallbacks].every(n => Number.isInteger(n) && n >= 0) || r.fallbacks > calls) {
            throw new Error('Invalid or inconsistent fresh-play results');
          }
          if (r.matched ? !Number.isFinite(r.tFirstMatch) : r.tFirstMatch !== null) {
            throw new Error('Invalid or inconsistent fresh-play results');
          }
        }
        if (new Set(arm.rounds.map(r => r.seed)).size !== arm.rounds.length) {
          throw new Error('Invalid or inconsistent fresh-play results');
        }
        if (arm.reproduced !== arm.rounds.filter(r => r.completed && r.matched).length) {
          throw new Error('Invalid or inconsistent fresh-play results');
        }
      }
    } else if ('rounds' in result && Array.isArray((result as any).rounds)) {
      const old = result as any;
      if (!['nano', 'fake'].includes(old.model) || old.requestedRounds !== 20 || old.rounds.length > 20 || !old.totals || !Number.isInteger(old.maxCalls) || old.maxCalls < 0 || old.maxCalls > 40) {
        throw new Error('Invalid or inconsistent fresh-play results');
      }
      for (const r of old.rounds) {
        if (!Number.isInteger(r.seed) || recorded.has(r.seed) || typeof r.matched !== 'boolean' || typeof r.completed !== 'boolean' || (r.matched && !r.completed)) {
          throw new Error('Invalid or inconsistent fresh-play results');
        }
        const calls = r.calls ?? r.nanoCalls;
        if (![calls, r.cacheHits, r.fallbacks].every((n: number) => Number.isInteger(n) && n >= 0) || r.fallbacks > calls) {
          throw new Error('Invalid or inconsistent fresh-play results');
        }
        if (r.matched ? !Number.isFinite(r.tFirstMatch) : r.tFirstMatch !== null) {
          throw new Error('Invalid or inconsistent fresh-play results');
        }
      }
      if (new Set(old.rounds.map((r: any) => r.seed)).size !== old.rounds.length) {
        throw new Error('Invalid or inconsistent fresh-play results');
      }
      if (old.reproduced !== old.rounds.filter((r: any) => r.completed && r.matched).length) {
        throw new Error('Invalid or inconsistent fresh-play results');
      }
      if ((['nanoCalls', 'cacheHits', 'fallbacks'] as const).some(k => old.totals[k] !== old.rounds.reduce((n: number, r: any) => n + r[k], 0))) {
        throw new Error('Invalid or inconsistent fresh-play results');
      }
      if (old.totals.nanoCalls > old.maxCalls || typeof old.budgetHit !== 'boolean') {
        throw new Error('Invalid or inconsistent fresh-play results');
      }
    } else {
      throw new Error('Invalid or inconsistent fresh-play results');
    }
  } else {
    const meta = JSON.parse(readFileSync('data/run-main/meta.json', 'utf8'));
    const recordedTuning = meta.recordedWith ?? {};
    const shippedTuning = {};

    result = await runReproExperiment({
      seeds,
      oracle,
      report: reportType as 'rare' | 'common',
      build: buildMode as 'recorded' | 'shipped' | 'both',
      chooser: chooser as 'nano' | 'local' | 'fake',
      model: modelName,
      maxSeconds,
      maxCalls: cap,
      recordedTuning,
      shippedTuning,
      createSim: async (seed, tuning) => await createSim({ seed, tuning }) as unknown as Sim,
      choose
    });
  }

  const tmp = `${outPath}.tmp`;
  writeFileSync(tmp, JSON.stringify(result, null, 2) + '\n');
  renameSync(tmp, outPath);

  if ('arms' in result && Array.isArray(result.arms)) {
    const summary = result.arms.map(a => `${a.build}: ${a.reproduced}/${a.completed} reproduced, ${a.calls} calls, ${a.fallbacks} fallbacks`).join(' | ');
    console.log(`Wrote ${outPath}: [${summary}]${result.aborted ? ` (aborted: ${result.abortReason})` : ''}.`);
  } else if ('rounds' in result && (result as any).totals) {
    const old = result as any;
    console.log(`Wrote ${outPath}: ${old.reproduced}/${old.requestedRounds} reproduced, ${old.rounds.length} started, ${old.totals.nanoCalls} calls, ${old.totals.fallbacks} fallbacks${old.budgetHit ? ', budget hit' : ''}.`);
  }
}
