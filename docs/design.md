# A Thousand Players — design

**One sentence:** a crowd of Nemotron-driven players plays your browser game by the thousand, finds where it breaks, and proves every finding with a replayable seed.

Built for the Nebius x NVIDIA Global AI Hackathon (deadline Fri 2026-10-30 10:00 PT). Track: Best Apps and Agents (final, decided by Parth on 2026-10-29; earlier drafts considered Coding & Agentic Engineering). Test bed: **Market Brawl**, Parth's own CSCI 310 course-project 3D fighting game (Three.js + Rapier), copied into `game/` with small changes (see the README).

## Why this exists
Indie developers often cannot afford enough outside playtesters. Other commercial AI playtesting tools exist; this is open source, takes a game through a small adapter, and every claim it makes is backed by a seed anyone can replay in the real game.

## The ten ideas are one engine
| Mode | What it answers | Replaces idea |
|---|---|---|
| **Crowd** | "Where do players struggle, quit, or get bored?" | Game Crowd, Tutorial Director |
| **Exploit** | "What strategy breaks my game?" (degenerate combo, seed) | ExploitHound, Mechanic Forge (find) |
| **Repro** | "Turn this bug report into a replay." | ReproBot, Glitch Hunter (invariants) |
| **Balance** | "If I ship this patch, what changes?" (re-run same crowd with tuned constants) | Patch Prophet, Mechanic Forge (tune) |
| **Eyes** | Vision model looks at replay frames and says what it sees | Glitch Hunter, SightGuide (frame understanding) |

Spec Drift (doc vs code) and SightGuide narration are stretch goals, not in scope.

## Pipeline
```
game (Three.js + Rapier, made deterministic)
   └─ engine/ headless Node sim: seed -> same match, 60 Hz, no renderer
Nano   writes 1000 personas -> each persona = JSON decision-table policy (validated)
engine runs sessions (1-5 rounds each, with a frustration/boredom quit model) -> runs/*.jsonl
stats  funnel, heatmap, win-rate by archetype, KO positions, time-to-quit
Ultra  reads ALL compact logs in one context (~250K tokens) -> findings.json, every finding cites seeds
Tavily looks up design precedent for each finding's fix ("fighting game sweep spam nerf")
replay real 3D game re-simulates (seed, tuning, policy) and renders it; Super-VL looks at frames
```

### Model roles (shown on screen, none decorative)
| Model | Job | Why it must be this one |
|---|---|---|
| Nemotron Nano 30B (thinking off, ~3 tokens out) | Writes persona policies in bulk; **spotlight players** pick every action live; mid-match strategy checkpoints | Thousands of cheap calls |
| Nemotron Super 120B | Turns English into things the engine runs: bug report -> oracle predicate (Repro), patch notes -> tuning overrides (Balance) | Needs reliable structured output, still cheap |
| Nemotron Super-VL | Looks at replay frames; confirms/captions findings ("fighter is pinned in the left corner") | Vision |
| Nemotron Ultra 550B | Reads a summary of every round at once, clusters players, finds the story and the exploit, writes the report | Long context: no chunking can see cross-player patterns |
| Tavily | Design precedent for each fix | Runtime web search |

## Determinism contract (the thing everything stands on)
`(seed, tuning, policy, game version)` -> identical match. Achieved by:
- `Math.random` replaced by a seeded mulberry32 stream **only while game logic runs** (visual code keeps the real RNG in the browser),
- `performance.now` returns simulated time (combo windows depend on it),
- fixed 60 Hz steps; same Rapier build.
Test: run each of N seeds twice, hashes of final state must match; browser replay must reproduce the headless outcome.

## Data shapes (all engine outputs; UI and AI code depend only on these)
```jsonc
// personas.json: array. The engine compiles `archetype` + traits into a base decision table, then applies sparse `rules`.
{ "id":"p0412", "name":"Mira", "archetype":"turtle|rusher|masher|learner|cheeser|casual|speedrunner|explorer",
  "skill":0.62, "reaction_ticks":14, "patience":0.4, "frustration_tolerance":0.7, "bio":"short sentence",
  "rules":[ {"dist":"close","rival":"recovery","weights":{"kick":4,"punch":1}}, {"dist":"mid","weights":{"retreat":3,"block":2}} ] }
// dist: far(>2.2) | mid(1.3-2.2) | close(<1.3).  rival phase: idle|startup|active|recovery|down|stunned.  Omitted dist/rival = applies to all.
// actions: advance retreat block punch kick low_punch sweep parry grab jump prop wait

// runs/crowd-<run>.jsonl: one line per ROUND played
{ "p":"p0412", "round":2, "seed":88123, "tuning":"base",
  "out":"win|loss|draw", "t":47.3, "hp":[62,0], "ko":{"x":-3.1,"t":47.3}|null,
  "ev":[[1.2,"hit",1,"JAB"],[3.0,"block",0],[7.9,"knockdown",0],[12.1,"throw",1],[20.4,"prop",1],[44.0,"stuck","BLOCK"]],
  "dmg":[38,100], "maxCombo":4, "mood":{"frustration":0.31,"boredom":0.12} }
// session end: { "p":"p0412", "quit":{"afterRound":3,"reason":"frustration|boredom|satisfied"} }

// findings.json (Ultra output, schema-validated)
{ "summary":"...", "findings":[{ "id":"f1","title":"...","severity":"high|med|low","kind":"difficulty|exploit|boredom|bug|balance",
    "evidence":{"players":412,"stat":"61% of rushers lose round 2","clusters":["rusher","masher"]},
    "seeds":[{"p":"p0412","round":2,"seed":88123,"why":"..."}], "suggestion":"...", "confidence":0.7 }] }

// replay token (base64 JSON in the URL): { "seed":88123,"tuning":"base","policy":{...},"fighter":"kai","maxT":60 }
```

## Honest limits (published in the product)
- Players are synthetic. Quit/boredom is a simple mood model with Nano-authored traits, a hypothesis generator, not a replacement for humans.
- Crowd matches run policies natively; Nano writes/adapts them and drives the on-screen spotlight players live. All 1000 are not LLM-driven decision by decision (too slow and costly, measured).
- Findings are sampled from our crowd, not proofs of absence.
- Works on games that expose the adapter contract; Market Brawl is the one implemented adapter.

## Adapter contract (so another game can plug in)
`createSim({seed, tuning}) -> { tick(inputKeys, n), observe(), done, outcome, events, hash() }` plus `renderReplay(token)` for the browser. Documented in README; not implemented for other games.

## Build plan (2 days)
1. Engine: headless deterministic sim of Market Brawl, double-run hash test, 1000-round throughput benchmark.
2. Personas: Nano generates + validator; policy runner; session/quit model.
3. Crowd run (local), stats, Ultra report, Tavily precedents.
4. Web app: tiles grid, heatmap, report, replay page (real 3D), Eyes (Super-VL).
5. Exploit search, Repro, Balance (reuse crowd runner).
6. Demo recording (honest numbers), README, Devpost text, Token Factory feedback, deploy.
Cut order if late: Eyes -> Repro -> Balance -> live spotlight. Never cut: determinism, crowd run, Ultra report with seeds, replay.
