# Market Brawl — Midnight Circuit

A single-player 3D martial arts fighting game for **CSCI 310: GUI & Game Development, Project 2**. Earlier working title: Street Brawl 3D.

Two original selectable characters, Kai and Rook, face off at Lantern Court. Rendered in **Three.js r170** with **Rapier3D 0.14** rigid-body physics. Fighters can sidestep across a bounded 3D arena. A close three-quarter camera tracks both bodies, adjusts for separation and jumps, and reframes ground fighting. There is no free-roaming movement or multiplayer.

## Play locally

```sh
npm run dev
```

Open http://localhost:5173. Python 3 is required for this convenience server. Any static HTTP server works. Do not open index.html directly via file://: ES modules require HTTP. Runtime libraries are included in vendor/, so playing needs no npm install or CDN. Optional Google Fonts fall back to system fonts offline.

To view the class presentation deck, open http://localhost:5173/CSCI310_Project2_Slides.html in your browser (supports keyboard navigation with arrow keys, speaker notes with `N`, and slide overview with `G`).

Choose a fighter, click **Enter the Circuit**, then wait for **Fight**. Sound is enabled after that user gesture; toggle it on the menu. Escape pauses. Switching tabs also pauses the match.

## Controls

| Input | Action |
| --- | --- |
| A / D or left / right arrows | Move; hold away from the rival to guard; Shift also holds guard |
| J × 4 | Jab → cross → hook → uppercut; tap and release for each strike |
| K × 3 | Roundhouse → high kick → spinning back kick |
| S + J | Body jab → body hook |
| Q / V | Sidestep deeper into / nearer the screen |
| S + K | Low sweep; bypasses standing guard |
| L | Timed parry; succeeds only in the first 0.12 seconds |
| W / up arrow | Jump (release before jumping again) |
| S / down arrow | Duck underneath high punches |
| F / G | Clinch a standing rival, or mount a downed rival, at close range |
| E | Pick up / throw an arena-edge crate |
| R | Restart the match |
| Escape | Pause / resume |
| H | Open / close the complete control guide; pauses live play |

Keyboard and standard-mapped controllers support the full moveset. Touch buttons provide a reduced moveset on narrow screens.

## PlayStation 5 / DualSense controller

Connect by USB or pair the controller with your computer over Bluetooth. Open the game, **click inside the page once** to focus it and enable audio, then press **✕**. The menu reports whether the browser sees the controller. The browser must expose the device with the Gamepad API's **standard** mapping; unmapped devices show a message rather than using guessed controls. Connection detection and activation follow the [browser Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API).

| PlayStation input | Action |
| --- | --- |
| Left stick / D-pad ← → | Move; moving away also guards |
| Left stick / D-pad ↑ ↓ | Sidestep deeper / nearer |
| □ × 4 | Jab → cross → hook → uppercut |
| △ × 3 | Roundhouse → high kick → spinning back kick |
| L1 | Hold to duck |
| L1 + □ | Body jab → body hook |
| L1 + △ | Low sweep |
| ✕ | Jump; release before the next jump |
| ○ | Timed parry |
| L2 | Hold to guard, including while stationary |
| R1 | Clinch a standing rival / mount a downed rival |
| R2 | Pick up / throw a nearby crate |
| Options | Pause / resume |
| Create / touchpad button when exposed | Open / close controls |
| R3 (press right stick) | Restart |
| L3 (press left stick) | Toggle sound |
| Menus: stick / D-pad, ✕, ○ | Navigate, confirm, back; left/right changes fighter on the main menu |

**In a clinch:** □ punches, △ knees, R1 throws, ○ releases. **While mounted:** □ punches the head, △ punches the body, R1 stands up. **Confirming an action, escaping, or getting up:** match the large **□ / △ / ○** symbol on screen with a fresh press. Fast defensive timing preserves the same counterthrow / mount-reversal rules as keyboard play. Release between taps; held buttons do not repeat attacks or solve later prompts.

PlayStation hints and timing symbols appear when the controller is used. Keyboard input switches them back. The control-guide tabs let you inspect either layout. Unplugging the controller pauses a live match and releases held inputs. Optional basic vibration is requested only when supported; adaptive triggers, motion sensors and touchpad gestures are not used. Physical keyboard and controller holds are tracked independently.

## Clinches, escape and counterthrows

Press **F** near a grounded rival. While holding them, choose **J** for a free-hand punch, **K** for a knee, **F** for a throw, or **L** to release. For a strike or throw, press the **large key displayed on screen** before its 1.25-second timer expires. The confirmation changes between actions. A correct response lands the move; a missed or wrong response lets the rival escape or counterthrow. You may land at most two held strikes before throwing or releasing. Leaving the clinch idle also forfeits control.

If the **CPU grabs you**, follow the displayed key to escape. A correct response within **0.45 seconds** reverses the grab into your own counterthrow. A slower correct response within the 1.25-second window escapes. A wrong or missing response allows the CPU's selected punch, knee or throw. Fresh presses are required; holding a key does not solve subsequent prompts. The contest pauses with the game and clears on restart. Both fighters receive a short grab cooldown after release.

## Combinations, knockdowns and ground fighting

Fresh **J** taps cycle through four punches; **K** taps cycle through three kicks. Inputs within 0.8 seconds continue the same chain. Up to three follow-ups queue while an attack finishes. Holding the button does not automatically attack. **S+J** branches into body punches and **S+K** sweeps. Attacks plant and bend the supporting leg, turn the pelvis and shoulders, and drive the body forward. Body hits have a separate folded recoil.

Sweep, uppercut, back kick, or a short run of clean hits can knock a fighter onto their back. A downed player receives a **2.4-second get-up prompt**: match the shown J/K/L key for a quick technical rise. A wrong or missed response causes a slower recovery. Standing attacks cannot repeatedly hit a prone or recovering fighter.

Press **F** near a downed rival to mount. Choose **J** for a head punch, **K** for a body punch, or **F** to stand up. Confirm each strike with the new displayed key. The mount permits at most **three strikes**, with another defensive opportunity between them. A missed attacking prompt can let the CPU escape or reverse the mount.

When pinned, match the shown key within **1.25 seconds** to escape. React within **0.40 seconds** to roll over and become the attacker instead. Missing it allows a CPU strike, followed by another chance to escape. Both fighters can mount. Pause freezes all prompts; restart clears them and restores solid physics bodies.

## Rival tactics

The CPU uses distance to select punches versus kicks, punch and kick combinations, including hooks, uppercuts and high/back kicks, recovery punishment, guard, parry cooldowns, feints, and guarded backsteps. It tracks the last eight observed player attacks and changes tactics against repeated punches or sweeps. Neutral move selection avoids immediately repeating the same attack; kick scheduling prevents endless punch chains. It aims toward the actual opponent in depth and can approach and mount a downed player. Guarding can invite a sweep or clinch, and throws have a cooldown. Kai and Rook both use punches and kicks.

## Rules and feedback

Reduce the AI rival to zero health to win. A match lasts 99 seconds; higher health wins at time-out and equal health draws. Score rewards damage, combinations, broken crates, victory and speed. Guard reduces damage by 80%; sweeps defeat standing guard. Sustained blocking fills the guard-damage meter, causing a stagger at 100. Health bars, guard meters, hit sparks, camera shake, sound and audience reactions communicate outcomes.

Both character choices share balanced combat frame data. Their original geometry, proportions, colors, clothing and names differ. The AI uses explicit tactical rules and a match-local memory of recent player attacks.

## Implementation

- `src/main.js`: menu/match/pause lifecycle, fixed 60 Hz simulation, camera, impact particles, reset cleanup.
- `src/character.js`: original articulated fighters, joint parenting, hurtboxes and attack bounds, Rapier capsules.
- `src/animation.js`: interpolated complete poses; startup / active / recovery attack phases, knockdown and throw reactions.
- `src/moves.js`: whole-body punch/kick poses, attack heights, reach, forward drive and finishers.
- `src/movement.js`: depth-aware facing and attack steps.
- `src/camera.js`: close perspective framing for standing, ground and portrait play.
- `src/ground.js`: knockdown, technical rise, mounting, timed strikes, escapes and mount reversal.
- `src/gamepad.js`: standard-layout polling, PlayStation labels, fresh presses, dead zone, menu actions, disconnect cleanup and optional rumble.
- `src/player.js`: disposable keyboard listeners, input buffering, movement, guarding, grabs and props.
- `src/ai.js`: range-aware choices, recent-move memory, combinations, anti-repeat weights and defense.
- `src/grapple.js`: shared clinch state, timed prompts, one-hand holds, punches/knees, escape, reversal and physical throws.
- `src/combat.js`: attack-bound overlap, damage, timed parry, guard break, single knockback impulse and hit-stop.
- `src/world.js`: original procedural courtyard, lights, tiled floor, market facade, lantern strings and skyline.
- `src/crowd.js`: shared-geometry spectators with idle, cheer, gasp and scatter animations.
- `src/physics.js`: Rapier boot, collision groups, simulation and body cleanup.
- `src/props.js`: throwable, breakable crates and timed physics debris.
- `src/audio.js`: layered punch/kick/body/slam/guard sounds, swings, footsteps and crowd-like noise; no downloaded sound recordings.
- `src/hud.js`: match timer, score and result screen.

The attack solver uses three-dimensional rectangular bounds, not per-triangle collision or physical fist colliders. Rapier handles fighter bodies, ground, walls, crates, projectiles and debris. The fighters use keyframed joints, not ragdolls or motion capture. Ground control uses a coordinated pose/state sequence; temporary sensor and gravity settings permit the mount and restore on release.

## Verification

```sh
npm test
npm run build
```

The test suite covers physics, combat, controllers, scoring, animation, props and course deliverables. The build creates a self-contained **dist/**. Browser regression instructions and results are in `QA.md`.

## GitHub Pages hosting

No deployment is configured in this checkout. The old README's demo URL was not verified and is not a deployment record.

1. Run `npm run build`.
2. Publish only the contents of dist/ in a dedicated game repository or a Pages deployment artifact. All paths are relative, so a project subdirectory works.
3. Enable GitHub Pages for that repository / deployment branch.
4. Open the actual published URL and test loading, movement, damage and restart.
5. Add that verified URL to a reserved project block on your Project 1 personal work page.

The containing Git repository is the full personal Obsidian vault. **Do not publish or push the vault to host this game.** Use dist/ or the submission archive, which contain only the game.

## Assets and assistance

Runtime models and arena are original code-generated geometry. `assets/art/midnight-circuit.png` is AI-generated promotional concept art used in the presentation and help panel; it is not a gameplay screenshot. The older imported files in `assets/models` and `assets/textures` are not loaded or included in the build. Their licensing has not been established here.

Three.js (MIT) and Rapier (Apache-2.0) license notices are preserved under vendor/. Google Fonts are optional externally hosted typography. AI assistance was used for implementation, debugging, visual design, tests and concept art. Review the code and adapt the developer notebook to describe your own learning and observations honestly.

## Course submission

- Code: submit the game source and/or `output/Market-Brawl-Submission.zip` to Brightspace as required.
- Presentation: `CSCI310_Project2_Slides.html`, 8 minutes plus 2 minutes of Q&A.
- Notebook: `Development_Notebook_Project2.md` is a draft for your review and transfer to DocForge. It has not been submitted.
- Hosting and portfolio link: publish and verify separately using the steps above.
