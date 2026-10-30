# Street Brawl 3D: Old Chinatown Martial Arts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, client-side 3D martial arts fighting game set in an Edo / Old Chinatown market street, featuring grounded hand-to-hand combat, destructible Rapier3D physics props, reactive bystander crowds, an adaptive Rival AI, and full CSCI 310 course compliance.

**Architecture:** 2.5D dynamic tracked camera on a 3D action plane ($Z \approx 0$). Physics simulated via `@dimforge/rapier3d-compat` WebAssembly rigid bodies and kinematic capsule hitboxes with *Tekken*-style hit-stop time dilation. Fully self-contained procedural 3D humanoid rigs with forward-kinematic animation curves, Web Audio procedural sound synthesis, and `/ui-ux-pro-max` Japanese calligraphy / martial duel HUD overlay.

**Tech Stack:** Three.js (r170), `@dimforge/rapier3d-compat` (v0.14.0), Web Audio API, Vanilla ES Modules, Vite/static web server compatible.

**Spec:** `game/docs/superpowers/specs/2026-10-20-market-brawl-3d-design.md`

## Global Constraints
- **Client-Side Only:** 100% runnable in modern browser on GitHub Pages; no backend server or Node runtime in production.
- **Three.js & Rapier Mandate:** Three.js for 3D scene graph, lighting, camera, and rendering; Rapier3D for rigid bodies, colliders, and character impulses.
- **Zero External Model/Texture Downloads:** All 3D characters, props, buildings, and crowd members procedurally generated via code to guarantee instant load and zero CORS or network asset failures.
- **CSCI 310 Mandatory Features:** Story intro theme modal, single-player game loop, WASD + action controls, 'R' key instant reset, win/lose condition screens, scoring calculation, visual/audio feedback.
- **Performance:** Stable 60 FPS on desktop WebGL.

## Review Focus
1. **Rapier Wasm Initialization Race:** Attempting to spawn physics bodies before `RAPIER.init()` resolves causes null pointer exceptions -> Ensure engine bootstrapper awaits `RAPIER.init()` before creating scenes.
2. **Hitbox Self-Collision:** An attacker's punching fist colliding with their own torso hurtbox triggers self-damage -> Implement collision filter groups (`PLAYER_ATTACK_GROUP` vs `RIVAL_HURT_GROUP`).
3. **Z-Axis Drift & Whiffing:** 3D physics impulses causing fighters or props to drift into the background ($Z \ne 0$) making attacks miss -> Clamp rigid bodies to $Z = 0$ via Rapier translation lock or manual corridor clamping.
4. **Hit-Stop Time-Scale Desync:** Hit-stop freezing animations but leaving physics gravity or camera dt running causes jerky warps -> Scale game loop `deltaTime` uniformly across animation, physics step, and camera damping.
5. **Memory Leak on Quick Reset ('R'):** Repeatedly pressing 'R' leaving orphaned Three.js geometries, textures, and Rapier bodies in memory causing lag -> Implement a comprehensive `dispose()` and reset lifecycle.

---

### Task 1: Project Scaffold, HTML Shell, Import Map, & Engine Bootstrapper

**Files:**
- Create: `index.html`
- Create: `src/main.js`
- Create: `src/physics.js`
- Test: `tests/physics-boot.test.js`

**Interfaces:**
- Consumes: Three.js CDN, `@dimforge/rapier3d-compat` CDN
- Produces: 
  - `initPhysics(): Promise<{ world: RAPIER.World, RAPIER: Object }>`
  - `stepPhysics(deltaTime: number): void`
  - `createCorridorBoundary(world: RAPIER.World): void`

- [ ] **Step 1: Write the test verifying Rapier and Three.js physics boot contracts**
```javascript
// tests/physics-boot.test.js
import { describe, it, expect } from 'vitest';
import { initPhysics, stepPhysics } from '../src/physics.js';

describe('Physics Bootstrapper', () => {
  it('initializes Rapier world with gravity [0, -9.81, 0]', async () => {
    const { world, RAPIER } = await initPhysics();
    expect(world).toBeDefined();
    expect(RAPIER).toBeDefined();
    expect(world.gravity.y).toBeCloseTo(-9.81);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/physics-boot.test.js`
Expected: FAIL (files missing).

- [ ] **Step 3: Implement `index.html`, `src/physics.js`, and `src/main.js`**
Configure `<script type="importmap">` for `three` and `@dimforge/rapier3d-compat`. In `src/physics.js`, await `RAPIER.init()`, create `new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 })`, and lock $Z$-translation for 2.5D combat corridor bodies.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/physics-boot.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add index.html src/physics.js src/main.js tests/physics-boot.test.js
git commit -m "feat: setup project shell, importmap, and Rapier3D physics bootstrapper"
```

---

### Task 2: 3D Market Street Environment & Destructible Rapier Physics Props

**Files:**
- Create: `src/world.js`
- Create: `src/props.js`
- Test: `tests/props-destructible.test.js`

**Interfaces:**
- Consumes: `world` from `src/physics.js`, `THREE.Scene`
- Produces:
  - `createMarketEnvironment(scene: THREE.Scene, world: RAPIER.World): Object`
  - `createDestructibleCart(scene: THREE.Scene, world: RAPIER.World, x: number): CartEntity`
  - `createClayPot(scene: THREE.Scene, world: RAPIER.World, x: number, y: number): PotEntity`
  - `breakProp(propEntity: Object, impulseVector: {x,y,z}): void`

- [ ] **Step 1: Write test for destructible prop shattering and physics debris**
```javascript
// tests/props-destructible.test.js
import { describe, it, expect } from 'vitest';
import { createClayPot, breakProp } from '../src/props.js';
import { initPhysics } from '../src/physics.js';
import * as THREE from 'three';

describe('Destructible Props', () => {
  it('breaks clay pot into physical debris pieces on impact', async () => {
    const { world } = await initPhysics();
    const scene = new THREE.Scene();
    const pot = createClayPot(scene, world, 2.0, 0.5);
    expect(pot.isBroken).toBe(false);
    breakProp(pot, { x: 5, y: 2, z: 0 });
    expect(pot.isBroken).toBe(true);
    expect(pot.debrisPieces.length).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/props-destructible.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `src/world.js` and `src/props.js`**
Construct 3D market street: cobblestone ground collider, timber merchant storefronts, tiled roofs, torii archways, hanging lanterns. In `props.js`, build composite Rapier bodies for pushcarts and clay pots; on `breakProp`, replace intact mesh with 4-8 debris meshes with explosive outward impulses.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/props-destructible.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/world.js src/props.js tests/props-destructible.test.js
git commit -m "feat: add 3D market street world and destructible Rapier physics props"
```

---

### Task 3: Procedural 3D Humanoid Martial Artist Rig & Skeletal Keyframe Animation System

**Files:**
- Create: `src/character.js`
- Create: `src/animation.js`
- Test: `tests/animation-state.test.js`

**Interfaces:**
- Consumes: `THREE.Scene`, `RAPIER.World`
- Produces:
  - `createFighterRig(scene: THREE.Scene, world: RAPIER.World, isPlayer: boolean, startX: number): FighterEntity`
  - `playAnimation(fighter: FighterEntity, animName: string, loop?: boolean): void`
  - `updateAnimation(fighter: FighterEntity, delta: number): void`

- [ ] **Step 1: Write test for character hierarchy and animation state transitions**
```javascript
// tests/animation-state.test.js
import { describe, it, expect } from 'vitest';
import { createFighterRig } from '../src/character.js';
import { playAnimation, updateAnimation } from '../src/animation.js';
import { initPhysics } from '../src/physics.js';
import * as THREE from 'three';

describe('Character Animation System', () => {
  it('correctly transitions from IDLE to JAB and executes frame curve', async () => {
    const { world } = await initPhysics();
    const scene = new THREE.Scene();
    const fighter = createFighterRig(scene, world, true, -2.0);
    expect(fighter.state).toBe('IDLE');
    playAnimation(fighter, 'JAB');
    expect(fighter.state).toBe('STARTUP');
    updateAnimation(fighter, 0.08); // Advances past startup into active frames
    expect(fighter.state).toBe('ACTIVE');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/animation-state.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement procedural joints and parametric combat animations in `src/character.js` and `src/animation.js`**
Build articulated humanoid hierarchy: Root -> Hips -> Spine -> Chest -> Head, and Left/Right Shoulders -> Arms -> Forearms -> Hands, and Hips -> Thighs -> Shins -> Feet. Implement keyframe lerp curves for `IDLE`, `WALK`, `JAB`, `CROSS`, `ROUNDHOUSE_KICK`, `SWEEP`, `BLOCK`, `PARRY`, `HIT_STUN`, and `KNOCKDOWN`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/animation-state.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/character.js src/animation.js tests/animation-state.test.js
git commit -m "feat: implement procedural 3D martial artist rig and keyframe animation system"
```

---

### Task 4: Hitbox/Hurtbox Capsule Overlap, Tekken Hit-Stop, & Impulse Damage Solver

**Files:**
- Create: `src/combat.js`
- Test: `tests/combat-solver.test.js`

**Interfaces:**
- Consumes: `FighterEntity` from `src/character.js`, `RAPIER.World`
- Produces:
  - `checkHitCollisions(attacker: FighterEntity, defender: FighterEntity, props: PropEntity[]): HitResult[]`
  - `applyHitStop(attacker: FighterEntity, defender: FighterEntity, frames: number): void`
  - `resolveDamageAndImpulse(hitResult: HitResult): void`

- [ ] **Step 1: Write test for hit registration, guard deflection, and impulse application**
```javascript
// tests/combat-solver.test.js
import { describe, it, expect } from 'vitest';
import { checkHitCollisions, resolveDamageAndImpulse } from '../src/combat.js';

describe('Combat Solver', () => {
  it('detects attack capsule overlap and applies kinetic knockback impulse', () => {
    const mockAttacker = {
      state: 'ACTIVE',
      currentAttack: { name: 'CROSS', damage: 15, impulse: { x: 8, y: 1 }, hitStopFrames: 4 },
      getHitboxBounds: () => ({ minX: 0, maxX: 1, minY: 1, maxY: 1.5, z: 0 }),
      hitRegistered: false
    };
    const mockDefender = {
      health: 100,
      isGuarding: false,
      getHurtboxBounds: () => ({ minX: 0.5, maxX: 1.2, minY: 0.8, maxY: 1.8, z: 0 }),
      applyImpulse: (vec) => { mockDefender.lastImpulse = vec; },
      takeDamage: (amt) => { mockDefender.health -= amt; }
    };
    const hits = checkHitCollisions(mockAttacker, mockDefender, []);
    expect(hits.length).toBe(1);
    resolveDamageAndImpulse(hits[0]);
    expect(mockDefender.health).toBe(85);
    expect(mockDefender.lastImpulse.x).toBe(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/combat-solver.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement hit-stop timer, capsule intersection, and impulse physics in `src/combat.js`**
On hit: trigger 3-5 frame hit-stop (dilating `fighter.animSpeed`), trigger particle spark, test defender guard angle (if blocking, reduce damage by 80% and increase attacker recovery), and apply Rapier linear/angular impulse to defender root body.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/combat-solver.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/combat.js tests/combat-solver.test.js
git commit -m "feat: add hitbox capsule detection, Tekken hit-stop, and impulse damage solver"
```

---

### Task 5: Player Combat Controller (WASD, Combos, Parries, Roll, & Prop Grab/Throw)

**Files:**
- Create: `src/player.js`
- Test: `tests/player-controller.test.js`

**Interfaces:**
- Consumes: `FighterEntity` from `src/character.js`, `props` from `src/props.js`
- Produces:
  - `initPlayerControls(): void`
  - `updatePlayer(player: FighterEntity, delta: number, nearbyProps: PropEntity[]): void`

- [ ] **Step 1: Write test for input buffer, combo branching, and prop interaction**
```javascript
// tests/player-controller.test.js
import { describe, it, expect } from 'vitest';
import { updatePlayerStateFromInput } from '../src/player.js';

describe('Player Combat Controller', () => {
  it('chains J -> J into 2-hit punch combo within buffer window', () => {
    let state = { comboIndex: 0, lastInputTime: 1000, currentMove: null };
    state = updatePlayerStateFromInput(state, 'J', 1100);
    expect(state.currentMove).toBe('JAB');
    state = updatePlayerStateFromInput(state, 'J', 1250);
    expect(state.currentMove).toBe('CROSS');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/player-controller.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement keyboard listeners, combo buffering, and 'E' prop grab in `src/player.js`**
Map `A/D` to lateral movement along fight rail (holding away from enemy = auto-guard), `W` to jump/aerial kick, `S` to crouch/sweep, `J` to punches, `K` to kicks, `L` to parry window, `Space` to invincible dodge roll, and `E` to kick cart / throw clay pot toward enemy.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/player-controller.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/player.js tests/player-controller.test.js
git commit -m "feat: implement player combat controller with combo buffering and prop interaction"
```

---

### Task 6: Reactive Rival AI Engine (Spacing, Active Guard, Whiff Punish, Environmental Opportunism)

**Files:**
- Create: `src/ai.js`
- Test: `tests/ai-behavior.test.js`

**Interfaces:**
- Consumes: `player: FighterEntity`, `rival: FighterEntity`, `props: PropEntity[]`
- Produces:
  - `updateRivalAI(rival: FighterEntity, player: FighterEntity, props: PropEntity[], delta: number): void`

- [ ] **Step 1: Write test verifying AI spacing and whiff punish decision**
```javascript
// tests/ai-behavior.test.js
import { describe, it, expect } from 'vitest';
import { decideRivalAction } from '../src/ai.js';

describe('Rival AI Decision Engine', () => {
  it('triggers instant counter-attack when player enters recovery after missing attack', () => {
    const player = { state: 'RECOVERY', distance: 1.2, isGuarding: false };
    const rival = { state: 'IDLE', stamina: 80 };
    const action = decideRivalAction(rival, player, []);
    expect(['LUNGE_PUNCH', 'ROUNDHOUSE']).toContain(action.type);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/ai-behavior.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement state machine (SPACING, DEFENDING, PUNISHING, PROP_INTERACT) in `src/ai.js`**
AI measures distance to player: stays outside range, raises guard when player initiates attack, ducks high jabs or hops sweeps, and if player turtles behind block for >2 seconds, kicks an available pushcart or clay pot to break guard.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/ai-behavior.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/ai.js tests/ai-behavior.test.js
git commit -m "feat: implement adaptive rival AI with spacing, whiff punishing, and prop usage"
```

---

### Task 7: Reactive Townfolk Bystanders & Procedural Web Audio Sound System

**Files:**
- Create: `src/crowd.js`
- Create: `src/audio.js`
- Test: `tests/crowd-audio.test.js`

**Interfaces:**
- Consumes: `THREE.Scene`, `combatEvents`
- Produces:
  - `createTownfolkCrowd(scene: THREE.Scene): CrowdManager`
  - `updateCrowd(crowd: CrowdManager, combatEvent: string, delta: number): void`
  - `initAudio(): AudioEngine`
  - `playSound(type: 'hit'|'parry'|'cart_smash'|'cheer'|'gasp'): void`

- [ ] **Step 1: Write test for crowd reaction event dispatch and audio tone synthesis**
```javascript
// tests/crowd-audio.test.js
import { describe, it, expect } from 'vitest';
import { handleCombatEventForCrowd } from '../src/crowd.js';

describe('Crowd Reactions & Audio', () => {
  it('triggers cheer animation state on combo milestone >= 3', () => {
    const crowd = { state: 'IDLE', members: [{ animState: 'IDLE' }, { animState: 'IDLE' }] };
    handleCombatEventForCrowd(crowd, { type: 'COMBO_3' });
    expect(crowd.members[0].animState).toBe('CHEER');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/crowd-audio.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement 3D townfolk bystanders in `src/crowd.js` and Web Audio oscillators in `src/audio.js`**
Place 8-10 stylized bystander models along shop porches and market fences. Implement crowd cheer, gasp, and scatter states. In `src/audio.js`, generate punch impacts (sub-kick + noise burst), katana/staff clashes (high metallic FM bell), wood splintering (random pitch noise bursts), and crowd roar ambient noise.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/crowd-audio.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/crowd.js src/audio.js tests/crowd-audio.test.js
git commit -m "feat: add reactive townfolk bystanders and procedural Web Audio sound effects"
```

---

### Task 8: `/ui-ux-pro-max` Martial Arts HUD, Story Intro Modal, Scoring, & Reset Loop

**Files:**
- Create: `src/hud.js`
- Modify: `index.html`
- Modify: `src/main.js`
- Test: `tests/score-lifecycle.test.js`

**Interfaces:**
- Consumes: `player`, `rival`, Game Loop state
- Produces:
  - `initHUD(): void`
  - `updateHUD(player: FighterEntity, rival: FighterEntity, combo: number): void`
  - `calculateScore(survivalTime: number, damageDealt: number, envDamage: number): number`
  - `resetGame(): void`

- [ ] **Step 1: Write test for score calculation and game reset state**
```javascript
// tests/score-lifecycle.test.js
import { describe, it, expect } from 'vitest';
import { calculateScore } from '../src/hud.js';

describe('Scoring & Game Lifecycle', () => {
  it('calculates score based on damage dealt, combo multiplier, and environmental props smashed', () => {
    const score = calculateScore({ damageDealt: 100, maxCombo: 4, propsBroken: 2, timeSeconds: 45 });
    expect(score).toBeGreaterThan(1500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/score-lifecycle.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement HUD styling, story intro dialog, game over screen, and 'R' key reset**
Apply `/ui-ux-pro-max` design: dragon border health bars, posture gauge, floating kinetic combo numerals, control legend toggle, lore story intro modal, victory/defeat modal with score summary, and instant 'R' reset handler.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/score-lifecycle.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/hud.js src/main.js index.html tests/score-lifecycle.test.js
git commit -m "feat: implement martial arts HUD, story modal, scoring, and instant reset loop"
```

---

### Task 9: CSCI 310 Course Deliverables (DocForge Development Notebook & Interactive Slides)

**Files:**
- Create: `Development_Notebook_Project2.md`
- Create: `CSCI310_Project2_Slides.html`
- Create: `README.md`
- Test: `tests/course-deliverables.test.js`

**Interfaces:**
- Produces: Complete course submission documentation matching DocForge and BrightSpace requirements.

- [ ] **Step 1: Write test verifying required sections in documentation and slides**
```javascript
// tests/course-deliverables.test.js
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Course Deliverables', () => {
  it('verifies DocForge development notebook contains all required iteration sections', () => {
    const content = fs.readFileSync(path.resolve(__dirname, '../Development_Notebook_Project2.md'), 'utf-8');
    expect(content).toContain('Goal/Task/Rationale');
    expect(content).toContain('Three.js');
    expect(content).toContain('Rapier');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/course-deliverables.test.js`
Expected: FAIL.

- [ ] **Step 3: Author `Development_Notebook_Project2.md`, `CSCI310_Project2_Slides.html`, and `README.md`**
Format `Development_Notebook_Project2.md` with prompt logs, rationales, technical decisions, and evaluations matching DocForge format. Build interactive HTML presentation slides with 8-minute timing, feature demonstrations, and architecture diagrams.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/course-deliverables.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add Development_Notebook_Project2.md CSCI310_Project2_Slides.html README.md tests/course-deliverables.test.js
git commit -m "docs: author CSCI 310 development notebook, presentation slides, and README"
```

---

### Task 10: End-to-End Browser Playwright & Visual Verification

**Files:**
- Create: `tests/e2e-gameplay.test.js`

**Interfaces:**
- Consumes: Running game server
- Produces: Verified 60 FPS gameplay, input responsiveness, hit registration, and prop destruction in real browser.

- [ ] **Step 1: Write Playwright E2E browser test**
```javascript
// tests/e2e-gameplay.test.js
import { test, expect } from '@playwright/test';

test('Game initializes, receives WASD and J punch, and registers combat update', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.click('#btn-start-fight');
  await expect(page.locator('#hud-overlay')).toBeVisible();
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(500);
  const comboText = await page.locator('#combo-counter').textContent();
  expect(comboText).toBeDefined();
});
```

- [ ] **Step 2: Run E2E test to verify game loop and browser integration**
Run: `npx playwright test tests/e2e-gameplay.test.js`
Expected: PASS.

- [ ] **Step 3: Commit**
```bash
git add tests/e2e-gameplay.test.js
git commit -m "test: add Playwright E2E browser integration and visual gameplay verification"
```
