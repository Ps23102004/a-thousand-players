import { matchOracle } from '../lib/oracle';
import type { Action, Observation, Oracle, RunLine } from '../lib/types';
import { obsKey } from './spotlight';
import { BIT } from '../engine/sim.mjs';

export type Sim = { tick: number; done: boolean; observe(): Omit<Observation, 'persona' | 'recent'>; step(mask: number): unknown; result(): { ev: RunLine['ev']; t: number; out: RunLine['out']; ko: RunLine['ko']; hp: [number, number] }; dispose(): void };
type Counts = { nanoCalls: number; cacheHits: number; fallbacks: number };
export type ReproRound = Counts & { seed: number; matched: boolean; tFirstMatch: number | null; completed: boolean };
export type ReproResults = { placeholder: boolean; model: 'nano' | 'fake'; requestedRounds: number; rounds: ReproRound[]; reproduced: number; totals: Counts; budgetHit: boolean; maxCalls: number };
const persona: Observation['persona'] = { archetype: 'casual', aggression: 0.5, skill: 0.5, bio: 'A casual player exploring the fight.' };
const zero = (): Counts => ({ nanoCalls: 0, cacheHits: 0, fallbacks: 0 });

/** Drive fresh rounds sequentially; never spend a call after the cap. */
export async function runExperiment(opts: { seeds: number[]; oracle: Oracle; maxCalls: number; choose: (obs: Observation) => Promise<{ action: Action; fallback: boolean }>; createSim: (seed: number) => Promise<Sim>; model?: 'nano' | 'fake' }): Promise<ReproResults> {
  if (!Number.isInteger(opts.maxCalls) || opts.maxCalls < 0 || opts.maxCalls > 40 || opts.seeds.length > 20) throw new Error('Limits: 0–40 calls and up to 20 rounds');
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
      rounds.push({ seed, matched, tFirstMatch, completed: matched || sim.done, ...counts });
    } finally { sim.dispose(); }
    if (budgetHit) break;
  }
  return { placeholder: false, model: opts.model ?? 'nano', requestedRounds: opts.seeds.length, rounds, reproduced: rounds.filter(r => r.matched).length, totals, budgetHit, maxCalls: opts.maxCalls };
}
