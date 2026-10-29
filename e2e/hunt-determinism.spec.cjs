// Browser vs Node determinism: the same seeds simulated headless inside the browser (the replay page's own
// three/Rapier builds via its importmap) must hash exactly like Node. HUNT_DET_SEEDS (default 6) and
// HUNT_DET_MAXT (default 15) match engine/tests/hunt-determinism.test.mjs; the bug hunt ran 50 seeds x 99 s.
const { test, expect } = require("playwright/test");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const N = +(process.env.HUNT_DET_SEEDS || 6), MAXT = +(process.env.HUNT_DET_MAXT || 15);

test(`${N} seeds: browser re-simulation hashes equal Node's`, async ({ page }) => {
  test.setTimeout(600_000);
  const root = path.join(__dirname, "..");
  const nodeHashes = JSON.parse(execFileSync(process.execPath, ["engine/tests/hunt-determinism.test.mjs", "--hashes"], {
    cwd: root, encoding: "utf8", env: { ...process.env, HUNT_DET_SEEDS: String(N), HUNT_DET_MAXT: String(MAXT) },
  }).trim().split("\n").pop());

  // No token: the page stops before creating a sim, but its importmap (three, Rapier) is in place.
  await page.goto("/game/replay.html");
  const browserHashes = await page.evaluate(async ({ n, maxT }) => {
    const { createSim, runRound } = await import("/engine/sim.mjs");
    const { createPolicy, syntheticPersona } = await import("/engine/policy.mjs");
    const { fighterFor, roundSeed } = await import("/engine/crowd-worker-lib.mjs");
    const out = {};
    for (let i = 0; i < n; i++) { // same cases as engine/tests/hunt-determinism.test.mjs
      const persona = syntheticPersona(i * 19 + 3), seed = roundSeed(persona.id, 1, 2027);
      const sim = await createSim({ seed, fighter: fighterFor(persona.id), maxT });
      const res = await runRound(sim, createPolicy(persona, seed)); if (!sim.crashed) sim.dispose();
      out[seed] = res.hash;
    }
    return out;
  }, { n: N, maxT: MAXT });

  const diff = Object.keys(nodeHashes).filter((s) => nodeHashes[s] !== browserHashes[s]);
  test.info().annotations.push({ type: "compared", description: `${Object.keys(nodeHashes).length} seeds, ${diff.length} differ` });
  expect(Object.keys(browserHashes).length).toBe(N);
  expect(diff.map((s) => ({ seed: s, node: nodeHashes[s], browser: browserHashes[s] }))).toEqual([]);
});
