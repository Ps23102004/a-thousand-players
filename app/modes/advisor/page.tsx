import type { Metadata } from "next";
import { existsSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { advisorContext } from "@/app/api/advisor/context";
import GameEmbed from "@/components/GameEmbed";
import SourceTag from "@/components/SourceTag";
import { DEFAULT_ROUND, parseRoundInput } from "@/lib/advisor";
import { findRound, getData, recordedTuning } from "@/lib/data";
import { decodeToken, encodeToken, fighterFor } from "@/lib/replay-token";
import AdvisorClient from "./AdvisorClient";

export const metadata: Metadata = { title: "Design Advisor · A Thousand Players" };

export default async function AdvisorPage({ searchParams }: { searchParams: Promise<{ round?: string }> }) {
  const { round: input } = await searchParams;
  const parsed = parseRoundInput(input);
  const byToken = parsed.token ? findRound(undefined, decodeToken(parsed.token)?.seed).run : undefined;
  const key = parsed.key ?? (byToken ? `${byToken.p}:${byToken.round}` : undefined);
  const ctx = key ? advisorContext(key) : null;
  const run = key ? getData().runs.get(key) : undefined;

  return (
    <section className="section wrap" aria-labelledby="advisor-title">
      <div className="kicker">Mode · Design Advisor</div>
      <SourceTag live="Super-VL describes 4 frames, Super writes the suggestions" recorded="crowd table computed from data/run-main" />
      <h1 id="advisor-title" style={{ fontSize: "clamp(2rem, 5vw, 3.2rem)", margin: "10px 0 16px" }}>What would a design reviewer change?</h1>
      <p className="lede" style={{ marginBottom: 20 }}>
        A vision model looks at four frames of one recorded round. The crowd data shows where simulated players quit, exploit and struggle. The game&apos;s own text is read for tone and clarity.
        Three web searches fetch what developers have written about comparable fighting games. Then one Nemotron Super call (a second only if the first answer is not JSON) turns all of it into at most six suggestions, and code throws away any that cite something it was not given.
      </p>
      <div className="notice" role="note" style={{ marginBottom: 24 }}>
        <strong>Not trained on viral or player-preference data.</strong> These are cited suggestions from a vision model, your crowd data and current web writeups. They are not measured; test gameplay ones with the crowd and visual ones with people. Code checks that cited evidence exists, not that it is relevant.
      </div>

      <form className="panel" method="get" action="/modes/advisor" style={{ marginBottom: 24 }}>
        <label htmlFor="round-input">Round (a key like {DEFAULT_ROUND}, or a Market Brawl replay link)</label>
        <input id="round-input" name="round" type="text" defaultValue={input ?? ""} placeholder={DEFAULT_ROUND} maxLength={300} style={{ width: "100%" }} />
        <div style={{ marginTop: 12 }}><button className="btn btn-ghost" type="submit">Load this round</button></div>
      </form>

      {!ctx || !run || !key ? (
        <p className="notice notice-error" role="alert">
          That round is not in the recorded data. Use a key such as <code>{DEFAULT_ROUND}</code>, or pick a round from <Link href="/#crowd">the crowd</Link>.
        </p>
      ) : (
        <AdvisorView ctx={ctx} round={{ key, out: run.out, t: run.t, seed: run.seed }} embed={<RoundEmbed run={run} />} />
      )}
    </section>
  );
}

function RoundEmbed({ run }: { run: NonNullable<ReturnType<ReturnType<typeof getData>["runs"]["get"]>> }) {
  const token = encodeToken({ seed: run.seed, tuning: recordedTuning(), fighter: fighterFor(run.p), maxT: Math.ceil(run.t), persona: getData().personas.get(run.p) });
  return <GameEmbed token={token} available={existsSync(join(process.cwd(), "public/game/replay.html"))} />;
}

function AdvisorView({ ctx, round, embed }: { ctx: NonNullable<ReturnType<typeof advisorContext>>; round: { key: string; out: string; t: number; seed: number }; embed: React.ReactNode }) {
  return (
    <>
      <div className="panel" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: 8 }}>The round: {round.key}, {round.out} in {round.t.toFixed(1)} s (seed {round.seed})</h2>
        <p className="mono" style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: 12 }}>
          The advisor re-simulates this seed in the embedded game below and captures frames at {ctx.frameTimes.map((t) => `${t} s`).join(", ")}. The frames are the 3D canvas only; the on-screen health bars are not in them, so UI legibility is judged from the game&apos;s text, not from pixels.
        </p>
        {embed}
      </div>
      <AdvisorClient roundKey={round.key} times={ctx.frameTimes} crowd={ctx.crowd} gameTextLines={ctx.gameText.length} />
    </>
  );
}
