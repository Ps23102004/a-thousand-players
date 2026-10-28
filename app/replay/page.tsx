import type { Metadata } from "next";
import SourceTag from "@/components/SourceTag";
import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import EyesPanel from "@/components/EyesPanel";
import GameEmbed, { CopyLink } from "@/components/GameEmbed";
import ReplayScrubber from "@/components/ReplayScrubber";
import { findRound, getData, recordedTuning } from "@/lib/data";
import { captureTimes, DEFAULT_QUESTION } from "@/lib/eyes";
import { decodeToken, encodeToken, fighterFor } from "@/lib/replay-token";

export const metadata: Metadata = { title: "Replay · A Thousand Players" };

export default async function ReplayPage({ searchParams }: { searchParams: Promise<{ t?: string; key?: string }> }) {
  const { t, key } = await searchParams;
  const decoded = decodeToken(t);
  const { traces, personas } = getData();
  const { run, trace } = findRound(key, decoded?.seed);
  const token = decoded ?? (run ? { seed: run.seed, tuning: recordedTuning(), fighter: fighterFor(run.p), maxT: Math.ceil(run.t), persona: personas.get(run.p) } : null);

  if (!token) {
    return (
      <section className="section wrap">
        <h1>Replay</h1>
        <p className="notice" style={{ marginTop: 20 }}>
          {t ? "This replay link is not valid." : "No replay selected."} Pick a round from <Link href="/#crowd">the crowd</Link> or a seed from <Link href="/#findings">a finding</Link>.
        </p>
      </section>
    );
  }

  const persona = token.persona ?? (run ? personas.get(run.p) : undefined);
  const tokenStr = decoded && t ? t : encodeToken(token);
  return (
    <>
      <section className="section wrap" aria-labelledby="replay-title">
        <div className="section-head">
          <div>
            <div className="kicker">Replay · seed {token.seed}</div>
        <SourceTag recorded="deterministic re-simulation of the seed" live="Eyes panel (Super-VL)" />
            <h1 id="replay-title" style={{ fontSize: "clamp(1.8rem, 5vw, 3rem)", marginTop: 8 }}>
              {persona ? `${persona.name}, the ${persona.archetype}` : `Seed ${token.seed}`}
              {run ? ` · round ${run.round} · ${run.out}` : ""}
            </h1>
          </div>
          <CopyLink />
        </div>

        <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))" }}>
          <div className="panel" style={{ gridColumn: "span 1" }}>
            <h2 style={{ fontSize: "1.1rem", marginBottom: 12 }}>2D trace</h2>
            {trace ? (
              <ReplayScrubber trace={trace} states={traces.states} halfWidth={traces.arenaHalfWidth} />
            ) : (
              <p className="notice">No recorded trace for this round. Only a sample of rounds keep a 10 Hz trace; the 3D replay below re-simulates it from the seed.</p>
            )}
          </div>
          <div className="panel">
            <h2 style={{ fontSize: "1.1rem", marginBottom: 12 }}>What this link replays</h2>
            <dl className="kv">
              <dt>seed</dt><dd>{token.seed}</dd>
              <dt>fighter</dt><dd>{token.fighter}</dd>
              <dt>tuning</dt><dd>{token.tuning ? `${Object.keys(token.tuning).length} overrides` : "baseline"}</dd>
              <dt>max time</dt><dd>{token.maxT} s</dd>
              <dt>driver</dt><dd>{token.inputs ? `${token.inputs.length} recorded inputs` : persona ? "persona policy (re-simulated)" : "none"}</dd>
              {persona && <><dt>persona</dt><dd>{persona.id} · skill {persona.skill} · {persona.rules.length} rules</dd><dt>bio</dt><dd>{persona.bio}</dd></>}
              {run && <><dt>result</dt><dd>{run.out} in {run.t.toFixed(1)} s · hp {run.hp[0]} vs {run.hp[1]}{run.live ? " · Nano live" : ""}</dd></>}
            </dl>
            <details>
              <summary>Raw token</summary>
              <pre>{JSON.stringify(token, null, 1)}</pre>
            </details>
          </div>
        </div>
      </section>

      <section className="section wrap" aria-labelledby="game-title">
        <div className="section-head">
          <h2 id="game-title">In the real game</h2>
          <p className="lede">Market Brawl re-runs the same seed, tuning and policy in the browser. The engine is built so the same inputs give the same match.</p>
        </div>
        {(() => {
          const available = existsSync(join(process.cwd(), "public/game/replay.html"));
          return (
            <>
              <GameEmbed token={tokenStr} available={available} />
              {available && <EyesPanel times={captureTimes(run, token.maxT)} defaultQuestion={DEFAULT_QUESTION} />}
            </>
          );
        })()}
      </section>
    </>
  );
}
