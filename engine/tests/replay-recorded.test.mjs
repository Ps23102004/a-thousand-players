// The determinism contract against the shipped dataset: rounds recorded in data/run-main replay exactly
// (with the tuning the data was recorded with, data/run-main/meta.json "recordedWith").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createSim, runRound } from '../sim.mjs';
import { createPolicy } from '../policy.mjs';
import { fighterFor } from '../crowd-worker-lib.mjs';
import { ROOT, BUG_CODES } from './helpers.mjs';

const dir = `${ROOT}/data/run-main`, have = existsSync(`${dir}/runs.jsonl`) && existsSync(`${dir}/personas.json`);
const skip = have ? false : 'data/run-main not present';
const read = f => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
const lines = have ? readFileSync(`${dir}/runs.jsonl`, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(r => !r.live && !('quit' in r)) : [];
const personas = have ? Object.fromEntries(read('personas.json').map(p => [p.id, p])) : {};
const tuning = have && existsSync(`${dir}/meta.json`) ? read('meta.json').recordedWith ?? null : null;
const isBug = r => r.ev.some(e => BUG_CODES.includes(e[1]));

async function replay(r, t = tuning) {
  const sim = await createSim({ seed: r.seed, fighter: fighterFor(r.p), tuning: t });
  const res = await runRound(sim, createPolicy(personas[r.p], r.seed));
  if (!sim.crashed) sim.dispose();
  return { res, sim };
}

test('recorded rounds replay exactly: outcome, duration, hp, KO and the full event list', { skip }, async () => {
  const bug = lines.filter(r => isBug(r) && r.tuning === 'base').slice(0, 4), clean = lines.filter(r => !isBug(r) && r.tuning === 'base').filter((_, i) => i % 701 === 3).slice(0, 4);
  assert.ok(bug.length > 0 && clean.length > 0);
  for (const r of [...bug, ...clean]) {
    const { res, sim } = await replay(r);
    const tag = `${r.p} r${r.round} seed ${r.seed}`;
    if (sim.crashed) { assert.ok(r.ev.some(e => e[1] === 'crash'), `${tag}: unexpected crash ${sim.crashed}`); break; }
    assert.deepEqual([res.out, res.t, res.hp, res.ko], [r.out, r.t, r.hp, r.ko], tag);
    assert.deepEqual(res.ev, r.ev, tag);
    assert.deepEqual(res.dmg, r.dmg, tag); assert.equal(res.maxCombo, r.maxCombo, tag);
  }
});

test('the bug the data was recorded with is gone under today\'s default tuning (mount-release fix), and back with recordedWith', { skip: skip || !tuning ? 'needs data/run-main/meta.json recordedWith' : false }, async () => {
  const r = lines.find(l => l.ev.some(e => e[1] === 'airborne') && l.tuning === 'base');
  assert.ok(r);
  const recorded = (await replay(r, tuning)).res, today = (await replay(r, null)).res;
  assert.ok(recorded.ev.some(e => e[1] === 'airborne'), 'still reproduces with the recorded tuning');
  assert.notEqual(recorded.hash, today.hash, 'today\'s default engine plays this round differently');
});

test('sweep-nerf patch run: recorded rounds replay with data/patches/sweep-nerf.json', { skip: skip || !existsSync(`${dir}/runs-sweep-nerf.jsonl`) ? 'no sweep-nerf run' : false }, async () => {
  const patch = JSON.parse(readFileSync(`${ROOT}/data/patches/sweep-nerf.json`, 'utf8'));
  const patched = readFileSync(`${dir}/runs-sweep-nerf.jsonl`, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(r => !('quit' in r) && !isBug(r)).slice(0, 3);
  assert.equal(patched.length, 3);
  for (const r of patched) {
    const { res } = await replay(r, { ...tuning, ...patch });
    assert.deepEqual([res.out, res.t, res.hp], [r.out, r.t, r.hp], `${r.p} r${r.round}`);
    assert.deepEqual(res.ev, r.ev);
  }
});
