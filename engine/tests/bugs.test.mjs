// engine/bugs.mjs: clustering signature logic, ordering, representative choice, evidence timelines. Real child processes, real re-simulation.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { node, tmp, writeJson, writeJsonl, makeFixtureRun } from './helpers.mjs';
import { syntheticPersona } from '../policy.mjs';

const personas = Array.from({ length: 8 }, (_, i) => syntheticPersona(i));
const round = (p, rnd, seed, ev, over = {}) => ({ p, round: rnd, seed, tuning: 'base', out: 'loss', t: 12, hp: [0, 50], ko: { x: 1, t: 12 }, ev, dmg: [0, 0], maxCombo: 0, mood: { frustration: 0, boredom: 0 }, ...over });
const runBugs = (dir, labels) => {
  const r = node(['engine/bugs.mjs', '--dir', dir, ...(labels ? ['--labels', labels] : [])]);
  assert.equal(r.code, 0, r.stderr);
  return { clusters: JSON.parse(readFileSync(join(dir, 'bugs.json'), 'utf8')), stderr: r.stderr };
};
const sigs = cs => cs.map(c => c.signature);

let sdir, clusters;
before(() => {
  sdir = tmp('bugs-'); writeJson(join(sdir, 'personas.json'), personas);
  writeJsonl(join(sdir, 'runs.jsonl'), [
    round('p0000', 1, 101, [[1, 'hit', 0, 'JAB'], [2, 'airborne', 0]]),
    round('p0001', 1, 102, [[2, 'airborne', 0]]),
    round('p0002', 1, 103, [[1.5, 'oob', 1, 11.2], [2, 'oob', 1, 11.9]]),            // two oob events -> one kind
    round('p0003', 1, 104, [[1, 'oob', 0, -12.3]]),                                    // different who/arg, same cluster as above
    round('p0004', 1, 105, [[3, 'softlock', 0, 'stalemate'], [2, 'stuck', 0, 'KNOCKDOWN'], [2.5, 'airborne', 0]]), // sorted by kind order, not time
    round('p0005', 1, 106, [[2, 'stuck', 0, 'KNOCKDOWN']]),
    round('p0006', 1, 107, [[2, 'stuck', 0, 'DOWNED']]),                               // stuck in a different state = different cluster
    round('p0007', 1, 108, [[2, 'crash', 0, 'RuntimeError: unreachable in throwProp (props.js:303)']]),
    round('p0000', 2, 109, [[1, 'hit', 0, 'JAB'], [2, 'block', 1], [3, 'combo', 0, 3]]),   // no bug events at all -> ignored
    round('p0001', 2, 110, [[2, 'airborne', 0]]),
  ]);
  ({ clusters } = runBugs(sdir));
});

test('rounds are clustered by the SET of bug kinds (+ state for stuck, + message for crash); non-bug events are ignored', () => {
  assert.deepEqual(sigs(clusters).sort(), [
    'airborne', 'crash:RuntimeError: unreachable in throwProp (props.js:303)', 'oob', 'stuck:DOWNED', 'stuck:KNOCKDOWN', 'stuck:KNOCKDOWN+airborne+softlock',
  ].sort());
  assert.equal(clusters.reduce((s, c) => s + c.count, 0), 9, '10 rounds minus the clean one');
});

test('kinds inside a signature follow the fixed bug order, not event time', () => {
  assert.ok(sigs(clusters).includes('stuck:KNOCKDOWN+airborne+softlock'), 'event order was softlock, stuck, airborne');
});

test('repeated events of one kind count once; who/arg do not split a cluster', () => {
  const oob = clusters.find(c => c.signature === 'oob');
  assert.equal(oob.count, 2); assert.deepEqual(oob.rounds.map(r => r.p), ['p0002', 'p0003']);
});

test('clusters are ranked by size (stable for ties) and numbered bug1..bugN', () => {
  assert.deepEqual(clusters.map(c => c.id), clusters.map((_, i) => `bug${i + 1}`));
  assert.deepEqual(clusters.map(c => c.count), [...clusters.map(c => c.count)].sort((a, b) => b - a));
  assert.equal(clusters[0].signature, 'airborne'); assert.equal(clusters[0].count, 3);
  assert.deepEqual(clusters.slice(1, 3).map(c => c.signature), ['oob', 'stuck:KNOCKDOWN+airborne+softlock'], 'ties keep first-seen order (oob seen at p0002, the 3-kind round at p0004)');
});

test('each round entry keeps p, round, seed, label, t, out and the first bug event (array order)', () => {
  const c = clusters.find(c => c.signature === 'stuck:KNOCKDOWN+airborne+softlock');
  assert.deepEqual(c.rounds, [{ p: 'p0004', round: 1, seed: 105, label: 'base', t: 12, out: 'loss', firstBug: [3, 'softlock', 0, 'stalemate'] }]);
  assert.deepEqual(c.representative, c.rounds[0]);
});

test('the evidence timeline re-simulates the round: event rows and 10 Hz state rows around the first bug', () => {
  const c = clusters.find(c => c.signature === 'airborne');
  assert.ok(c.timeline.length > 10, `${c.timeline.length} rows`);
  const state = c.timeline.filter(r => / player\[/.test(r));
  assert.ok(state.length >= 6);
  for (const r of state) assert.match(r, /^\d+\.\d\ds player\[\w+ x=-?[\d.]+ y=-?[\d.]+ \w+.* hp=[\d.]+\] cpu\[\w+ x=.* hp=[\d.]+\] crates\[.*\] keys=\w+$/);
  const times = state.map(r => parseFloat(r));
  assert.ok(times[0] >= c.representative.firstBug[0] - 4 - 0.2 && times.at(-1) <= c.representative.firstBug[0] + 2.2, 'window is [first bug - 4 s, first bug + 2 s]');
});

test('a persona missing from personas.json degrades to "evidence unavailable" instead of aborting the run', () => {
  const d = tmp('bugs-missing-'); writeJson(join(d, 'personas.json'), personas.slice(0, 1));
  writeJsonl(join(d, 'runs.jsonl'), [round('p0005', 1, 5, [[2, 'oob', 0, 11]])]);
  const { clusters: cs } = runBugs(d);
  assert.equal(cs.length, 1);
  assert.equal(cs[0].timeline.length, 1); assert.match(cs[0].timeline[0], /^evidence unavailable: /);
});

test('no bug events at all: writes an empty list and says so', () => {
  const d = tmp('bugs-clean-'); writeJson(join(d, 'personas.json'), personas);
  writeJsonl(join(d, 'runs.jsonl'), [round('p0000', 1, 1, [[1, 'hit', 0, 'JAB']])]);
  const { clusters: cs, stderr } = runBugs(d);
  assert.deepEqual(cs, []); assert.match(stderr, /wrote 0 clusters to .*bugs\.json/);
});

test('a cluster keeps at most 8 example rounds but reports the full count', () => {
  const d = tmp('bugs-many-'); writeJson(join(d, 'personas.json'), personas);
  writeJsonl(join(d, 'runs.jsonl'), Array.from({ length: 11 }, (_, i) => round(`p000${i % 8}`, 1 + Math.floor(i / 8), 200 + i, [[1.5, 'oob', 1, 11]])));
  const { clusters: cs } = runBugs(d);
  assert.equal(cs[0].count, 11); assert.equal(cs[0].rounds.length, 8);
});

test('labels: patched-run bugs join the same clusters, the representative prefers the base label, missing label files are skipped', () => {
  const d = tmp('bugs-labels-'); writeJson(join(d, 'personas.json'), personas);
  writeJsonl(join(d, 'runs-sweep-nerf.jsonl'), [round('p0001', 1, 301, [[1.5, 'oob', 1, 11]], { tuning: 'sweep-nerf' })]);
  writeJsonl(join(d, 'runs.jsonl'), [round('p0002', 1, 302, [[1.5, 'oob', 1, 11]])]);
  const { clusters: cs } = runBugs(d, 'sweep-nerf,base,doesnotexist');
  assert.equal(cs.length, 1); assert.equal(cs[0].count, 2);
  assert.deepEqual(cs[0].rounds.map(r => r.label), ['sweep-nerf', 'base'], 'file order follows --labels');
  assert.equal(cs[0].representative.label, 'base');
  assert.equal(cs[0].representative.seed, 302);
  const only = runBugs(d, 'sweep-nerf').clusters;
  assert.equal(only[0].representative.label, 'sweep-nerf', 'no base round -> first round');
});

test('end to end on a real crowd run: the airborne rounds become one cluster with usable evidence; no crash cluster any more', () => {
  const d = tmp('bugs-real-'); makeFixtureRun(d);
  const { clusters: cs } = runBugs(d);
  assert.ok(!cs.some(c => c.signature.startsWith('crash:')), 'the props.js throwProp crash is fixed');
  const air = cs.find(c => c.signature === 'airborne');
  assert.equal(air.count, 2); assert.deepEqual(air.rounds.map(r => r.p).sort(), ['p0263', 'p0367']);
  assert.ok(air.timeline.some(r => / EVENT airborne by player/.test(r)), 'the evidence re-sim reproduces the bug event');
  assert.ok(existsSync(join(d, 'bugs.json')));
});

test('evidence for a round that crashes mid-way keeps the rows so far and ends with a CRASH row', () => {
  // Any exception in the step loop takes this path; a persona with a null rule throws on its first decision.
  const d = tmp('bugs-crashrow-'); writeJson(join(d, 'personas.json'), [{ ...syntheticPersona(0), rules: [null] }]);
  writeJsonl(join(d, 'runs.jsonl'), [round('p0000', 1, 9, [[1, 'crash', 0, 'TypeError: boom']])]);
  const { clusters: cs } = runBugs(d);
  assert.equal(cs[0].signature, 'crash:TypeError: boom');
  assert.match(cs[0].timeline.at(-1), /^CRASH Cannot read properties of null/);
});
