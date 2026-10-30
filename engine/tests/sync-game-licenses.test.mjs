// engine/tests/sync-game-licenses.test.mjs: verify scripts/sync-game.mjs copies vendor licenses into public/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, node } from './helpers.mjs';

test('scripts/sync-game.mjs copies vendor licenses alongside vendored bundles', () => {
  const syncSrc = readFileSync(join(ROOT, 'scripts/sync-game.mjs'), 'utf8');
  assert.match(
    syncSrc,
    /game\/vendor\/three\/LICENSE/,
    'scripts/sync-game.mjs must copy game/vendor/three/LICENSE'
  );
  assert.match(
    syncSrc,
    /game\/vendor\/rapier\/LICENSE/,
    'scripts/sync-game.mjs must copy game/vendor/rapier/LICENSE'
  );
});

test('running sync-game places valid LICENSE files in public/game/vendor/', () => {
  const r = node(['scripts/sync-game.mjs']);
  assert.equal(r.code, 0, r.stderr);

  const threeLicPath = join(ROOT, 'public/game/vendor/three/LICENSE');
  const rapierLicPath = join(ROOT, 'public/game/vendor/rapier/LICENSE');

  assert.ok(existsSync(threeLicPath), 'public/game/vendor/three/LICENSE must exist');
  assert.ok(existsSync(rapierLicPath), 'public/game/vendor/rapier/LICENSE must exist');

  const expectedThree = readFileSync(join(ROOT, 'game/vendor/three/LICENSE'), 'utf8');
  const expectedRapier = readFileSync(join(ROOT, 'game/vendor/rapier/LICENSE'), 'utf8');

  assert.equal(readFileSync(threeLicPath, 'utf8'), expectedThree);
  assert.equal(readFileSync(rapierLicPath, 'utf8'), expectedRapier);
});
