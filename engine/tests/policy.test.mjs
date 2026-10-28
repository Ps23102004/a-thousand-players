import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, runRound, BIT, distBucket } from '../sim.mjs';
import { BASE, ARCH, createPolicy, syntheticPersona } from '../policy.mjs';
import { ACTIONS, ARCHETYPES } from '../../lib/types.ts';
import { startKnockdown, getGroundPrompt } from '../../game/src/ground.js';
import { beginGrapple, getGrapplePrompt } from '../../game/src/grapple.js';
import { play } from './helpers.mjs';

const WAIT_ALWAYS = { weights: { wait: 1e9 } };
const persona = (over = {}) => ({ ...syntheticPersona(1), id: 'ptest', archetype: 'casual', skill: 0.5, reaction_ticks: 12, rules: [], ...over });
const share = (w, k) => (w[k] ?? 0) / Object.values(w).reduce((s, x) => s + x, 0);
const top = w => Object.entries(w).sort((a, b) => b[1] - a[1])[0][0];

// ------------------------------------------------------------------ tables
test('archetype list and action vocabulary match lib/types.ts (the contract with the AI layer)', () => {
  assert.deepEqual([...ARCH].sort(), [...ARCHETYPES].sort());
  assert.deepEqual(Object.keys(BASE).sort(), [...ARCHETYPES].sort());
  for (const [arch, table] of Object.entries(BASE)) {
    assert.deepEqual(Object.keys(table).sort(), ['close', 'far', 'mid'], arch);
    for (const [bucket, w] of Object.entries(table)) {
      const total = Object.values(w).reduce((s, x) => s + x, 0);
      assert.ok(total > 0 && total < 40, `${arch}/${bucket} total weight ${total} is a sane small table`);
      for (const [action, weight] of Object.entries(w)) { assert.ok(ACTIONS.includes(action), `${arch}/${bucket}: unknown action ${action}`); assert.ok(Number.isFinite(weight) && weight > 0 && weight <= 9, `${arch}/${bucket}/${action}=${weight}`); }
    }
  }
});

test('archetype tables express the archetype: who advances, blocks, sweeps, kicks', () => {
  assert.ok(share(BASE.rusher.far, 'advance') === 1, 'rusher always closes distance');
  assert.equal(top(BASE.turtle.close), 'block'); assert.equal(top(BASE.turtle.mid), 'block');
  assert.equal(top(BASE.cheeser.mid), 'sweep'); assert.equal(top(BASE.cheeser.close), 'sweep');
  assert.equal(top(BASE.masher.close), 'punch');
  assert.equal(top(BASE.speedrunner.close), 'kick');
  assert.ok(BASE.speedrunner.far.advance / Object.values(BASE.speedrunner.far).reduce((a, b) => a + b, 0) > 0.8);
  assert.ok(BASE.explorer.mid.prop > 0, 'explorer uses crates'); assert.equal(BASE.rusher.mid.prop, undefined);
  assert.ok(share(BASE.casual.far, 'wait') + share(BASE.casual.mid, 'wait') > 0.5, 'casuals idle a lot');
  assert.ok(share(BASE.turtle.mid, 'block') > share(BASE.rusher.mid, 'block'));
  for (const a of ['turtle', 'learner']) assert.ok(BASE[a].mid.parry > 0, `${a} parries`);
  assert.ok(share(BASE.turtle.close, 'block') > 0.4);
});

test('syntheticPersona: deterministic, ids/archetypes cycle, fields within the Persona contract', () => {
  assert.deepEqual(syntheticPersona(5), syntheticPersona(5));
  assert.notDeepEqual(syntheticPersona(5), syntheticPersona(6));
  for (let i = 0; i < 64; i++) {
    const p = syntheticPersona(i);
    assert.equal(p.id, 'p' + String(i).padStart(4, '0'));
    assert.equal(p.archetype, ARCH[i % 8]);
    assert.ok(p.skill >= 0.2 && p.skill <= 0.95, `skill ${p.skill}`);
    assert.ok(Number.isInteger(p.reaction_ticks) && p.reaction_ticks >= 8 && p.reaction_ticks < 36);
    assert.ok(p.patience >= 0 && p.patience <= 1 && p.frustration_tolerance >= 0 && p.frustration_tolerance <= 1);
    assert.deepEqual(p.rules, []); assert.equal(typeof p.bio, 'string');
  }
  assert.equal(new Set(Array.from({ length: 64 }, (_, i) => syntheticPersona(i).id)).size, 64);
});

// ------------------------------------------------------------------ determinism
test('same persona and seed give identical action streams and key presses; seed or persona id changes them', async () => {
  const p = syntheticPersona(12), seed = 4711;
  const a = await play(p, seed, { maxT: 30 }), b = await play(p, seed, { maxT: 30 });
  assert.deepEqual(a.res.inputs, b.res.inputs);
  assert.deepEqual(a.policy.actions, b.policy.actions);
  assert.equal(a.res.hash, b.res.hash);
  assert.ok(Object.keys(a.policy.actions).length >= 3, 'uses several actions');
  const other = await play(p, seed + 1, { maxT: 30 });
  assert.notDeepEqual(other.res.inputs, a.res.inputs);
  const renamed = await play({ ...p, id: 'p9999' }, seed, { maxT: 30, fighter: 'kai' });
  assert.notDeepEqual(renamed.res.inputs, a.res.inputs, 'the persona id is mixed into the rng');
});

test('the policy never mutates the persona it was given', () => {
  const p = persona({ rules: [{ dist: 'far', weights: { jump: 3 } }, { weights: { wait: 1 } }] });
  const copy = structuredClone(p);
  createPolicy(p, 5);
  assert.deepEqual(p, copy);
});

// ------------------------------------------------------------------ rule overrides
async function idleRun(p, seed = 1, maxT = 10) {
  const sim = await createSim({ seed, maxT, rivalAI: false });
  const policy = createPolicy(p, seed), masks = [];
  await runRound(sim, { step: s => { const m = policy.step(s); masks.push(m); return m; } });
  sim.dispose();
  return { policy, masks, sim };
}

test('a catch-all rule with a huge "wait" weight makes the persona stand still (no keys at all)', async () => {
  for (const archetype of ['rusher', 'masher', 'turtle']) {
    const { policy, masks } = await idleRun(persona({ archetype, rules: [WAIT_ALWAYS] }));
    assert.deepEqual(masks.filter(Boolean), [], archetype);
    const n = Object.values(policy.actions).reduce((s, x) => s + x, 0);
    assert.ok(policy.actions.wait / n > 0.99, `${archetype}: ${JSON.stringify(policy.actions)}`);
    assert.equal(policy.lastAction, 'wait');
  }
});

test('without that rule the same personas do press keys (control for the test above)', async () => {
  const { masks } = await idleRun(persona({ archetype: 'rusher', rules: [] }), 1, 4);
  assert.ok(masks.some(m => m !== 0));
});

test('a rule can force a single action: advance moves toward the rival, retreat away, block holds shift', async () => {
  const advance = await idleRun(persona({ rules: [{ weights: { advance: 1e9 } }] }), 1, 1);
  assert.ok(advance.masks.every(m => m === BIT.KeyD), 'player faces right, advance = D');
  const retreat = await idleRun(persona({ rules: [{ weights: { retreat: 1e9 } }] }), 1, 1);
  assert.ok(retreat.masks.every(m => m === BIT.KeyA));
  const block = await idleRun(persona({ rules: [{ weights: { block: 1e9 } }] }), 1, 1);
  assert.ok(block.masks.every(m => m === BIT.ShiftLeft));
  const lowPunch = await idleRun(persona({ rules: [{ weights: { low_punch: 1e9 } }] }), 1, 0.2);
  assert.ok(lowPunch.masks.some(m => m === (BIT.KeyS | BIT.KeyJ)), 'low punch = crouch + J');
  assert.ok(lowPunch.masks.every(m => (m & BIT.KeyS) === BIT.KeyS));
  const sweep = await idleRun(persona({ rules: [{ weights: { sweep: 1e9 } }] }), 1, 0.2);
  assert.ok(sweep.masks.some(m => m === (BIT.KeyS | BIT.KeyK)));
  const map = { punch: BIT.KeyJ, kick: BIT.KeyK, parry: BIT.KeyL, grab: BIT.KeyF, jump: BIT.KeyW, prop: BIT.KeyE };
  for (const [action, bit] of Object.entries(map)) {
    const r = await idleRun(persona({ rules: [{ weights: { [action]: 1e9 } }] }), 1, 0.1);
    assert.ok(r.masks.includes(bit), `${action} presses its key`);
    assert.ok(r.masks.every(m => m === 0 || m === bit), `${action} presses only its key`);
  }
});

test('rules apply by specificity: a dist-specific rule beats a catch-all one regardless of listing order', async () => {
  // The sim starts at ~2.0 units = "mid". Specific rule is listed FIRST; if order mattered, the later catch-all would win.
  const specific = { dist: 'mid', weights: { kick: 0, wait: 1e9 } }, general = { weights: { kick: 1e9 } };
  const sim0 = await createSim({ seed: 1, maxT: 1 }); assert.equal(sim0.observe().bucket, 'mid'); sim0.dispose();
  const { masks } = await idleRun(persona({ rules: [specific, general] }), 1, 0.05);
  assert.ok(masks.every(m => m === 0), 'dist-specific rule applied last');
  const reversed = await idleRun(persona({ rules: [general, specific] }), 1, 0.05);
  assert.deepEqual(reversed.masks, masks);
  // A rule for a different distance does not apply here (casual has no jump in its mid table).
  const far = await idleRun(persona({ rules: [{ dist: 'far', weights: { jump: 1e9 } }, { dist: 'close', weights: { jump: 1e9 } }] }), 1, 3);
  assert.ok(!far.masks.includes(BIT.KeyW) || far.policy.actions.jump < 5, 'jump rule only fires when the bucket matches');
});

test('a rival-phase rule only applies when the rival is in that phase; both fields set = most specific', async () => {
  const idleRival = await idleRun(persona({ rules: [{ rival: 'recovery', weights: { wait: 1e9 } }, { rival: 'idle', dist: 'mid', weights: { jump: 1e9 } }] }), 1, 0.05);
  assert.ok(idleRival.masks.includes(BIT.KeyW), 'rival is idle at the start so the idle rule fired');
  assert.equal(idleRival.policy.actions.wait ?? 0, 0, 'the recovery rule did not');
});

test('all-zero weights fall back to "wait"', async () => {
  const zero = Object.fromEntries(['advance', 'block', 'retreat', 'punch', 'parry', 'kick', 'grab', 'wait', 'jump', 'sweep', 'low_punch', 'prop'].map(k => [k, 0]));
  const { policy, masks } = await idleRun(persona({ archetype: 'turtle', skill: 0, rules: ['far', 'mid', 'close'].map(dist => ({ dist, weights: zero })) }), 1, 5);
  assert.deepEqual(masks.filter(Boolean), []);
  assert.deepEqual(Object.keys(policy.actions), ['wait']);
});

test('an unknown archetype falls back to the casual table instead of throwing', async () => {
  const { policy } = await idleRun(persona({ archetype: 'wizard' }), 1, 5);
  assert.ok(Object.keys(policy.actions).length > 0);
  const casual = await idleRun(persona({ archetype: 'casual' }), 1, 5);
  assert.deepEqual(policy.actions, casual.policy.actions, 'same rng, same table');
});

// ------------------------------------------------------------------ timing
test('reaction_ticks sets the decision rate; the minimum gap is 4 ticks', async () => {
  const decisions = async rt => { const { policy } = await idleRun(persona({ reaction_ticks: rt, rules: [WAIT_ALWAYS] }), 3, 20); return Object.values(policy.actions).reduce((s, x) => s + x, 0); };
  assert.equal(await decisions(1), 300, '1200 ticks / floor of 4 ticks per decision');
  const [d8, d20, d40] = [await decisions(8), await decisions(20), await decisions(40)];
  assert.ok(d8 >= 125 && d8 <= 190, `rt=8 -> ${d8}`);
  assert.ok(d20 >= 50 && d20 <= 76, `rt=20 -> ${d20}`);
  assert.ok(d40 >= 25 && d40 <= 38, `rt=40 -> ${d40}`);
  assert.ok(d8 > d20 && d20 > d40);
});

// ------------------------------------------------------------------ reactivity
test('reactive archetypes block when the rival attacks; masher barely does (REACTIVITY x skill)', async () => {
  async function blockShare(archetype, skill) {
    let hits = 0, blocks = 0;
    for (let k = 0; k < 6; k++) {
      const seed = 100 + k, sim = await createSim({ seed, maxT: 40 });
      const policy = createPolicy(persona({ archetype, skill, reaction_ticks: 8 }), seed);
      let n = 0;
      await runRound(sim, { step: s => {
        const o = s.observe(), before = n, m = policy.step(s);
        n = Object.values(policy.actions).reduce((a, b) => a + b, 0);
        if (n > before && (o.rivalPhase === 'startup' || o.rivalPhase === 'active') && o.dist < 2.0 && !s.player.mount && !s.player.ground && !s.player.grapple) { hits++; if (policy.lastAction === 'block' || policy.lastAction === 'parry' || policy.lastAction === 'retreat') blocks++; }
        return m;
      } });
      sim.dispose();
    }
    return { hits, share: blocks / Math.max(1, hits) };
  }
  const turtle = await blockShare('turtle', 1), masher = await blockShare('masher', 1);
  assert.ok(turtle.hits >= 10 && masher.hits >= 10, `samples ${turtle.hits}/${masher.hits}`);
  assert.ok(turtle.share > 0.6, `turtle defends ${turtle.share}`);
  assert.ok(turtle.share > masher.share + 0.3, `turtle ${turtle.share} vs masher ${masher.share}`);
});

// ------------------------------------------------------------------ prompts (ground / clinch): skill-based accuracy and reaction delay
const waitPersona = over => persona({ rules: [WAIT_ALWAYS], ...over }); // no free-standing key taps, so the first mask is the prompt answer

async function groundPromptRuns(n, over) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const seed = 900 + k, sim = await createSim({ seed, maxT: 4, rivalAI: false }), policy = createPolicy(waitPersona(over), seed);
    let want = null, seen = null, first = null;
    await runRound(sim, { step: s => {
      if (s.tick === 10) startKnockdown(s.player, { rng: () => k / n, landed: true });
      const pr = getGroundPrompt(s.player); if (pr && !want) { want = pr; seen = s.tick; }
      const m = policy.step(s); if (want && !first && m) first = { m, delay: s.tick - seen };
      return m;
    } });
    sim.dispose();
    out.push({ want, first });
  }
  return out;
}

test('GET BACK UP prompt: skill 1 always hits the required key, skill 0 only about 35% of the time', async () => {
  const n = 40;
  const hi = await groundPromptRuns(n, { skill: 1, reaction_ticks: 10 }), lo = await groundPromptRuns(n, { skill: 0, reaction_ticks: 10 });
  const right = rs => rs.filter(r => r.first && r.first.m === BIT['Key' + r.want.key]).length;
  assert.ok(hi.every(r => r.want.phase === 'CONTEST' && r.want.role === 'DEFENDER' && r.first), 'every run saw a CONTEST prompt and answered');
  assert.equal(right(hi), n);
  assert.ok(right(lo) >= 0.15 * n && right(lo) <= 0.6 * n, `skill 0 got ${right(lo)}/${n}`);
  assert.ok(lo.every(r => ['KeyJ', 'KeyK', 'KeyL'].some(k => r.first.m === BIT[k])), 'a miss is still one of J/K/L');
  const needed = new Set(hi.map(r => r.want.key));
  assert.ok(needed.size > 1, `prompt keys vary: ${[...needed]}`);
});

test('prompt reaction delay: at least 3 ticks, roughly 0.8..1.3 x reaction_ticks', async () => {
  const fast = await groundPromptRuns(10, { skill: 1, reaction_ticks: 2 });
  assert.ok(fast.every(r => r.first.delay === 3), `delays ${fast.map(r => r.first.delay)}`);
  const slow = await groundPromptRuns(10, { skill: 1, reaction_ticks: 40 });
  for (const r of slow) assert.ok(r.first.delay >= 32 && r.first.delay <= 52, `delay ${r.first.delay}`);
});

async function answerMasks() {
  const seed = 5, sim = await createSim({ seed, maxT: 3, rivalAI: false }), policy = createPolicy(waitPersona({ skill: 1, reaction_ticks: 4 }), seed), masks = [];
  await runRound(sim, { step: s => { if (s.tick === 10) startKnockdown(s.player, { rng: () => 0.1, landed: true }); const m = policy.step(s); masks.push([s.tick, m, s.player.state]); return m; } });
  sim.dispose();
  return masks.filter(r => r[1]);
}

test('a correct prompt answer is tapped on the prompt tick (rng 0.1 -> required key J)', async () => {
  const pressed = await answerMasks();
  assert.equal(pressed[0][1], BIT.KeyJ);
  assert.equal(pressed[0][2], 'DOWNED');
});

test('BUG: the prompt answer must not be pressed again once the prompt is over', { todo: 'policy.mjs: tapLeft/tap survive the prompt phase (the prompt closes after 1 tick, tapLeft stays 1) and leak as a stray key ~35 ticks later, the first free-standing tick' }, async () => {
  const pressed = await answerMasks();
  assert.equal(pressed.length, 1, `extra presses: ${JSON.stringify(pressed.slice(1))}`);
});

test('clinch CHOOSE prompt: attacker picks J/K/F (never release); aggressive archetypes pick strikes more than F-first ones', async () => {
  async function firstKeys(archetype, n) {
    const keys = [];
    for (let k = 0; k < n; k++) {
      const seed = 300 + k, sim = await createSim({ seed, maxT: 3, rivalAI: false }), policy = createPolicy(waitPersona({ archetype, skill: 1, reaction_ticks: 6 }), seed);
      let done = false;
      await runRound(sim, { step: s => {
        if (s.tick === 5) { s.rival.rigidBody.setTranslation({ x: s.player.rigidBody.translation().x + 0.9, y: s.player.rigidBody.translation().y, z: 0 }, true); }
        if (s.tick === 8) assert.ok(beginGrapple(s.player, s.rival, { rng: () => 0.5 }), 'clinch started');
        if (s.tick === 8) assert.equal(getGrapplePrompt(s.player).choices, 'J / K / F / L');
        const m = policy.step(s);
        if (m && s.tick > 8 && !done) { done = true; keys.push(Object.keys(BIT).find(key => BIT[key] === m)); }
        return m;
      } });
      sim.dispose();
    }
    return keys;
  }
  const rusher = await firstKeys('rusher', 60), turtle = await firstKeys('turtle', 60);
  for (const k of [...rusher, ...turtle]) assert.ok(['KeyJ', 'KeyK', 'KeyF'].includes(k), k);
  const f = ks => ks.filter(k => k === 'KeyF').length / ks.length, j = ks => ks.filter(k => k === 'KeyJ').length / ks.length;
  assert.ok(f(turtle) > f(rusher), `turtle F ${f(turtle)} vs rusher F ${f(rusher)}`);
  assert.ok(j(rusher) > j(turtle), `rusher J ${j(rusher)} vs turtle J ${j(turtle)}`);
});
