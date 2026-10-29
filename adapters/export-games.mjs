// Writes the compact per-game results the /games page reads: data/games/<game>.json.
// Numbers come from adapters/<game>/out/summary.json (run adapters/crowd.mjs first) and data/run-main/ for Market Brawl.
// Verdicts and notes are the human calibration step from docs/generality.md; they are not computed.
//   node adapters/export-games.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const out = new URL('../data/games/', import.meta.url);
mkdirSync(out, { recursive: true });
const write = (id, o) => writeFileSync(new URL(`${id}.json`, out), JSON.stringify(o, null, 1) + '\n');

// Market Brawl: the main recorded run. Its throughput was measured separately (README "Throughput"), on 11 threads.
const mb = read('../data/run-main/summary.json'), mbBugs = read('../data/run-main/bugs.json');
const MB_VERDICT = { bug1: 'partly fixed', bug2: 'fixed by hand, replay-verified 4 of 4', bug3: 'fixed, replay-verified 3 of 3', bug4: 'fixed on 1 of 1 seeds, not shipped' };
write('market-brawl', {
  id: 'market-brawl', order: 1, name: 'Market Brawl', genre: '3D physics brawler (Three.js + Rapier)',
  command: 'node engine/crowd.mjs --personas data/run-main/personas.json',
  players: { personas: mb.players, fuzzers: 0 }, rounds: mb.rounds,
  roundsPerSecond: 199, speedNote: 'Measured on the current build, 11 worker threads (README, Throughput). The recorded run\'s own wall time was not logged.',
  outcomes: { win: mb.wins, loss: mb.losses },
  events: mbBugs.map((b) => ({
    kind: b.signature, rounds: b.count, verdict: MB_VERDICT[b.id] ?? 'not triaged',
    example: { player: b.representative.p, seed: b.representative.seed, t: b.representative.firstBug?.[0] ?? b.representative.t },
  })),
  replays: { checked: 42, matched: 42, note: 'Sampled recorded rounds replayed event for event in the browser (README, Replay).' },
  adapter: 'The original target. Needed window and DOM shims plus Three.js in Node to run headless.',
  notes: [
    'Personas were written for this game: their rules use fighting vocabulary (distance, rival, punch).',
    'Real-time contact between two physics bodies is where the crowd found the most bugs.',
  ],
});

// The two adapter games. Event verdicts and notes from docs/generality.md.
const GAMES = {
  homeground: {
    order: 2, name: 'Homeground', genre: 'Longboard downhill physics on map tiles (TypeScript)',
    command: 'node --import tsx adapters/crowd.mjs --game homeground --n 100 --fuzz 100 --seed 1 --maxT 240',
    verdicts: {
      oob: 'real design gap: no map boundary, the rider leaves the 1 km tile',
      stuck: 'not a bug: nose-first at rest, by design; pump while carving escapes',
    },
    adapter: 'Board physics was already three.js-free with a fixed 120 Hz step. Real levels need the live tile server, so the adapter builds seeded synthetic tiles. About half a day.',
    notes: [
      'Persona rules (fighting vocabulary) were dropped; archetype, skill and reaction time carried over.',
      'New action vocabulary and situation buckets: road, offroad, wall, air, bail.',
      'A first "softlock" invariant gave 16 false positives; the game has no fail state, so not moving is a choice. It is now counted as "stalled", not a bug.',
    ],
  },
  'clean-getaway': {
    order: 3, name: 'Clean Getaway', genre: '9-seat heist, investigation and trial (state machine)',
    command: 'node --import tsx adapters/crowd.mjs --game clean-getaway --n 100 --fuzz 100 --seed 1',
    verdicts: {},
    adapter: 'Pure engine with explicit time and its own seeded RNG; only player ids needed seeding. Fuzz goes through the server\'s own parseAction. About half a day.',
    notes: [
      'Moves are typed actions with arguments, not a key mask, so the replay records actions.',
      'Competent play is the game\'s own bot; the archetype sets how a persona deviates from it.',
      'Zero events is a real result: a well-tested state machine with input validation held up. Constructed bad states do trip the detectors in tests.',
    ],
  },
};
for (const [id, g] of Object.entries(GAMES)) {
  const s = read(`./${id}/out/summary.json`);
  write(id, {
    id, order: g.order, name: g.name, genre: g.genre, recordedAt: new Date().toISOString().slice(0, 10), command: g.command,
    players: { personas: s.personas, fuzzers: s.fuzzers }, rounds: s.rounds,
    roundsPerSecond: s.roundsPerSecond, speedNote: `One core, ${s.wallSeconds} s wall, ${s.simSecondsPerWallSecond} simulated seconds per wall second.`,
    outcomes: s.outcomes, stalledRounds: s.roundsStalled || undefined,
    events: s.clusters.map((c) => ({
      kind: c.sig, rounds: c.rounds, verdict: g.verdicts[c.sig] ?? 'not reviewed',
      example: { player: c.example.p, seed: c.example.seed, t: c.example.t },
    })),
    replays: { checked: s.replayed, matched: s.replayMatched, note: 'Every round with an event plus every 10th round, replayed from recorded inputs alone; hash and event list compared.' },
    adapter: g.adapter, notes: g.notes,
  });
}
console.log('wrote', new URL('.', out).pathname);
