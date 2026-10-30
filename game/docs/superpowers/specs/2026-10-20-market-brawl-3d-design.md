# Design Document: Street Brawl 3D — Old Chinatown Martial Arts & Destructible Environment

**Date:** 2026-10-20  
**Status:** Draft for Builder Check & User Approval  
**Project:** CSCI 310 GUI & Game — Client-Side Web 3D Single Player Game  
**Target Repository:** the original course project folder (local notes, not in the repo); copied here as `game/`

---

## 1. Intent & The Why
Transform the project into a high-octane 3D martial arts brawler set in an authentic Old Chinatown / Edo market street. The core feeling is inspired by classic martial arts cinema (Jackie Chan / Donnie Yen) and visceral 3D fighters (*Tekken*, *Virtua Fighter*, *Shadow Fight*). Combat emphasizes physical weight, hit-stop crunch, body impulse reactions, and creative use of everyday market objects (wooden carts, clay pots, wicker baskets, wooden bō sticks) to outsmart a demanding, adaptive opponent.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- **1v1 Martial Arts Duel:** Focused high-intensity duel against a single smart, adaptive Rival AI ("beating the guy"). Deep frame interactions, whiff punishing, and stamina/posture battles (not wave brawler horde).
- **Grounded Martial Arts Combat:** Fluid unarmed striking (jabs, crosses, roundhouse kicks, sweeps) and physical close-quarters weapons (wooden bō staff, sticks, nunchaku) with zero magical powers.
- **Physical Weight & Hit-Stop:** Reverse-engineered *Tekken*/*Virtua Fighter* kinetic feel: 3-5 frame impact freeze, capsule limb hitbox collision, and Rapier3D impulse-based knockbacks/stumbles.
- **Dynamic Destructible Environment:** Market carts can be kicked into enemies to break into planks; clay pots shatter on impact dealing posture damage; hanging paper lanterns swing on physics joints. All interactables aligned to the $Z \approx 0$ combat corridor.
- **Adaptive Rival AI:** Hard opponent that reads player windup frames, blocks high/low, parries predictable attacks, punishes whiffs, and throws nearby props if the player turtles.
- **Atmospheric Bystander Crowd:** Townfolk (shopkeepers, villagers) gathered at street edges and shop porches who cheer combos, gasp on big collisions, and scramble backward if fighters crash near them.
- **100% Self-Contained Procedural Pipeline:** Modular stylized 3D humanoid rigs (articulated head, torso, shoulders, arms, forearms, hips, legs, weapon sockets) animated via parametric keyframe curves and hierarchical FK. Zero external GLTF/texture download dependencies; 100% immune to CORS or CDN asset failures.
- **CSCI 310 Rubric Perfection (100% + Bonus):** 100% client-side Three.js + Rapier3D physics, single-player story intro modal, WASD + attack controls, 'R' instant reset, score calculation, health & posture gauges, sound/visual feedback, deployable to GitHub Pages.

### Non-Goals
- Complex multi-level RPG progression, inventory grids, or skill trees.
- Multiplayer networking or backend server reliance (violates client-side rubric).
- Magic spells, ki blasts, or laser projectiles.

### Anti-Goals
- Floatiness: Attacks must not feel like disconnected animation clips sliding across geometry.
- Infinite stun locks: Both player and AI must have poise thresholds and recovery rollouts.
- Static decor: If an object looks like a prop (crate, pot, cart), it must interact with physics when struck.

---

## 3. Constraints & Technical Foundation
- **Graphics Engine:** Three.js (r170) via ES modules.
- **Physics Engine:** `@dimforge/rapier3d-compat` (Wasm-based 3D rigid bodies, colliders, character controllers, impulse solver).
- **Deployment:** GitHub Pages static site (HTML, JS, CSS, no Node runtime in production).
- **Audio:** Web Audio API with procedural synthesized martial arts sound effects (whooshes, bone impact crunches, wood shattering, cheering crowd ambient murmur) without heavy external assets.
- **Performance Budget:** 60 FPS on standard desktop browser with shadow maps and physics simulation.

---

## 4. Systems Architecture

### A. Camera & Perspective: 2.5D Cinematic Action Plane
- 3D arena geometry and full 3D physics bodies.
- Camera follows the midpoint between Player and Rival on a dynamic focal plane ($Z \approx 0$).
- Camera smoothly tracks distance (zooms closer during clinch/infighting, widens during spacing) with directional screen-shake on heavy impacts and parries.

### B. Environment & Destructible Props
- **Setting:** Old Chinatown / Edo Market Street bordered by traditional timber storefronts, tiled eaves, hanging red lanterns, and cobblestone ground.
- **Interactive Props:**
  1. *Wooden Pushcart:* Heavy rigid body. Kicking it applies forward linear impulse; on collision with fighter or wall, it fractures into timber debris.
  2. *Clay Pots & Urns:* Stacked near stalls. Grab with `[E]` and throw along line of sight; shatters into shards, causing hit-stun.
  3. *Wooden Bō Staff / Bamboo Staves:* Can be picked up from stalls for extended reach, increased block poise, and thrust attacks.
  4. *Overhead Lanterns:* Suspended by Rapier distance/revolute joints; sway on impact.

### C. Combat & Animation Engine
- **State Machine:** `IDLE` -> `STARTUP` -> `ACTIVE` (hitbox active) -> `RECOVERY` -> `IDLE`
- **Hit-Stop (Kogeki Teishi):** On hit confirmation, both attacker and defender animation speeds scale to 0.05 for 0.08s before applying Rapier impulse vectors.
- **Capsule Hitboxes:** Limbs and weapons have kinematic Rapier colliders that query opponent hurtbox colliders.
- **Move List:**
  - `A / D`: Forward walk, back-step retreat (holding back = high block).
  - `W`: Jump / Aerial hop kick.
  - `S`: Crouch / Low duck (evades high attacks).
  - `J`: Light Punch Combo (Jab -> Cross -> Hook).
  - `K`: Heavy Kick / Sweep (Low kick trips legs via angular impulse).
  - `L`: Timed Parry (Deflects strike within 10-frame window, opening enemy to counter).
  - `E`: Environment Grab / Throw (Kicks cart or throws nearest pot).
  - `Space`: Evasive Dash / Sidestep Roll.

### D. Hard AI Behavior (Finite State Machine + Utility)
- **Spacing State:** Maintains distance outside player jab range; steps in with lunging kicks when player misses.
- **Reactive Guarding:** Probability-based defensive check against player attack state (ducks high punches, blocks mids, hops low sweeps).
- **Whiff Punishment:** Triggers counter-combo instantly when player enters `RECOVERY` state without hit confirmation.
- **Environmental Opportunism:** If player maintains high guard, AI moves toward nearby pots or carts to shatter player's posture.

### E. Reactive Townfolk Crowd
- 8-12 stylized 3D townfolk models positioned behind wooden railings and shop verandas.
- Ambient idling animations (nodding, chatting, looking toward center).
- Dynamic Event Listener:
  - Combo count $\ge 3$: Cheering / arms raised animation + crowd roar audio.
  - Cart/Prop Shatter: Shock gasp animation + crowd flinch audio.
  - Fighter knocked to ground: Clapping / anticipation cheer.
  - Fighter thrown into crowd boundary: Scramble backward with evasive stumble.

---

## 5. UI/UX & Course Deliverables (CSCI 310)
- **HUD (`/ui-ux-pro-max`):**
  - Top-tier martial arts duel display: Dual dragon-themed health bars, posture/stamina bars, fighter names.
  - Dynamic combo counter with kinetic bounce and color tiers.
  - Keybinding guide toggle overlay (`H` or corner pill).
- **Game Flow Modals:**
  - Story Intro Modal: Establishes lore (honorable duel in the merchant quarter) and control briefing.
  - Victory / Defeat Screen with score breakdown (Survival Time, Damage Dealt, Environmental Kills, Combos).
  - Quick Reset: Instant 'R' key restarts without full page reload.

---

## 6. Multi-Agent Development Division
- **Sonnet 5.5 (Claude CLI Subagents):**
  - Subagent 1 (World & Props): Build market street 3D scene, materials, lighting, destructible pushcarts, clay pots, and Rapier colliders.
  - Subagent 2 (Character Rigs & Combat): 3D ninja/martial artist procedural skeletal rigs, animation state machines, hitboxes, limb sweep math, and hit-stop.
  - Subagent 3 (Hard AI & Spectators): Rival decision engine, adaptive counter-attacks, prop kicking logic, and townfolk crowd animations.
- **Coordinator:**
  - Architecture planning, contract definition, unit/integration test suites, `/ui-ux-pro-max` HUD styling, audio synthesizer, presentation slides, and development notebook.

---

## 7. What is Left to the Builder
- Precise numerical tuning of frame data (startup/active/recovery frame counts).
- Exact procedural polygon styling of townfolk and market textures.
- Audio synthesis frequency parameters for whooshes, wood splintering, and crowd cheers.
