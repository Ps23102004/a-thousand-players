import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStruggleTable, tutorPrompt, validateAids, rankResults } from './tutor';

const people = [{id:'a', archetype:'casual'}, {id:'b', archetype:'casual'}];
const runs = [{p:'a', round:1, out:'win', t:10}, {p:'a', round:2, out:'loss', t:8}, {p:'b', round:1, out:'loss', t:4}];
const sessions = [{p:'a', quit:{reason:'frustration'}}, {p:'b', quit:{reason:'satisfied'}}];
const table = buildStruggleTable(people, runs, sessions);
const spec = [{key:'x', min:1, max:5}];
const aid = {title:'Guard', playerFacingText:'Hold away to guard.', tuningOverrides:{x:2}, rationale:'Casual losses', archetype:'casual'};

test('computes evidence from individual rounds and sessions', () => {
  assert.deepEqual(table[0], {archetype:'casual', players:2, rounds:3, wins:1, winRate:1/3, quits:1, quitRate:0.5, round2Count:1, medianRound2Seconds:8});
});
test('prompt grounds proposals in evidence, game text, and allowed ranges', () => {
  const p = tutorPrompt(table, spec, 'Hold away to guard.');
  assert.match(p.user, /casual/); assert.match(p.user, /Hold away to guard/); assert.match(p.user, /"max":5/);
});
test('drops and counts invalid, duplicate and excess suggestions', () => {
  const result = validateAids([aid, {...aid}, {...aid,title:'bad', tuningOverrides:{nope:2}}, {...aid,title:'range',tuningOverrides:{x:6}}, {...aid,title:'empty',tuningOverrides:{}}, {...aid,title:'missing',archetype:'other'}], table, spec);
  assert.equal(result.aids.length, 1);
  assert.deepEqual(result.dropped, {duplicate:1, invalidTuning:3, invalidAid:1, excess:0});
});
test('ranks by measured casual win rate change, not model confidence', () => {
  const side = (rate:number) => ({byArchetype:[{archetype:'casual',winRate:rate}]});
  const ranked = rankResults([{aid:{...aid,title:'low'}, measurement:{before:side(.2),after:side(.1)}}, {aid:{...aid,title:'high'}, measurement:{before:side(.2),after:side(.4)}}] as never);
  assert.equal(ranked[0].aid.title,'high');
});

test('offline pipeline measures every accepted aid and ranks actual results', async () => {
  const { measureAids } = await import('./tutor');
  const calls:string[] = [];
  const side = (winRate:number) => ({rounds:1,wins:0,winRate,bugRounds:0,byArchetype:[{archetype:'casual',rounds:1,wins:0,winRate,bugRounds:0}]});
  const result = await measureAids([aid], async tuning => { calls.push(JSON.stringify(tuning)); return {tuning,baselineTuning:{},personas:1,roundsEach:1,seed:1,before:side(0),after:side(1),wallMs:10}; });
  assert.deepEqual(calls,['{"x":2}']); assert.equal(result[0].measurement.after.winRate,1);
});

test('rejects invented quotations in player-facing text', () => {
  const result = validateAids([{...aid,playerFacingText:'Press "invented move".'}], table, spec, 'Hold away to guard.');
  assert.equal(result.aids.length,0); assert.equal(result.dropped.invalidAid,1);
});
