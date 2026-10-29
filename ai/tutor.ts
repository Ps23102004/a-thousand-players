// Pure evidence, proposal validation and measured ranking. No model or filesystem access.
import type { ProphetResult } from '../lib/prophet';
import type { Tuning } from '../lib/types';

type Person = { id:string; archetype:string };
type Round = { p:string; round:number; out:string; t:number };
type Session = { p:string; quit:{reason:string} };
type Spec = { key:string; min:number; max:number };
export type StruggleRow = { archetype:string; players:number; rounds:number; wins:number; winRate:number; quits:number; quitRate:number; round2Count:number; medianRound2Seconds:number|null };
export type Aid = { title:string; playerFacingText:string; tuningOverrides:Tuning; rationale:string; archetype:string };
export type MeasuredAid = { aid:Aid; measurement:ProphetResult };
export type TutorResults = { placeholder:boolean; source?:string; struggleTable:StruggleRow[]; aids:MeasuredAid[]; proposed?:number; dropped?:Record<string,number>; wallMs?:number };

export function buildStruggleTable(people:Person[], runs:Round[], sessions:Session[]):StruggleRow[] {
  const ids = new Map(people.map(p => [p.id,p.archetype]));
  return [...new Set(people.map(p => p.archetype))].sort().map(archetype => {
    const members = people.filter(p => p.archetype === archetype);
    const rounds = runs.filter(r => ids.get(r.p) === archetype);
    const quits = sessions.filter(s => ids.get(s.p) === archetype && ['frustration','boredom'].includes(s.quit.reason)).length;
    const times = rounds.filter(r => r.round === 2).map(r => r.t).sort((a,b) => a-b);
    const n = times.length, wins = rounds.filter(r => r.out === 'win').length;
    return {archetype, players:members.length, rounds:rounds.length, wins, winRate:rounds.length ? wins/rounds.length : 0, quits, quitRate:members.length ? quits/members.length : 0, round2Count:n, medianRound2Seconds:n ? (times[Math.floor((n-1)/2)] + times[Math.floor(n/2)])/2 : null};
  });
}
export function tutorPrompt(table:StruggleRow[], specs:Spec[], gameText:string) {
  return {system:'You draft onboarding aids for a fighting game. Propose hypotheses, never claim a measured result. Use only game text supplied for factual claims and quotations.', user:`Return JSON {"aids":[{"title":"...","playerFacingText":"...","tuningOverrides":{"key":1},"rationale":"...","archetype":"casual"}]}. At most 4 aids. Each must cite an archetype row, contain nonempty absolute numeric tuning overrides using only these keys and ranges, and suggest player-facing text grounded in the game text. Do not invent quotes or numbers.\nStruggle table: ${JSON.stringify(table)}\nAllowed tuning: ${JSON.stringify(specs)}\nGame text:\n${gameText}`};
}
export function validateAids(raw:unknown, table:StruggleRow[], specs:Spec[], gameText = "") {
  const input = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' && Array.isArray((raw as {aids?:unknown}).aids) ? (raw as {aids:unknown[]}).aids : []);
  const dropped = {duplicate:0, invalidTuning:0, invalidAid:0, excess:0}; const aids:Aid[] = []; const seen = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) { dropped.invalidAid++; continue; }
    const a = item as Record<string,unknown>;
    if (!['title','playerFacingText','rationale','archetype'].every(k => typeof a[k] === 'string' && (a[k] as string).trim()) || !table.some(r => r.archetype === a.archetype)) { dropped.invalidAid++; continue; }
    const quotes = [...String(a.playerFacingText).matchAll(/["“]([^"”]+)["”]/g)].map(m => m[1]);
    if (quotes.some(q => !gameText.includes(q))) { dropped.invalidAid++; continue; }
    const values = a.tuningOverrides;
    if (!values || typeof values !== 'object' || Array.isArray(values) || !Object.keys(values).length || Object.entries(values).some(([k,v]) => { const s=specs.find(x=>x.key===k); return !s || typeof v !== 'number' || !Number.isFinite(v) || v<s.min || v>s.max; })) { dropped.invalidTuning++; continue; }
    const key = String(a.title).trim().toLowerCase();
    const signature = JSON.stringify(Object.entries(values).sort(([x],[y])=>x.localeCompare(y)));
    if (seen.has(`title:${key}`) || seen.has(`tuning:${signature}`)) { dropped.duplicate++; continue; }
    if (aids.length >= 4) { dropped.excess++; continue; }
    seen.add(`title:${key}`); seen.add(`tuning:${signature}`);
    aids.push({title:String(a.title).trim(), playerFacingText:String(a.playerFacingText).trim(), rationale:String(a.rationale).trim(), archetype:String(a.archetype), tuningOverrides:values as Tuning});
  }
  return {aids, proposed:input.length, dropped};
}
export function rankResults<T extends MeasuredAid>(results:T[]):T[] {
  const delta = (r:T) => { const b=r.measurement.before.byArchetype.find(x=>x.archetype==='casual'); const a=r.measurement.after.byArchetype.find(x=>x.archetype==='casual'); return b && a ? a.winRate-b.winRate : -Infinity; };
  return [...results].sort((a,b)=>delta(b)-delta(a));
}
export async function measureAids(aids:Aid[], run:(tuning:Tuning)=>Promise<ProphetResult>):Promise<MeasuredAid[]> {
  const measured:MeasuredAid[] = [];
  for (const aid of aids) measured.push({aid, measurement:await run(aid.tuningOverrides)});
  return rankResults(measured);
}
