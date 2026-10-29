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
  const { readFileSync } = await import('node:fs');
  const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as { renderToStaticMarkup: (node: import('react').ReactNode) => string };
  const { FreshPlay } = await import('../app/modes/repro/FreshPlay');
  const committed = JSON.parse(readFileSync(new URL('../data/reprobot/results.json', import.meta.url), 'utf8'));
  const html = renderToStaticMarkup(React.createElement(FreshPlay, { results: committed }));
  assert.ok(html.includes('2 of 20 planned rounds'), `expected "2 of 20 planned rounds" in output, got: ${html}`);
  assert.doesNotMatch(html, /\{results\./);
  assert.ok(html.includes('0 of 1 completed fresh rounds'));

  // Consistency: count matched rounds among completed ones
  const mixed = {
    ...committed,
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
      rounds: [
        { seed: 2000000, matched: true, tFirstMatch: 1.2, completed: false, nanoCalls: 10, cacheHits: 0, fallbacks: 0 },
      ],
      reproduced: 1,
      totals: { nanoCalls: 10, cacheHits: 0, fallbacks: 0 },
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
