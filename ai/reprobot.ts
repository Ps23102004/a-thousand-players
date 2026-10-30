import { readFileSync, existsSync } from 'node:fs';
import { matchOracle } from '../lib/oracle';
import type { Action, Observation, Oracle, RunLine } from '../lib/types';
import { obsKey } from './spotlight';
import { BIT } from '../engine/sim.mjs';
import { createPolicy } from '../engine/policy.mjs';
import sample from '../data/samples/repro.json';

export const COMMON_ORACLE: Oracle = {
  description: 'The player is knocked down at least once in the first 30 seconds.',
  combine: 'all',
  atoms: [{ event: 'knockdown', who: 0, minCount: 1, withinSeconds: [0, 30] }]
};

export const RARE_ORACLE: Oracle = sample.response.oracle as Oracle;

export type Sim = {
  tick: number;
  done: boolean;
  player?: any;
  rival?: any;
  observe(): Omit<Observation, 'persona' | 'recent'>;
  step(mask: number): unknown;
  result(): { ev: RunLine['ev']; t: number; out: RunLine['out']; ko: RunLine['ko']; hp: [number, number] };
  dispose(): void;
};

type Counts = { nanoCalls: number; cacheHits: number; fallbacks: number };

export type ReproRound = {
  seed: number;
  matched: boolean;
  tFirstMatch: number | null;
  calls?: number;
  nanoCalls: number;
  cacheHits: number;
  fallbacks: number;
  completed: boolean;
};

export interface ReproArmResult {
  build: 'recorded' | 'shipped' | 'scripted' | string;
  rounds: ReproRound[];
  reproduced: number;
  completed: number;
  calls: number;
  cacheHits: number;
  fallbacks: number;
}

export interface OldReproResults {
  placeholder: boolean;
  report?: 'rare' | 'common';
  oracle?: string | Oracle;
  oracleDescription?: string;
  model: 'nano' | 'fake';
  requestedRounds: number;
  rounds: ReproRound[];
  reproduced: number;
  totals: Counts;
  budgetHit: boolean;
  maxCalls: number;
}

export interface MultiArmReproResults {
  placeholder: boolean;
  report?: 'rare' | 'common';
  oracle?: string | Oracle;
  oracleDescription?: string;
  chooser: 'nano' | 'local' | 'fake' | string;
  model: string;
  requestedRounds: number;
  build: 'recorded' | 'shipped' | 'both' | string;
  arms: ReproArmResult[];
  rounds?: ReproRound[];
  reproduced?: number;
  totals?: { calls: number; nanoCalls?: number; cacheHits: number; fallbacks: number };
  aborted?: boolean;
  abortReason?: string | null;
  budgetHit?: boolean;
  maxCalls?: number;
  durationSeconds?: number;
  maxSeconds?: number;
}

export type ReproResults = OldReproResults | MultiArmReproResults;

const persona: Observation['persona'] = { archetype: 'casual', aggression: 0.5, skill: 0.5, bio: 'A casual player exploring the fight.' };
const controlPersona = {
  id: 'control',
  name: 'Control',
  archetype: 'casual',
  skill: 0.5,
  reaction_ticks: 20,
  patience: 0.5,
  frustration_tolerance: 0.5,
  bio: 'A casual player exploring the fight.',
  rules: []
};

const zero = (): Counts => ({ nanoCalls: 0, cacheHits: 0, fallbacks: 0 });

export function getFreshSeeds(count: number = 20, runsDir: string = 'data/run-main'): number[] {
  const recorded = new Set<number>();
  for (const filename of ['runs.jsonl', 'runs-sweep-nerf.jsonl']) {
    const p = `${runsDir}/${filename}`;
    if (existsSync(p)) {
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        if (line.trim()) {
          try {
            const row = JSON.parse(line);
            if (Number.isInteger(row.seed)) recorded.add(row.seed);
          } catch {}
        }
      }
    }
  }
  const seeds: number[] = [];
  for (let candidate = 2_000_000; seeds.length < count; candidate++) {
    if (!recorded.has(candidate)) seeds.push(candidate);
  }
  return seeds;
}

/** Drive fresh rounds sequentially; never spend a call after the cap. (Legacy single-run experiment) */
export async function runExperiment(opts: {
  seeds: number[];
  oracle: Oracle;
  maxCalls: number;
  choose: (obs: Observation) => Promise<{ action: Action; fallback: boolean }>;
  createSim: (seed: number, tuning?: Record<string, unknown>) => Promise<Sim>;
  model?: 'nano' | 'fake';
}): Promise<OldReproResults> {
  if (!Number.isInteger(opts.maxCalls) || opts.maxCalls < 0 || opts.maxCalls > 40 || opts.seeds.length > 20) {
    throw new Error('Limits: 0–40 calls and up to 20 rounds');
  }
  const cache = new Map<string, Action>(), totals = zero(), rounds: ReproRound[] = [];
  let budgetHit = false;
  for (const seed of opts.seeds) {
    const sim = await opts.createSim(seed), counts = zero(), recent: string[] = [];
    let matched = false, tFirstMatch: number | null = null, mask = 0, hold = 0, tap = 0;
    try {
      while (!sim.done) {
        if (sim.tick % 12 === 0) {
          const obs = { ...sim.observe(), persona, recent: [...recent] }, key = obsKey(obs);
          let action = cache.get(key);
          if (action) { counts.cacheHits++; totals.cacheHits++; }
          else {
            if (totals.nanoCalls >= opts.maxCalls) { budgetHit = true; break; }
            counts.nanoCalls++; totals.nanoCalls++;
            let choice: { action: Action; fallback: boolean };
            try { choice = await opts.choose(obs); } catch { choice = { action: 'wait', fallback: true }; }
            action = choice.action;
            if (choice.fallback) { counts.fallbacks++; totals.fallbacks++; } else cache.set(key, action);
          }
          recent.push(action); if (recent.length > 4) recent.shift();
          const toward = obs.me.facing > 0 ? BIT.KeyD : BIT.KeyA, away = obs.me.facing > 0 ? BIT.KeyA : BIT.KeyD;
          hold = ({ advance: toward, retreat: away, block: BIT.ShiftLeft, low_punch: BIT.KeyS, sweep: BIT.KeyS } as Partial<Record<Action, number>>)[action] || 0;
          tap = ({ punch: BIT.KeyJ, kick: BIT.KeyK, low_punch: BIT.KeyJ, sweep: BIT.KeyK, parry: BIT.KeyL, grab: BIT.KeyF, jump: BIT.KeyW, prop: BIT.KeyE } as Partial<Record<Action, number>>)[action] || 0;
        }
        mask = hold | (sim.tick % 12 < 2 ? tap : 0);
        sim.step(mask);
        const result = sim.result();
        if (matchOracle(opts.oracle, result as RunLine)) { matched = true; tFirstMatch = result.t; break; }
      }
      rounds.push({
        seed,
        matched,
        tFirstMatch,
        completed: matched || sim.done,
        calls: counts.nanoCalls,
        nanoCalls: counts.nanoCalls,
        cacheHits: counts.cacheHits,
        fallbacks: counts.fallbacks
      });
    } finally { sim.dispose(); }
    if (budgetHit) break;
  }
  return {
    placeholder: false,
    model: opts.model ?? 'nano',
    requestedRounds: opts.seeds.length,
    rounds,
    reproduced: rounds.filter(r => r.matched).length,
    totals,
    budgetHit,
    maxCalls: opts.maxCalls
  };
}

export interface RunReproExperimentOpts {
  seeds: number[];
  oracle: Oracle;
  report?: 'rare' | 'common';
  build?: 'recorded' | 'shipped' | 'both';
  chooser?: 'nano' | 'local' | 'fake';
  model?: string;
  createSim: (seed: number, tuning?: Record<string, unknown>) => Promise<Sim>;
  choose?: (obs: Observation) => Promise<{ action: Action; fallback: boolean }>;
  recordedTuning?: Record<string, unknown>;
  shippedTuning?: Record<string, unknown>;
  maxSeconds?: number;
  maxCalls?: number;
}

/** Multi-arm fresh play experiment across recorded, shipped, and scripted control arms. */
export async function runReproExperiment(opts: RunReproExperimentOpts): Promise<MultiArmReproResults> {
  const buildMode = opts.build ?? 'both';
  const chooser = opts.chooser ?? 'fake';
  const modelName = opts.model ?? (chooser === 'local' ? (process.env.REPROBOT_LOCAL_MODEL || 'gemma4:e4b-mlx') : chooser);
  const maxSeconds = opts.maxSeconds ?? 900;
  const startTime = Date.now();
  const cache = new Map<string, Action>();

  const choose = opts.choose ?? (async () => ({ action: 'advance' as Action, fallback: false }));

  const armsToRun: { name: 'recorded' | 'shipped' | 'scripted'; isModel: boolean; tuning?: Record<string, unknown> }[] = [];
  if (buildMode === 'both') {
    armsToRun.push(
      { name: 'recorded', isModel: true, tuning: opts.recordedTuning },
      { name: 'shipped', isModel: true, tuning: opts.shippedTuning ?? {} },
      { name: 'scripted', isModel: false, tuning: opts.recordedTuning }
    );
  } else if (buildMode === 'recorded') {
    armsToRun.push(
      { name: 'recorded', isModel: true, tuning: opts.recordedTuning }
    );
  } else if (buildMode === 'shipped') {
    armsToRun.push(
      { name: 'shipped', isModel: true, tuning: opts.shippedTuning ?? {} }
    );
  }

  let totalCalls = 0;
  let totalFallbacks = 0;
  let aborted = false;
  let abortReason: string | null = null;
  let budgetHit = false;
  const arms: ReproArmResult[] = [];

  for (const armDef of armsToRun) {
    if (aborted) break;
    const armRounds: ReproRound[] = [];
    let armCalls = 0, armCacheHits = 0, armFallbacks = 0;

    for (const seed of opts.seeds) {
      if (Date.now() - startTime >= maxSeconds * 1000) break;
      if (aborted) break;

      const sim = await opts.createSim(seed, armDef.tuning);
      if (armDef.isModel) {
        let matched = false, tFirstMatch: number | null = null;
        let mask = 0, hold = 0, tap = 0;
        const recent: string[] = [];
        let rCalls = 0, rCacheHits = 0, rFallbacks = 0;
        let roundAborted = false;

        try {
          while (!sim.done) {
            if (sim.tick % 12 === 0) {
              const obs = { ...sim.observe(), persona, recent: [...recent] };
              const key = obsKey(obs);
              let action = cache.get(key);
              if (action) {
                rCacheHits++;
                armCacheHits++;
              } else {
                if (opts.maxCalls !== undefined && totalCalls >= opts.maxCalls) {
                  budgetHit = true;
                  break;
                }
                rCalls++;
                armCalls++;
                totalCalls++;

                let choice: { action: Action; fallback: boolean };
                try {
                  choice = await choose(obs);
                } catch {
                  choice = { action: 'wait', fallback: true };
                }
                action = choice.action;
                if (choice.fallback) {
                  rFallbacks++;
                  armFallbacks++;
                  totalFallbacks++;
                } else {
                  cache.set(key, action);
                }

                if (totalCalls >= 40 && totalFallbacks / totalCalls > 0.30) {
                  aborted = true;
                  roundAborted = true;
                  abortReason = `Fallbacks exceeded 30% after 40 calls (${totalFallbacks}/${totalCalls})`;
                  break;
                }
              }
              recent.push(action);
              if (recent.length > 4) recent.shift();
              const toward = obs.me.facing > 0 ? BIT.KeyD : BIT.KeyA;
              const away = obs.me.facing > 0 ? BIT.KeyA : BIT.KeyD;
              hold = ({ advance: toward, retreat: away, block: BIT.ShiftLeft, low_punch: BIT.KeyS, sweep: BIT.KeyS } as Partial<Record<Action, number>>)[action] || 0;
              tap = ({ punch: BIT.KeyJ, kick: BIT.KeyK, low_punch: BIT.KeyJ, sweep: BIT.KeyK, parry: BIT.KeyL, grab: BIT.KeyF, jump: BIT.KeyW, prop: BIT.KeyE } as Partial<Record<Action, number>>)[action] || 0;
            }
            mask = hold | (sim.tick % 12 < 2 ? tap : 0);
            sim.step(mask);
            const res = sim.result();
            if (matchOracle(opts.oracle, res as RunLine)) {
              matched = true;
              tFirstMatch = res.t;
              break;
            }
          }
          const completed = (matched || sim.done) && !roundAborted && !budgetHit;
          armRounds.push({
            seed,
            matched,
            tFirstMatch,
            calls: rCalls,
            nanoCalls: rCalls,
            cacheHits: rCacheHits,
            fallbacks: rFallbacks,
            completed
          });
        } finally {
          sim.dispose();
        }

        if (budgetHit || roundAborted) break;
      } else {
        // Scripted control arm
        const policy = createPolicy(controlPersona, seed);
        let matched = false, tFirstMatch: number | null = null;
        try {
          while (!sim.done) {
            const mask = policy.step(sim);
            sim.step(mask);
            const res = sim.result();
            if (matchOracle(opts.oracle, res as RunLine)) {
              matched = true;
              tFirstMatch = res.t;
              break;
            }
          }
          armRounds.push({
            seed,
            matched,
            tFirstMatch,
            calls: 0,
            nanoCalls: 0,
            cacheHits: 0,
            fallbacks: 0,
            completed: matched || sim.done
          });
        } finally {
          sim.dispose();
        }
      }
    }

    arms.push({
      build: armDef.name,
      rounds: armRounds,
      reproduced: armRounds.filter(r => r.completed && r.matched).length,
      completed: armRounds.filter(r => r.completed).length,
      calls: armCalls,
      cacheHits: armCacheHits,
      fallbacks: armFallbacks
    });
  }

  const durationSeconds = Math.round((Date.now() - startTime) / 1000);
  const primaryArm = arms[0];

  return {
    placeholder: false,
    report: opts.report ?? 'rare',
    oracle: opts.oracle.description,
    oracleDescription: opts.oracle.description,
    chooser,
    model: modelName,
    requestedRounds: opts.seeds.length,
    build: buildMode,
    arms,
    rounds: primaryArm?.rounds ?? [],
    reproduced: primaryArm?.reproduced ?? 0,
    totals: {
      calls: totalCalls,
      nanoCalls: totalCalls,
      cacheHits: arms.reduce((n, a) => n + a.cacheHits, 0),
      fallbacks: totalFallbacks
    },
    aborted,
    abortReason,
    budgetHit,
    maxCalls: opts.maxCalls,
    durationSeconds,
    maxSeconds
  };
}
