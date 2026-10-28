// Shared by engine/tests/*.test.mjs. Not a test file itself.
// One Rapier world per JS realm and a game crash poisons the WASM instance, so every *.test.mjs file runs in its own
// process (node --test does that) and anything that may crash is run through a child process.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSim, runRound } from '../sim.mjs';
import { createPolicy, syntheticPersona } from '../policy.mjs';
import { fighterFor, roundSeed } from '../crowd-worker-lib.mjs';

export const ROOT = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
export const BUG_CODES = ['crash', 'stuck', 'oob', 'nan', 'clip', 'airborne', 'softlock'];

/** Play one policy-driven round on a fresh sim and dispose it. Returns {res, sim}. */
export async function play(persona, seed, opts = {}) {
  const sim = await createSim({ seed, fighter: opts.fighter ?? fighterFor(persona.id), ...opts });
  const policy = createPolicy(persona, seed);
  const res = await runRound(sim, policy);
  if (!sim.crashed) sim.dispose();
  return { res, sim, policy };
}

/** Regression case: this round used to crash the game (Rapier "unreachable" in props.js throwProp when a carried crate had already shattered). */
export const CRASH_CASE = { persona: syntheticPersona(47), seed: roundSeed('p0047', 1, 1) };

export function tmp(prefix = 'sparring-test-') { return mkdtempSync(join(tmpdir(), prefix)); }
export function writeJson(path, v) { mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, JSON.stringify(v)); }
export function writeJsonl(path, rows) { mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, rows.map(r => JSON.stringify(r)).join('\n') + '\n'); }

/** Run `node <args>` from the repo root (the engine CLIs use cwd-relative paths). Never throws; returns {code, stdout, stderr}. */
export function node(args, opts = {}) {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8, ...opts });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}
export { execFileSync };

/** A small real crowd run on disk (3 personas, default seed 1 / 5 rounds): includes the former crash round (p0047 r1) and two airborne rounds (p0263 r1, p0367 r2). */
export function makeFixtureRun(dir) {
  writeJson(join(dir, 'personas.json'), [47, 263, 367].map(syntheticPersona));
  const r = node(['engine/crowd.mjs', '--personas', join(dir, 'personas.json'), '--out', dir, '--workers', '2']);
  if (r.code !== 0) throw new Error('fixture crowd failed: ' + r.stderr);
  return dir;
}
