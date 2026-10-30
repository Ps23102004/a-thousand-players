import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wilson,
  median,
  MINDLESS_A_MASK,
  MINDLESS_A_PERIOD,
  MINDLESS_B_MASK,
  MINDLESS_B_PERIOD,
  createMindlessAController,
  createMindlessBController,
} from '../../scripts/cpu-lowblock-sweep.mjs';
import { RULES, RULE_DEFAULTS } from '../../game/src/tuning.js';
import { createSim, runRound, BIT, KEYS } from '../sim.mjs';

test('wilson score interval: unit-tested against hard-coded known values (z=1.96)', () => {
  // Empty trial boundary
  assert.deepEqual(wilson(0, 0), [0, 1]);

  // n = 10 trials
  const [lo0, hi0] = wilson(0, 10);
  assert.equal(lo0, 0);
  assert.ok(Math.abs(hi0 - 0.2775) < 1e-3, `hi0 expected ~0.2775, got ${hi0}`);

  const [lo10, hi10] = wilson(10, 10);
  assert.ok(Math.abs(lo10 - 0.7225) < 1e-3, `lo10 expected ~0.7225, got ${lo10}`);
  assert.equal(hi10, 1);

  const [lo5, hi5] = wilson(5, 10);
  assert.ok(Math.abs(lo5 - 0.2366) < 1e-3, `lo5 expected ~0.2366, got ${lo5}`);
  assert.ok(Math.abs(hi5 - 0.7634) < 1e-3, `hi5 expected ~0.7634, got ${hi5}`);
  assert.ok(Math.abs(lo5 + hi5 - 1.0) < 1e-10, 'symmetric around 0.5');

  // n = 100 trials (relevant to 100-seed mindless input tests)
  const [lo100_0, hi100_0] = wilson(0, 100);
  assert.equal(lo100_0, 0);
  assert.ok(Math.abs(hi100_0 - 0.0369) < 1e-3, `hi expected ~0.0369, got ${hi100_0}`);

  const [lo100_100, hi100_100] = wilson(100, 100);
  assert.ok(Math.abs(lo100_100 - 0.9631) < 1e-3, `lo expected ~0.9631, got ${lo100_100}`);
  assert.equal(hi100_100, 1);

  const [lo100_50, hi100_50] = wilson(50, 100);
  assert.ok(Math.abs(lo100_50 - 0.4038) < 1e-3, `lo expected ~0.4038, got ${lo100_50}`);
  assert.ok(Math.abs(hi100_50 - 0.5962) < 1e-3, `hi expected ~0.5962, got ${hi100_50}`);
});

test('median: odd, even, and edge arrays', () => {
  assert.equal(median([]), 0);
  assert.equal(median([42]), 42);
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test('controller masks and cadences match bug-hunt H2 specifications', () => {
  const expectedA = BIT.KeyS | BIT.KeyJ;
  const expectedB = (1 << KEYS.length) - 1;

  assert.equal(MINDLESS_A_MASK, expectedA, 'Mindless A holds S + J');
  assert.equal(MINDLESS_A_PERIOD, 10, 'Mindless A period 10 ticks = 6 Hz');
  assert.equal(MINDLESS_B_MASK, expectedB, 'Mindless B holds all keys');
  assert.equal(MINDLESS_B_PERIOD, 3, 'Mindless B period 3 ticks = 20 Hz (releases 1 tick in 3)');

  const ctrlA = createMindlessAController();
  assert.equal(ctrlA.step({ tick: 0 }), 0);
  for (let t = 1; t <= 9; t++) {
    assert.equal(ctrlA.step({ tick: t }), expectedA);
  }
  assert.equal(ctrlA.step({ tick: 10 }), 0);

  const ctrlB = createMindlessBController();
  assert.equal(ctrlB.step({ tick: 0 }), 0);
  assert.equal(ctrlB.step({ tick: 1 }), expectedB);
  assert.equal(ctrlB.step({ tick: 2 }), expectedB);
  assert.equal(ctrlB.step({ tick: 3 }), 0);
});

test('rules.cpuLowBlock tuning is applied and restored cleanly', async () => {
  assert.equal(RULE_DEFAULTS.cpuLowBlock, 1);
  const sim = await createSim({ seed: 7000000, fighter: 'kai', tuning: { 'rules.cpuLowBlock': 0.75 } });
  assert.equal(RULES.cpuLowBlock, 0.75);
  sim.dispose();
  assert.equal(RULES.cpuLowBlock, 1);
});

test('smoke: Mindless A and B reproduce bug-hunt H2 finding with the recorded CPU (v=0)', async () => {
  // Mindless A on seed 7000000: win by KO in ~11s
  const simA = await createSim({ seed: 7000000, fighter: 'kai', tuning: { 'rules.cpuLowBlock': 0 } });
  const resA = await runRound(simA, createMindlessAController());
  simA.dispose();
  assert.equal(resA.out, 'win');
  assert.ok(resA.ko !== null, 'rival was KOed');
  assert.ok(resA.t < 20, `round completed fast, took ${resA.t}s`);

  // Mindless B on seed 7000000: 100 HP perfect win in ~9.9s
  const simB = await createSim({ seed: 7000000, fighter: 'kai', tuning: { 'rules.cpuLowBlock': 0 } });
  const resB = await runRound(simB, createMindlessBController());
  simB.dispose();
  assert.equal(resB.out, 'win');
  assert.ok(resB.ko !== null, 'rival was KOed');
  assert.equal(resB.hp[0], 100, 'perfect 100 HP');
  assert.ok(Math.abs(resB.t - 9.9) < 0.2, `expected ~9.9s, got ${resB.t}s`);
});
