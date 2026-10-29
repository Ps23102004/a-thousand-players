// rules.cpuLowBlock (bug hunt H2): holding crouch and tapping J beats the CPU every round, because the CPU only ever blocks
// standing and answers with high attacks that whiff over a crouching player. With the rule at p > 0 the CPU, when it blocks
// a crouch attack, crouch-blocks with probability p. Default 0: the shipped game is unchanged (no extra random draws).
import { test } from 'node:test';
import assert from 'node:assert/strict';
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

test('cpuLowBlock is off by default', () => assert.equal(RULE_DEFAULTS.cpuLowBlock, 0));

test('cpuLowBlock 0 plays exactly the shipped game', async () => {
  for (const [i, seed] of [[1, 123457], [23, 799]]) {
    const a = (await play(syntheticPersona(i), seed)).res, b = (await play(syntheticPersona(i), seed, { tuning: { 'rules.cpuLowBlock': 0 } })).res;
    assert.equal(a.hash, b.hash);
  }
  const a = await crouchSpam(9100), b = await crouchSpam(9100, { 'rules.cpuLowBlock': 0 });
  assert.equal(a.hash, b.hash); assert.equal(a.crouched, 0, 'the shipped CPU never crouches');
});

test('cpuLowBlock 1: the CPU crouch-blocks the crouch-jab spam and wins some of those rounds', async () => {
  let offWins = 0, onWins = 0, crouched = 0;
  for (let s = 0; s < 6; s++) {
    const off = await crouchSpam(9100 + s), on = await crouchSpam(9100 + s, { 'rules.cpuLowBlock': 1 });
    offWins += off.out === 'win'; onWins += on.out === 'win'; crouched += on.crouched;
  }
  assert.equal(offWins, 6, 'precondition: the exploit wins every round on the shipped game');
  assert.ok(crouched > 0, 'the CPU crouches');
  assert.ok(onWins < offWins, `exploit wins with the rule on: ${onWins}/6`);
});
