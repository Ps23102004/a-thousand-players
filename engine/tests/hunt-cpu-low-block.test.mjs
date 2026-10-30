// rules.cpuLowBlock (bug hunt H2): holding crouch and tapping J beats the CPU every round, because the CPU only ever blocks
// standing and answers with high attacks that whiff over a crouching player. With the rule at p > 0 the CPU, when it blocks
// a crouch attack, crouch-blocks with probability p. Default 1; recorded rounds pin 0 (no extra random draws).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RULE_DEFAULTS } from '../../game/src/tuning.js';
import { createSim, runRound, BIT } from '../sim.mjs';
import { play } from './helpers.mjs';
import { syntheticPersona } from '../policy.mjs';

const SJ = BIT.KeyS | BIT.KeyJ;
const spam = { step: s => (s.tick % 10 ? SJ : 0) }; // hold crouch, tap J at 6 Hz
async function crouchSpam(seed, tuning) {
  const sim = await createSim({ seed, fighter: seed % 2 ? 'rook' : 'kai', tuning });
  let crouched = 0;
  const res = await runRound(sim, { step: s => { if (sim.rival.isCrouching) crouched++; return spam.step(s); } });
  sim.dispose();
  return { ...res, crouched };
}

test('cpuLowBlock ships on while recorded rounds pin the original CPU', () => {
  assert.equal(RULE_DEFAULTS.cpuLowBlock, 1);
  assert.equal(JSON.parse(readFileSync('data/run-main/meta.json', 'utf8')).recordedWith['rules.cpuLowBlock'], 0);
});

test('fixed seed: the shipped CPU answers crouch-jab spam; flag 0 never crouch-blocks', async () => {
  const off = await crouchSpam(9101, { 'rules.cpuLowBlock': 0 });
  const on = await crouchSpam(9101);
  const explicit = await crouchSpam(9101, { 'rules.cpuLowBlock': 1 });
  assert.equal(off.crouched, 0);
  assert.equal(off.out, 'win');
  assert.ok(on.crouched > 0, 'the shipped CPU crouch-blocks low attacks');
  assert.equal(on.out, 'loss', 'the shipped CPU answers the crouching player');
  assert.equal(on.hash, explicit.hash);
});

test('cpuLowBlock 0 explicitly preserves the recorded CPU behavior', async () => {
  const recorded = JSON.parse(readFileSync('data/run-main/meta.json', 'utf8')).recordedWith;
  for (const [i, seed] of [[1, 123457], [23, 799]]) {
    const a = (await play(syntheticPersona(i), seed, { tuning: recorded })).res, b = (await play(syntheticPersona(i), seed, { tuning: { ...recorded, 'rules.cpuLowBlock': 0 } })).res;
    assert.equal(a.hash, b.hash);
  }
  const a = await crouchSpam(9100, recorded), b = await crouchSpam(9100, { ...recorded, 'rules.cpuLowBlock': 0 });
  assert.equal(a.hash, b.hash); assert.equal(a.crouched, 0, 'the recorded CPU never crouches');
});

test('cpuLowBlock 1: the CPU crouch-blocks the crouch-jab spam and wins some of those rounds', async () => {
  let offWins = 0, onWins = 0, crouched = 0;
  for (let s = 0; s < 6; s++) {
    const off = await crouchSpam(9100 + s, { 'rules.cpuLowBlock': 0 }), on = await crouchSpam(9100 + s, { 'rules.cpuLowBlock': 1 });
    offWins += off.out === 'win'; onWins += on.out === 'win'; crouched += on.crouched;
  }
  assert.equal(offWins, 6, 'precondition: the exploit wins every round on the recorded CPU');
  assert.ok(crouched > 0, 'the CPU crouches');
  assert.ok(onWins < offWins, `exploit wins with the rule on: ${onWins}/6`);
});
