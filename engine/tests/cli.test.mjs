// check-round.mjs, inspect.mjs, token.mjs: the single-round CLIs, run as real child processes on a real small crowd run.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { node, tmp, makeFixtureRun, writeJson, CRASH_CASE } from './helpers.mjs';
import { createSim, runRound } from '../sim.mjs';
import { createPolicy, syntheticPersona } from '../policy.mjs';
import { fighterFor } from '../crowd-worker-lib.mjs';

const dir = tmp('cli-');
let runs;
before(() => { makeFixtureRun(dir); runs = readFileSync(join(dir, 'runs.jsonl'), 'utf8').trim().split('\n').map(JSON.parse); });
const line = (p, round) => runs.find(r => r.p === p && r.round === round);
const decode = url => JSON.parse(Buffer.from(new URL(url).searchParams.get('t').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());

test('check-round replays one recorded round and reports the same outcome and bug kinds', () => {
  for (const [p, round, bug] of [['p0609', 3, 'airborne'], ['p0686', 1, 'airborne']]) {
    const rec = line(p, round);
    const r = node(['engine/check-round.mjs', JSON.stringify({ p, round, seed: rec.seed, label: 'base' }), dir]);
    assert.equal(r.code, 0, r.stderr);
    const out = JSON.parse(r.stdout.trim().split('\n').pop());
    assert.deepEqual([out.p, out.round, out.seed, out.out, out.t, out.hp], [p, round, rec.seed, rec.out, rec.t, rec.hp], `${p} r${round} replays as recorded`);
    assert.ok(out.bugs.includes(bug), `${p}: ${out.bugs}`);
    assert.equal(out.crash, null);
  }
});

test('check-round on a clean round reports no bugs and crash null', () => {
  const rec = runs.find(r => !r.ev.some(e => ['crash', 'stuck', 'oob', 'nan', 'clip', 'airborne', 'softlock'].includes(e[1])));
  const out = JSON.parse(node(['engine/check-round.mjs', JSON.stringify({ p: rec.p, round: rec.round, seed: rec.seed, label: 'base' }), dir]).stdout.trim());
  assert.deepEqual(out.bugs, []); assert.equal(out.crash, null);
});

test('check-round applies a labelled patch tuning from data/patches/<label>.json', () => {
  const rec = line('p0047', 1), cfg = JSON.parse(readFileSync(new URL('../../data/patches/sweep-nerf.json', import.meta.url), 'utf8'));
  assert.ok(Object.keys(cfg).length > 0);
  const base = JSON.parse(node(['engine/check-round.mjs', JSON.stringify({ p: 'p0047', round: 1, seed: rec.seed, label: 'base' }), dir]).stdout.trim());
  const patched = JSON.parse(node(['engine/check-round.mjs', JSON.stringify({ p: 'p0047', round: 1, seed: rec.seed, label: 'sweep-nerf' }), dir]).stdout.trim());
  assert.equal(patched.label, 'sweep-nerf');
  assert.ok(patched.out !== base.out || patched.t !== base.t || patched.hp.join() !== base.hp.join(), 'the tuning changes this round');
});

test('check-round with an unknown persona fails loudly', () => {
  const r = node(['engine/check-round.mjs', JSON.stringify({ p: 'nobody', round: 1, seed: 1, label: 'base' }), dir]);
  assert.notEqual(r.code, 0);
});

test('inspect prints a 2 Hz timeline and MATCH when the replay equals the recorded round', () => {
  const r = node(['engine/inspect.mjs', 'p0686', '1', '--dir', dir, '--from', '5', '--to', '7']);
  assert.equal(r.code, 0, r.stderr);
  const rows = r.stdout.trim().split('\n');
  assert.match(rows.at(-1), /^recorded (win|loss|draw) [\d.]+ \[.*\] \| replayed \w+ [\d.]+ \[.*\] MATCH$/);
  const timeline = rows.slice(0, -1);
  assert.ok(timeline.length >= 4 && timeline.length <= 5, `${timeline.length} rows for a 2 s window at 2 Hz`);
  assert.match(timeline[0], /^\s*5\.00 P .* \| R .* \| props /);
});

test('inspect and token exit 1 with "not found" for an unknown persona or round', () => {
  for (const args of [['engine/inspect.mjs', 'pXXXX', '1', '--dir', dir], ['engine/inspect.mjs', 'p0609', '99', '--dir', dir], ['engine/token.mjs', 'pXXXX', '1', '--dir', dir], ['engine/token.mjs', 'p0609', '99', '--dir', dir]]) {
    const r = node(args);
    assert.equal(r.code, 1, args.join(' ')); assert.match(r.stderr, /not found/);
  }
});

test('token emits a replay URL whose payload carries seed, fighter, persona and the headless hash', async () => {
  const rec = line('p0609', 3);
  const r = node(['engine/token.mjs', 'p0609', '3', '--dir', dir, '--base', 'http://example.test']);
  assert.equal(r.code, 0, r.stderr);
  const url = r.stdout.trim();
  assert.match(url, /^http:\/\/example\.test\/game\/replay\.html\?t=[A-Za-z0-9_-]+$/, 'base64url, no padding');
  const tok = decode(url);
  assert.deepEqual(Object.keys(tok), ['seed', 'tuning', 'fighter', 'maxT', 'persona', 'exp']);
  assert.equal(tok.seed, rec.seed); assert.equal(tok.tuning, null); assert.equal(tok.maxT, 99);
  assert.equal(tok.fighter, fighterFor('p0609'));
  assert.deepEqual(tok.persona, syntheticPersona(609));
  assert.deepEqual([tok.exp.out, tok.exp.t], [rec.out, rec.t]);
  assert.match(r.stderr, new RegExp(`headless: ${rec.out} at ${rec.t}s hash ${tok.exp.hash} \\(recorded ${rec.out} at ${rec.t}s\\)`));
  // The hash in the token is exactly what a fresh in-process sim of that token produces.
  const sim = await createSim({ seed: tok.seed, fighter: tok.fighter, tuning: tok.tuning });
  const res = await runRound(sim, createPolicy(tok.persona, tok.seed)); sim.dispose();
  assert.equal(res.hash, tok.exp.hash);
});

test('token --tuning embeds the tuning and stamps the hash of the tuned round; --label reads runs-<label>.jsonl', () => {
  const tuning = { 'rules.mountReleaseFix': 0 };
  writeJson(join(dir, 'tune.json'), tuning);
  const a = decode(node(['engine/token.mjs', 'p0609', '3', '--dir', dir, '--tuning', join(dir, 'tune.json')]).stdout.trim());
  assert.deepEqual(a.tuning, tuning);
  const none = node(['engine/token.mjs', 'p0609', '3', '--dir', dir, '--label', 'missing']);
  assert.notEqual(none.code, 0, 'no runs-missing.jsonl');
});

test('the former crash round (p0047 r1, base seed 1) replays cleanly through check-round', async () => {
  const out = JSON.parse(node(['engine/check-round.mjs', JSON.stringify({ p: 'p0047', round: 1, seed: CRASH_CASE.seed, label: 'base' }), dir]).stdout.trim());
  assert.equal(out.crash, null); assert.ok(!out.bugs.includes('crash'));
  const sim = await createSim({ seed: CRASH_CASE.seed, fighter: fighterFor('p0047') });
  const res = await runRound(sim, createPolicy(CRASH_CASE.persona, CRASH_CASE.seed)); sim.dispose();
  assert.deepEqual([out.out, out.t], [res.out, res.t]);
});
