import { ACTIONS, type Action, type Observation } from "../lib/types";
import { chat, NANO } from "./models";

const cache = new Map<string, Action>();
export const spotlightStats = { calls: 0, cacheHits: 0, fallbacks: 0 };

/** Observations that round to the same key get the same action: a live player re-deciding every few ticks sees near-identical states. */
export function obsKey(o: Observation): string {
  const fighter = (f: Observation["me"]) => `${Math.round(f.hp / 20)}${f.state}${f.guarding ? "g" : ""}${f.grappled ? "G" : ""}${f.onGround ? "" : "a"}`;
  return [o.persona.archetype, Math.round(o.dist * 2) / 2, fighter(o.me), fighter(o.rival), o.recent.at(-1) ?? ""].join("|");
}

export function parseAction(text: string): Action | null {
  const word = text.toLowerCase().replace(/low punch/g, "low_punch").match(/[a-z_]+/)?.[0];
  return word && (ACTIONS as readonly string[]).includes(word) ? (word as Action) : null;
}

export async function chooseAction(obs: Observation): Promise<Action> {
  spotlightStats.calls++;
  const key = obsKey(obs);
  const hit = cache.get(key);
  if (hit) { spotlightStats.cacheHits++; return hit; }
  const p = obs.persona;
  const system = `You are a ${p.archetype} player (aggression ${p.aggression.toFixed(1)}, skill ${p.skill.toFixed(1)}): ${p.bio} You are playing a 1v1 street fighting game. Reply with exactly one word from: ${ACTIONS.join(" ")}.`;
  const f = (x: Observation["me"]) => `hp ${Math.round(x.hp)}, posture ${Math.round(x.posture)}, ${x.state}${x.guarding ? ", guarding" : ""}${x.grappled ? ", grappled" : ""}${x.onGround ? "" : ", airborne"}`;
  const user = `t=${obs.t.toFixed(1)}s distance ${obs.dist.toFixed(1)} (close < 1.3 < mid < 2.2 < far). You: ${f(obs.me)}. Rival: ${f(obs.rival)}. Your last actions: ${obs.recent.join(" ") || "none"}. Next action?`;
  try {
    const r = await chat({ model: NANO, system, user, maxTokens: 6, temperature: 0.5, thinking: false, timeoutMs: 15_000, retries: 0 });
    const action = parseAction(r.content);
    if (!action) { spotlightStats.fallbacks++; return "wait"; }
    if (cache.size > 5000) cache.clear();
    cache.set(key, action);
    return action;
  } catch (err) {
    // The match must go on: fall back to "wait", but say why so a dead API key does not look like a passive player.
    spotlightStats.fallbacks++;
    console.error(`[spotlight] fallback: ${(err as Error).message.slice(0, 160)}`);
    return "wait";
  }
}
