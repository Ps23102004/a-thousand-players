import type { Metadata } from "next";
import Link from "next/link";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import SourceTag from "@/components/SourceTag";

export const metadata: Metadata = { title: "Games · A Thousand Players" };

/** One file per game in data/games/, written by adapters/export-games.mjs. */
interface GameResult {
  id: string; order: number; name: string; genre: string; recordedAt?: string; command: string;
  players: { personas: number; fuzzers: number }; rounds: number; roundsPerSecond: number; speedNote: string;
  outcomes: Record<string, number>; stalledRounds?: number;
  events: { kind: string; rounds: number; verdict: string; example: { player: string; seed: number; t: number } }[];
  replays: { checked: number; matched: number; note: string };
  adapter: string; notes: string[];
}

function loadGames(): GameResult[] {
  const dir = join(process.cwd(), "data/games");
  return readdirSync(dir).filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as GameResult)
    .sort((a, b) => a.order - b.order);
}

function GameCard({ g }: { g: GameResult }) {
  const allMatch = g.replays.matched === g.replays.checked;
  return (
    <article className="panel finding" aria-labelledby={`${g.id}-title`} data-game={g.id}>
      <div className="finding-top">
        <span className="chip">{g.rounds.toLocaleString("en-US")} rounds</span>
        <span className="chip" title={g.speedNote}>{g.roundsPerSecond} rounds/s</span>
        <span className={`chip ${allMatch ? "chip-ok" : "chip-warn"}`}>replays {g.replays.matched} of {g.replays.checked} match</span>
      </div>
      <h2 id={`${g.id}-title`} style={{ fontSize: "1.2rem" }}>{g.name}</h2>
      <p className="lede" style={{ margin: 0 }}>{g.genre}</p>

      <dl className="kv">
        <dt>players</dt><dd>{g.players.personas} personas{g.players.fuzzers ? ` + ${g.players.fuzzers} fuzzers` : ""}</dd>
        <dt>outcomes</dt><dd>{Object.entries(g.outcomes).map(([k, v]) => `${v} ${k}`).join(", ")}</dd>
        {g.stalledRounds ? <><dt>stalled</dt><dd>{g.stalledRounds} rounds (counted, not a bug)</dd></> : null}
        <dt>speed</dt><dd>{g.speedNote}</dd>
      </dl>

      <div>
        <div className="label">What the crowd found</div>
        {g.events.length ? (
          <ul style={{ paddingLeft: 18, margin: "6px 0" }}>
            {g.events.map((e) => (
              <li key={e.kind} style={{ marginBottom: 6 }}>
                <code style={{ overflowWrap: "anywhere" }}>{e.kind}</code> · {e.rounds} {e.rounds === 1 ? "round" : "rounds"} · {e.verdict}
                {" "}<span className="chip" style={{ whiteSpace: "normal" }}>seed {e.example.seed} · {e.example.player} at {e.example.t} s</span>
              </li>
            ))}
          </ul>
        ) : <p>No invariant events. No crash, NaN, out-of-bounds actor, duplicate seat, overdue phase or case closed without an outcome.</p>}
      </div>

      <div><div className="label">How replays held up</div><p>{g.replays.matched} of {g.replays.checked} replays match. {g.replays.note}</p></div>
      <div><div className="label">What the adapter needed</div><p>{g.adapter}</p></div>
      <div>
        <div className="label">What had to change</div>
        <ul style={{ paddingLeft: 18, margin: "6px 0" }}>{g.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      </div>
      <div className="label">Reproduce</div>
      <pre className="diff" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{g.command}</pre>
      {g.id === "market-brawl" && <div className="chips"><Link className="chip" href="/bugs">Bug triage for Market Brawl</Link></div>}
    </article>
  );
}

export default function GamesPage() {
  const games = loadGames();
  return (
    <section className="section wrap" aria-labelledby="games-title">
      <div className="section-head">
        <div>
          <div className="kicker">Generality · {games.length} games</div>
          <SourceTag recorded="headless crowd runs, no model calls" />
          <h1 id="games-title" style={{ fontSize: "clamp(1.8rem, 5vw, 3rem)", marginTop: 8 }}>Does it work beyond one game?</h1>
        </div>
      </div>
      <p className="lede" style={{ marginBottom: 20 }}>
        The same crowd harness ran on two more games far from a fighting game: a longboard physics ride and a nine-seat heist and trial.
        Each needed a thin adapter (seeded sim, action vocabulary, invariants). The harness carried over; the persona rules did not.
      </p>
      <div className="grid-2">{games.map((g) => <GameCard key={g.id} g={g} />)}</div>

      <h2 style={{ fontSize: "1.4rem", margin: "32px 0 12px" }}>Honest limits</h2>
      <ul className="limits">
        <li><strong>Bully remake: not testable here</strong>Unreal Engine 5.8 and C++, not a web project. It needs the UE editor and assets from an owned copy of the original game. A headless UE build could run it, but that is a different adapter (input injection and a state hash on the game thread): days, not hours.</li>
        <li><strong>GTA V: not testable</strong>A commercial PC and console game. It cannot be run or driven headless here, and no browser clone is on this machine.</li>
        <li><strong>Persona rules are fighting-game rules</strong>The Nemotron-written rules (distance, rival, punch) were dropped for both games. Archetype, skill and reaction time carried over. Rewriting rules per game would need a model call per game; not done.</li>
        <li><strong>Bug yield depends on the game</strong>One real design gap in Homeground, none in Clean Getaway. Market Brawl has the most because two physics bodies collide in real time, which is where a crowd earns its keep.</li>
      </ul>
      <p style={{ marginTop: 16 }}>How to add a game: <code>adapters/README.md</code>. Full write-up: <code>docs/generality.md</code>.</p>
    </section>
  );
}
