// Copies the game + engine into public/ so Next.js serves /game/replay.html and /game/index.html.
// Vendors three and Rapier from node_modules: the browser replay must run the exact WASM build the headless engine ran.
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const r = p => new URL('../' + p, import.meta.url);
for (const d of ['public/game', 'public/engine']) rmSync(r(d), { recursive: true, force: true });
cpSync(r('game/src'), r('public/game/src'), { recursive: true });
for (const f of ['index.html', 'replay.html']) cpSync(r('game/' + f), r('public/game/' + f));
cpSync(r('game/assets/art'), r('public/game/assets/art'), { recursive: true }); // the help modal's concept art; models and textures were never loaded and are not in this repo
mkdirSync(r('public/game/vendor/three'), { recursive: true }); mkdirSync(r('public/game/vendor/rapier'), { recursive: true });
for (const f of ['three.module.js', 'three.core.js']) cpSync(r('node_modules/three/build/' + f), r('public/game/vendor/three/' + f));
cpSync(r('node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs'), r('public/game/vendor/rapier/rapier.mjs'));
cpSync(r('node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs'), r('public/game/vendor/rapier/rapier.es.js')); // name index.html's importmap expects
cpSync(r('game/vendor/three/LICENSE'), r('public/game/vendor/three/LICENSE'));
cpSync(r('game/vendor/rapier/LICENSE'), r('public/game/vendor/rapier/LICENSE'));
mkdirSync(r('public/engine'), { recursive: true });
for (const f of ['sim.mjs', 'policy.mjs', 'crowd-worker-lib.mjs']) cpSync(r('engine/' + f), r('public/engine/' + f));
console.log('synced game + engine into public/');
