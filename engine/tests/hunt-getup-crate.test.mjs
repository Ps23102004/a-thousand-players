// p0094 r1, sweep-nerf crowd: the rival sinks and is ejected beside the right crate when DOWNED ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSim } from '../sim.mjs';
import { createPolicy } from '../policy.mjs';
import { fighterFor } from '../crowd-worker-lib.mjs';
import { RULE_DEFAULTS } from '../../game/src/tuning.js';
import { ROOT } from './helpers.mjs';

const persona = JSON.parse(readFileSync(`${ROOT}/data/run-main/personas.json`, 'utf8')).find(p => p.id === 'p0094');
const nerf = JSON.parse(readFileSync(`${ROOT}/data/patches/sweep-nerf.json`, 'utf8'));
const SEED = 501070;

test('getupCrateFix is on by default and recorded rounds keep it off', () => {
  assert.equal(RULE_DEFAULTS.getupCrateFix, 1);
  assert.equal(JSON.parse(readFileSync(`${ROOT}/data/run-main/meta.json`, 'utf8')).recordedWith['rules.getupCrateFix'], 0);
});

async function replay(tuning = {}) {
  const sim = await createSim({ seed: SEED, fighter: fighterFor(persona.id), tuning: { ...nerf, ...tuning } });
  const policy = createPolicy(persona, SEED);
  let gotUp = false, maxY = 0;
  try {
    while (!sim.done) {
      sim.step(policy.step(sim));
      // Watch the getup after the knockdown at 16.58 s, and every tick through the end of the round.
      if (sim.time() > 16.58 && sim.rival.ground?.phase === 'GETUP') gotUp = true;
      if (gotUp) maxY = Math.max(maxY, sim.rival.rigidBody.translation().y);
    }
    assert.ok(gotUp, 'the rival must reach the getup beside the crate');
    return { res: sim.result(), maxY };
  } finally { sim.dispose(); }
}

test(`seed ${SEED}: shipped getup stays below y=1.3 beside the crate without an airborne event`, async () => {
  const { res, maxY } = await replay();
  assert.deepEqual(res.ev.filter(e => e[1] === 'airborne'), []);
  assert.ok(maxY < 1.3, `rival rose to y=${maxY} after getup`);
});

test(`seed ${SEED}: getupCrateFix=0 preserves the sink-and-eject reproduction`, async () => {
  const { res, maxY } = await replay({ 'rules.getupCrateFix': 0 });
  assert.deepEqual(res.ev.filter(e => e[1] === 'airborne'), [[21.5, 'airborne', 1]]);
  assert.ok(maxY > 2, `expected the legacy launch, max y=${maxY}`);
});
