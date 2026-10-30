import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runExperiment } from './reprobot';
import type { Oracle } from '../lib/types';

const oracle: Oracle = { description: 'block and oob', combine: 'all', atoms: [{ event: 'block' }, { event: 'oob' }] };
function fakeSim() {
  let tick = 0;
  const ev: [number, 'block' | 'oob', 0][] = [];
  const fighter = { hp: 100, posture: 0, x: 0, state: 'IDLE', facing: 1 as const, guarding: false, grappled: false, onGround: true };
  return { get tick() { return tick; }, get done() { return tick >= 90; }, observe: () => ({ t: tick / 60, me: fighter, rival: fighter, dist: 2 }), step() { tick++; if (tick === 2) ev.push([0.03, 'block', 0]); if (tick === 3) ev.push([0.05, 'oob', 0]); }, result: () => ({ ev, t: tick / 60, out: 'draw' as const, ko: null, hp: [100, 100] as [number, number] }), dispose() {} };
}

test('stops on the first complete oracle match and sums round counts deterministically', async () => {
  const options = { seeds: [10, 11], oracle, maxCalls: 40, createSim: async () => fakeSim(), choose: async () => ({ action: 'wait' as const, fallback: false }) };
  const a = await runExperiment(options), b = await runExperiment(options);
  assert.deepEqual(a, b);
  assert.equal(a.reproduced, 2);
  assert.deepEqual(a.rounds.map(r => r.tFirstMatch), [0.05, 0.05]);
  assert.equal(a.totals.nanoCalls, 1);
  assert.equal(a.totals.cacheHits, 1);
});

test('aborts cleanly at the call budget and counts fallback attempts', async () => {
  const result = await runExperiment({ seeds: [10, 11], oracle: { ...oracle, atoms: [{ event: 'airborne' }] }, maxCalls: 1, createSim: async () => fakeSim(), choose: async () => ({ action: 'wait', fallback: true }) });
  assert.equal(result.budgetHit, true);
  assert.equal(result.rounds.length, 1);
  assert.equal(result.rounds[0].matched, false);
  assert.equal(result.totals.nanoCalls, 1);
  assert.equal(result.totals.fallbacks, 1);
});

test('fresh-play display distinguishes placeholder, fake data and high fallbacks', async () => {
  const React = await import('react');
  const { createRequire } = await import('node:module');
  const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (node: import('react').ReactNode) => string };
  const { FreshPlay } = await import('../app/modes/repro/FreshPlay');
  const placeholder = { placeholder: true, model: 'nano' as const, requestedRounds: 20, rounds: [], reproduced: 0, totals: { nanoCalls: 0, cacheHits: 0, fallbacks: 0 }, budgetHit: false, maxCalls: 40 };
  assert.match(renderToStaticMarkup(React.createElement(FreshPlay, { results: placeholder })), /not yet run/i);
  const results = { ...placeholder, placeholder: false, model: 'fake' as const, rounds: [{ seed: 42, matched: true, tFirstMatch: 3, completed: true, nanoCalls: 2, cacheHits: 0, fallbacks: 2 }], reproduced: 1, totals: { nanoCalls: 2, cacheHits: 0, fallbacks: 2 } };
  const html = renderToStaticMarkup(React.createElement(FreshPlay, { results }));
  assert.match(html, /fake/i); assert.match(html, /42/); assert.match(html, /fallback/i); assert.match(html, /not a success rate/i);
});

test('FreshPlay renders real numbers for planned rounds and derives reproduced count consistently', async () => {
  const React = await import('react');
  const { createRequire } = await import('node:module');
  const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (node: import('react').ReactNode) => string };
  const { FreshPlay } = await import('../app/modes/repro/FreshPlay');
  const oldResults = {
    placeholder: false,
    model: 'nano' as const,
    requestedRounds: 20,
    rounds: [
      { seed: 2000000, matched: false, tFirstMatch: null, completed: true, nanoCalls: 27, cacheHits: 68, fallbacks: 0 },
      { seed: 2000001, matched: false, tFirstMatch: null, completed: false, nanoCalls: 13, cacheHits: 0, fallbacks: 0 }
    ],
    reproduced: 0,
    totals: { nanoCalls: 40, cacheHits: 68, fallbacks: 0 },
    budgetHit: true,
    maxCalls: 40
  };
  const html = renderToStaticMarkup(React.createElement(FreshPlay, { results: oldResults }));
  assert.ok(html.includes('2 of 20 planned rounds'), `expected "2 of 20 planned rounds" in output, got: ${html}`);
  assert.doesNotMatch(html, /\{results\./);
  assert.ok(html.includes('0 of 1 completed fresh rounds'));

  // Consistency: count matched rounds among completed ones
  const mixed = {
    ...oldResults,
    rounds: [
      { seed: 2000000, matched: true, tFirstMatch: 1.2, completed: true, nanoCalls: 10, cacheHits: 0, fallbacks: 0 },
      { seed: 2000001, matched: true, tFirstMatch: 1.5, completed: false, nanoCalls: 10, cacheHits: 0, fallbacks: 0 },
      { seed: 2000002, matched: false, tFirstMatch: null, completed: true, nanoCalls: 10, cacheHits: 0, fallbacks: 0 },
    ],
    reproduced: 999, // Should be derived from completed matched rounds, not trusted blindly
  };
  const mixedHtml = renderToStaticMarkup(React.createElement(FreshPlay, { results: mixed }));
  assert.ok(mixedHtml.includes('1 of 2 completed fresh rounds'));
});

test('ai/cli/reprobot.ts rejects imported results with matched:true and completed:false', async () => {
  const { spawnSync } = await import('node:child_process');
  const { mkdtempSync, writeFileSync, rmSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'reprobot-test-'));
  try {
    const committed = JSON.parse(readFileSync(new URL('../data/reprobot/results.json', import.meta.url), 'utf8'));
    const invalid = {
      ...committed,
      arms: [
        {
          ...committed.arms[0],
          rounds: [
            { seed: 2000000, matched: true, tFirstMatch: 1.2, completed: false, calls: 10, nanoCalls: 10, cacheHits: 0, fallbacks: 0 },
          ],
          reproduced: 1,
        },
        ...committed.arms.slice(1)
      ]
    };
    const file = join(dir, 'invalid.json');
    writeFileSync(file, JSON.stringify(invalid));
    const run = spawnSync(process.execPath, ['--import', 'tsx', 'ai/cli/reprobot.ts', '--results-from', file, '--out', join(dir, 'out.json')], { encoding: 'utf8' });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /Invalid or inconsistent fresh-play results/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('arm separation (recorded vs shipped tuning actually passed to the sim)', async () => {
  const { runReproExperiment } = await import('./reprobot');
  const tuningLog: { arm: string; tuning: Record<string, unknown> }[] = [];
  const fakeSimWithPlayer = () => {
    let tick = 0;
    const fighter = { hp: 100, posture: 0, x: 0, state: 'IDLE', facing: 1 as const, guarding: false, grappled: false, onGround: true, mount: false, ground: false, grapple: false };
    return {
      get tick() { return tick; },
      get done() { return tick >= 30; },
      player: fighter,
      rival: fighter,
      observe: () => ({ t: tick / 60, me: fighter, rival: fighter, dist: 2, bucket: 'close' as const, rivalPhase: 'idle' as const, mePhase: 'idle' as const }),
      step() { tick++; },
      result: () => ({ ev: [], t: tick / 60, out: 'draw' as const, ko: null, hp: [100, 100] as [number, number] }),
      dispose() {}
    };
  };

  const recordedTuning = { 'rules.mountReleaseFix': 0, 'rules.throwPropGuard': 0 };
  const res = await runReproExperiment({
    seeds: [100, 101],
    oracle,
    build: 'both',
    chooser: 'fake',
    recordedTuning,
    shippedTuning: {},
    createSim: async (seed, tuning) => {
      tuningLog.push({ arm: seed === 100 ? 's100' : 's101', tuning: tuning || {} });
      return fakeSimWithPlayer();
    },
    choose: async () => ({ action: 'advance' as const, fallback: false })
  });

  assert.equal(res.arms.length, 3);
  assert.equal(res.arms[0].build, 'recorded');
  assert.equal(res.arms[1].build, 'shipped');
  assert.equal(res.arms[2].build, 'scripted');

  // Recorded arm must receive recordedTuning
  assert.deepEqual(tuningLog[0].tuning, recordedTuning);
  assert.deepEqual(tuningLog[1].tuning, recordedTuning);
  // Shipped arm must receive empty shipped tuning
  assert.deepEqual(tuningLog[2].tuning, {});
  assert.deepEqual(tuningLog[3].tuning, {});
  // Scripted arm must receive recordedTuning
  assert.deepEqual(tuningLog[4].tuning, recordedTuning);
  assert.deepEqual(tuningLog[5].tuning, recordedTuning);
});

test('early stop terminates round as soon as oracle matches', async () => {
  const { runReproExperiment } = await import('./reprobot');
  let totalSteps = 0;
  const fakeSimEarly = () => {
    let tick = 0;
    const ev: [number, 'block' | 'oob', 0][] = [];
    const fighter = { hp: 100, posture: 0, x: 0, state: 'IDLE', facing: 1 as const, guarding: false, grappled: false, onGround: true, mount: false, ground: false, grapple: false };
    return {
      get tick() { return tick; },
      get done() { return tick >= 90; },
      player: fighter,
      rival: fighter,
      observe: () => ({ t: tick / 60, me: fighter, rival: fighter, dist: 2, bucket: 'close' as const, rivalPhase: 'idle' as const, mePhase: 'idle' as const }),
      step() {
        tick++;
        totalSteps++;
        if (tick === 2) ev.push([0.03, 'block', 0]);
        if (tick === 3) ev.push([0.05, 'oob', 0]);
      },
      result: () => ({ ev, t: tick / 60, out: 'draw' as const, ko: null, hp: [100, 100] as [number, number] }),
      dispose() {}
    };
  };

  const res = await runReproExperiment({
    seeds: [200],
    oracle,
    build: 'recorded',
    chooser: 'fake',
    createSim: async () => fakeSimEarly(),
    choose: async () => ({ action: 'wait' as const, fallback: false })
  });

  const round = res.arms[0].rounds[0];
  assert.equal(round.matched, true);
  assert.equal(round.completed, true);
  assert.equal(round.tFirstMatch, 0.05);
  // Stopped at tick 3, well before tick 90
  assert.equal(totalSteps, 3);
});

test('fallback abort cleanly stops the whole run when fallbacks exceed 30% after 40 calls', async () => {
  const { runReproExperiment } = await import('./reprobot');
  const fakeSimLong = () => {
    let tick = 0;
    const fighter = { hp: 100, posture: 0, x: 0, state: 'IDLE', facing: 1 as const, guarding: false, grappled: false, onGround: true, mount: false, ground: false, grapple: false };
    return {
      get tick() { return tick; },
      get done() { return tick >= 600; }, // long enough for many calls
      player: fighter,
      rival: fighter,
      observe: () => ({ t: tick / 60, me: fighter, rival: fighter, dist: 2 + tick, bucket: 'close' as const, rivalPhase: 'idle' as const, mePhase: 'idle' as const }),
      step() { tick++; },
      result: () => ({ ev: [], t: tick / 60, out: 'draw' as const, ko: null, hp: [100, 100] as [number, number] }),
      dispose() {}
    };
  };

  // 100% fallbacks
  const res = await runReproExperiment({
    seeds: [301, 302, 303, 304, 305],
    oracle: { description: 'never', combine: 'all', atoms: [{ event: 'nan' }] },
    build: 'both',
    chooser: 'fake',
    createSim: async () => fakeSimLong(),
    choose: async () => ({ action: 'wait' as const, fallback: true })
  });

  assert.equal(res.aborted, true);
  assert.match(res.abortReason || '', /fallback/i);
  // Should stop early after 40 calls
  const recordedArm = res.arms[0];
  assert.ok(recordedArm.calls >= 40 && recordedArm.calls <= 42);
  // Subsequent arms (shipped, scripted) should not have been run or have 0 rounds
  assert.ok(res.arms.length <= 1 || (res.arms[1]?.rounds.length === 0));
});

test('aggregate counts sum round results accurately', async () => {
  const { runReproExperiment } = await import('./reprobot');
  const fakeSimCounting = () => {
    let tick = 0;
    const ev: [number, 'block' | 'oob', 0][] = [];
    const fighter = { hp: 100, posture: 0, x: 0, state: 'IDLE', facing: 1 as const, guarding: false, grappled: false, onGround: true, mount: false, ground: false, grapple: false };
    return {
      get tick() { return tick; },
      get done() { return tick >= 24; },
      player: fighter,
      rival: fighter,
      observe: () => ({ t: tick / 60, me: fighter, rival: fighter, dist: 2, bucket: 'close' as const, rivalPhase: 'idle' as const, mePhase: 'idle' as const }),
      step() { tick++; },
      result: () => ({ ev, t: tick / 60, out: 'draw' as const, ko: null, hp: [100, 100] as [number, number] }),
      dispose() {}
    };
  };

  const res = await runReproExperiment({
    seeds: [401, 402, 403],
    oracle,
    build: 'both',
    chooser: 'fake',
    createSim: async () => fakeSimCounting(),
    choose: async () => ({ action: 'wait' as const, fallback: false })
  });

  for (const arm of res.arms) {
    const sumCalls = arm.rounds.reduce((n, r) => n + (r.calls ?? r.nanoCalls), 0);
    const sumHits = arm.rounds.reduce((n, r) => n + r.cacheHits, 0);
    const sumFallbacks = arm.rounds.reduce((n, r) => n + r.fallbacks, 0);
    const sumMatched = arm.rounds.filter(r => r.completed && r.matched).length;
    const sumCompleted = arm.rounds.filter(r => r.completed).length;

    assert.equal(arm.calls, sumCalls);
    assert.equal(arm.cacheHits, sumHits);
    assert.equal(arm.fallbacks, sumFallbacks);
    assert.equal(arm.reproduced, sumMatched);
    assert.equal(arm.completed, sumCompleted);
  }
});

test('determinism: running the experiment twice with identical inputs yields identical results', async () => {
  const { runReproExperiment } = await import('./reprobot');
  const makeSim = () => {
    let tick = 0;
    const ev: [number, 'block' | 'oob', 0][] = [];
    const fighter = { hp: 100, posture: 0, x: 0, state: 'IDLE', facing: 1 as const, guarding: false, grappled: false, onGround: true, mount: false, ground: false, grapple: false };
    return {
      get tick() { return tick; },
      get done() { return tick >= 24; },
      player: fighter,
      rival: fighter,
      observe: () => ({ t: tick / 60, me: fighter, rival: fighter, dist: 2, bucket: 'close' as const, rivalPhase: 'idle' as const, mePhase: 'idle' as const }),
      step() { tick++; },
      result: () => ({ ev, t: tick / 60, out: 'draw' as const, ko: null, hp: [100, 100] as [number, number] }),
      dispose() {}
    };
  };

  const options = {
    seeds: [501, 502],
    oracle,
    build: 'both' as const,
    chooser: 'fake' as const,
    createSim: async () => makeSim(),
    choose: async () => ({ action: 'advance' as const, fallback: false })
  };

  const run1 = await runReproExperiment(options);
  const run2 = await runReproExperiment(options);

  assert.deepEqual(run1, run2);
});

test('FreshPlay renders multi-arm table and honest sentence for new results shape', async () => {
  const React = await import('react');
  const { createRequire } = await import('node:module');
  const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (node: import('react').ReactNode) => string };
  const { FreshPlay } = await import('../app/modes/repro/FreshPlay');

  const multiArmResults = {
    placeholder: false,
    chooser: 'local',
    model: 'gemma4:e4b-mlx',
    requestedRounds: 20,
    build: 'both',
    arms: [
      { build: 'recorded', reproduced: 2, completed: 20, calls: 450, cacheHits: 120, fallbacks: 3, rounds: [] },
      { build: 'shipped', reproduced: 0, completed: 20, calls: 460, cacheHits: 110, fallbacks: 2, rounds: [] },
      { build: 'scripted', reproduced: 0, completed: 20, calls: 0, cacheHits: 0, fallbacks: 0, rounds: [] }
    ],
    totals: { calls: 910, nanoCalls: 910, cacheHits: 230, fallbacks: 5 },
    aborted: false
  };

  const html = renderToStaticMarkup(React.createElement(FreshPlay, { results: multiArmResults as any }));

  // Check arms table
  assert.ok(html.includes('recorded build'));
  assert.ok(html.includes('shipped build'));
  assert.ok(html.includes('scripted control'));
  assert.ok(html.includes('2 of 20'));
  assert.ok(html.includes('0 of 20'));

  // Check chooser model name
  assert.ok(html.includes('gemma4:e4b-mlx'));

  // Check honest sentence clauses
  assert.match(html, /local small model/i);
  assert.match(html, /not Nemotron/i);
  assert.match(html, /fresh seeds/i);
  assert.match(html, /one report/i);
  assert.match(html, /a fixed bug should reproduce 0 times/i);
  assert.match(html, /not a success rate/i);
});

test('common oracle with fake chooser stops early on knockdown', async () => {
  const { runReproExperiment, COMMON_ORACLE } = await import('./reprobot');
  let totalSteps = 0;
  const fakeSimKnockdown = () => {
    let tick = 0;
    const ev: [number, 'knockdown', 0][] = [];
    const fighter = { hp: 100, posture: 0, x: 0, state: 'IDLE', facing: 1 as const, guarding: false, grappled: false, onGround: true, mount: false, ground: false, grapple: false };
    return {
      get tick() { return tick; },
      get done() { return tick >= 120; },
      player: fighter,
      rival: fighter,
      observe: () => ({ t: tick / 60, me: fighter, rival: fighter, dist: 2, bucket: 'close' as const, rivalPhase: 'idle' as const, mePhase: 'idle' as const }),
      step() {
        tick++;
        totalSteps++;
        // Knockdown occurs at tick 12 (0.2s)
        if (tick === 12) ev.push([0.2, 'knockdown', 0]);
      },
      result: () => ({ ev, t: tick / 60, out: 'draw' as const, ko: null, hp: [100, 100] as [number, number] }),
      dispose() {}
    };
  };

  const res = await runReproExperiment({
    seeds: [2000100],
    oracle: COMMON_ORACLE,
    report: 'common',
    build: 'recorded',
    chooser: 'fake',
    createSim: async () => fakeSimKnockdown(),
    choose: async () => ({ action: 'wait' as const, fallback: false })
  });

  assert.equal(res.report, 'common');
  assert.equal(res.oracleDescription, COMMON_ORACLE.description);
  const round = res.arms[0].rounds[0];
  assert.equal(round.matched, true);
  assert.equal(round.completed, true);
  assert.equal(round.tFirstMatch, 0.2);
  assert.equal(totalSteps, 12);
});

test('common oracle arms separate (recorded vs shipped tuning passed to sim)', async () => {
  const { runReproExperiment, COMMON_ORACLE } = await import('./reprobot');
  const tuningLog: { arm: string; tuning: Record<string, unknown> }[] = [];
  const fakeSimWithPlayer = () => {
    let tick = 0;
    const fighter = { hp: 100, posture: 0, x: 0, state: 'IDLE', facing: 1 as const, guarding: false, grappled: false, onGround: true, mount: false, ground: false, grapple: false };
    return {
      get tick() { return tick; },
      get done() { return tick >= 20; },
      player: fighter,
      rival: fighter,
      observe: () => ({ t: tick / 60, me: fighter, rival: fighter, dist: 2, bucket: 'close' as const, rivalPhase: 'idle' as const, mePhase: 'idle' as const }),
      step() { tick++; },
      result: () => ({ ev: [], t: tick / 60, out: 'draw' as const, ko: null, hp: [100, 100] as [number, number] }),
      dispose() {}
    };
  };

  const recordedTuning = { 'rules.knockdownRecovery': 1.5 };
  const shippedTuning = { 'rules.knockdownRecovery': 1.0 };
  const res = await runReproExperiment({
    seeds: [100, 101],
    oracle: COMMON_ORACLE,
    report: 'common',
    build: 'both',
    chooser: 'fake',
    recordedTuning,
    shippedTuning,
    createSim: async (seed, tuning) => {
      tuningLog.push({ arm: seed === 100 ? 's100' : 's101', tuning: tuning || {} });
      return fakeSimWithPlayer();
    },
    choose: async () => ({ action: 'advance' as const, fallback: false })
  });

  assert.equal(res.report, 'common');
  assert.equal(res.arms.length, 3);
  assert.equal(res.arms[0].build, 'recorded');
  assert.equal(res.arms[1].build, 'shipped');
  assert.equal(res.arms[2].build, 'scripted');

  assert.deepEqual(tuningLog[0].tuning, recordedTuning);
  assert.deepEqual(tuningLog[1].tuning, recordedTuning);
  assert.deepEqual(tuningLog[2].tuning, shippedTuning);
  assert.deepEqual(tuningLog[3].tuning, shippedTuning);
  assert.deepEqual(tuningLog[4].tuning, recordedTuning);
  assert.deepEqual(tuningLog[5].tuning, recordedTuning);
});

test('report field and oracle description recorded in result JSON for rare and common', async () => {
  const { runReproExperiment, COMMON_ORACLE } = await import('./reprobot');
  const makeSim = () => {
    let tick = 0;
    const fighter = { hp: 100, posture: 0, x: 0, state: 'IDLE', facing: 1 as const, guarding: false, grappled: false, onGround: true, mount: false, ground: false, grapple: false };
    return {
      get tick() { return tick; },
      get done() { return tick >= 12; },
      player: fighter,
      rival: fighter,
      observe: () => ({ t: tick / 60, me: fighter, rival: fighter, dist: 2, bucket: 'close' as const, rivalPhase: 'idle' as const, mePhase: 'idle' as const }),
      step() { tick++; },
      result: () => ({ ev: [], t: tick / 60, out: 'draw' as const, ko: null, hp: [100, 100] as [number, number] }),
      dispose() {}
    };
  };

  const commonRes = await runReproExperiment({
    seeds: [10],
    oracle: COMMON_ORACLE,
    report: 'common',
    build: 'recorded',
    chooser: 'fake',
    createSim: async () => makeSim(),
    choose: async () => ({ action: 'wait' as const, fallback: false })
  });
  assert.equal(commonRes.report, 'common');
  assert.equal(commonRes.oracleDescription, COMMON_ORACLE.description);

  const rareRes = await runReproExperiment({
    seeds: [10],
    oracle,
    report: 'rare',
    build: 'recorded',
    chooser: 'fake',
    createSim: async () => makeSim(),
    choose: async () => ({ action: 'wait' as const, fallback: false })
  });
  assert.equal(rareRes.report, 'rare');
  assert.equal(rareRes.oracleDescription, oracle.description);
});

test('FreshPlay renders both rare and common results when provided, with base-rate and arms meaning', async () => {
  const React = await import('react');
  const { createRequire } = await import('node:module');
  const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (node: import('react').ReactNode) => string };
  const { FreshPlay } = await import('../app/modes/repro/FreshPlay');

  const rareResults = {
    placeholder: false,
    report: 'rare' as const,
    chooser: 'local',
    model: 'gemma4:e4b-mlx',
    requestedRounds: 20,
    build: 'both',
    arms: [
      { build: 'recorded', reproduced: 0, completed: 20, calls: 383, cacheHits: 120, fallbacks: 89, rounds: [] },
      { build: 'shipped', reproduced: 0, completed: 20, calls: 159, cacheHits: 110, fallbacks: 53, rounds: [] },
      { build: 'scripted', reproduced: 0, completed: 20, calls: 0, cacheHits: 0, fallbacks: 0, rounds: [] }
    ],
    totals: { calls: 542, cacheHits: 230, fallbacks: 142 },
    aborted: false
  };

  const commonResults = {
    placeholder: false,
    report: 'common' as const,
    chooser: 'local',
    model: 'gemma4:e4b-mlx',
    requestedRounds: 20,
    build: 'both',
    arms: [
      { build: 'recorded', reproduced: 18, completed: 20, calls: 300, cacheHits: 100, fallbacks: 20, rounds: [] },
      { build: 'shipped', reproduced: 17, completed: 20, calls: 290, cacheHits: 110, fallbacks: 22, rounds: [] },
      { build: 'scripted', reproduced: 19, completed: 20, calls: 0, cacheHits: 0, fallbacks: 0, rounds: [] }
    ],
    totals: { calls: 590, cacheHits: 210, fallbacks: 42 },
    aborted: false
  };

  const html = renderToStaticMarkup(React.createElement(FreshPlay, { results: rareResults as any, commonResults: commonResults as any }));

  // Rare report assertions
  assert.ok(html.includes('Rare report'));
  assert.ok(html.includes('4 of 2,831'));
  assert.ok(html.includes('2.8%'));
  assert.ok(html.includes('0 of 20'));
  assert.match(html, /89 of 383/);
  assert.match(html, /53 of 159/);

  // Common report assertions
  assert.ok(html.includes('Common report'));
  assert.ok(html.includes('18 of 20'));
  assert.ok(html.includes('17 of 20'));
  assert.ok(html.includes('shipped and recorded builds should reproduce at similar rates'));
  assert.ok(html.includes('not a bug'));
});
