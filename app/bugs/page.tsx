import type { Metadata } from "next";
import SourceTag from "@/components/SourceTag";
import { getData, getTriage } from "@/lib/data";
import type { BugView, RegressionSide } from "@/lib/web-types";

export const metadata: Metadata = { title: "Bugs · A Thousand Players" };

const VERDICT: Record<string, { label: string; cls: string }> = {
  fixed: { label: "fix verified", cls: "chip-ok" },
  "fixed-by-hand": { label: "fixed by hand (Ultra failed)", cls: "chip-ok" },
  "partially-fixed": { label: "partly fixed", cls: "chip-warn" },
  "not-fixed": { label: "not fixed", cls: "chip-warn" },
  "did-not-reproduce": { label: "bug did not reproduce, no verdict", cls: "chip-warn" },
  "patch-did-not-apply": { label: "patch did not apply", cls: "chip-warn" },
};
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function Side({ name, s }: { name: string; s: RegressionSide }) {
  return <tr><th scope="row">{name}</th><td>{s.rounds}</td><td>{pct(s.winRate)}</td><td>{s.avgT.toFixed(2)} s</td><td>{s.bugRounds}</td></tr>;
}

function BugCard({ b }: { b: BugView }) {
  if (b.error) {
    return (
      <article className="panel finding" aria-labelledby={`${b.id}-title`}>
        <div className="finding-top">
          <span className="chip chip-warn">triage failed</span>
          <span className="chip">{b.signature}</span>
          <span className="chip">{b.count} rounds</span>
        </div>
        <h2 id={`${b.id}-title`} style={{ fontSize: "1.2rem" }}>{b.id}: no triage</h2>
        <p className="notice notice-error">{b.error}</p>
        <a className="chip" href={b.replay}>▶ replay representative round</a>
      </article>
    );
  }
  const v = VERDICT[b.verdict ?? ""] ?? { label: b.verdict ?? "not verified", cls: "chip-warn" };
  const r = b.regression;
  return (
    <article className="panel finding" aria-labelledby={`${b.id}-title`}>
      <div className="finding-top">
        <span className={`sev sev-${b.severity ?? "low"}`}>{b.severity === "med" ? "medium" : b.severity}</span>
        <span className={`chip ${v.cls}`}>{v.label}{b.verifyRounds ? ` · ${b.fixedRounds ?? 0} of ${b.verifyRounds} seeds` : ""}</span>
        {b.isRealBug === false && <span className="chip chip-warn">not a real bug</span>}
        <span className="chip">{b.signature}</span>
        <span className="chip">{b.count} rounds hit it</span>
        {b.confidence !== undefined && <span className="chip">confidence {Math.round(b.confidence * 100)}%</span>}
      </div>
      <h2 id={`${b.id}-title`} style={{ fontSize: "1.2rem" }}>{b.title}</h2>

      <div><div className="label">Root cause</div><p>{b.rootCause}</p></div>
      {b.playerImpact && <div><div className="label">Player impact</div><p>{b.playerImpact}</p></div>}

      <div>
        <div className="label">Patch{b.attempts && b.attempts > 1 ? ` (attempt ${b.attempts})` : ""}</div>
        {b.patches.length ? b.patches.map((p, i) => (
          <pre key={i} className="diff" aria-label={`Patch to ${p.file}`}>
            <span className="diff-file">{p.file}{"\n"}</span>
            <span className="diff-del">{`- ${p.find}\n`}</span>
            <span className="diff-add">{`+ ${p.replace}`}</span>
          </pre>
        )) : <p className="notice">No patch proposed.</p>}
      </div>

      {r && (
        <div>
          <div className="label">Regression run · {r.personas} personas · patch fixed {b.fixedRounds} of {b.verifyRounds} replayed rounds</div>
          <table className="regress">
            <thead><tr><th scope="col" /><th scope="col">rounds</th><th scope="col">win rate</th><th scope="col">avg round</th><th scope="col">bug rounds</th></tr></thead>
            <tbody><Side name="shipped" s={r.shipped} /><Side name="patched" s={r.patched} /></tbody>
          </table>
        </div>
      )}

      <div className="chips"><a className="chip" href={b.replay}>▶ replay representative seed</a></div>
    </article>
  );
}

export default function BugsPage() {
  const bugs = getTriage();
  const fixed = bugs.filter((b) => b.verdict === "fixed" || b.verdict === "fixed-by-hand").length;
  const failed = bugs.filter((b) => b.error).length;
  return (
    <section className="section wrap" aria-labelledby="bugs-title">
      <div className="section-head">
        <div>
          <div className="kicker">Bug triage · {getData().source === "fixtures" ? "sample" : "crowd run"}</div>
        <SourceTag recorded="Ultra triage and seed replays" live="Triage this on Repro" />
          <h1 id="bugs-title" style={{ fontSize: "clamp(1.8rem, 5vw, 3rem)", marginTop: 8 }}>Bugs the crowd found</h1>
        </div>
      </div>
      {bugs.length ? (
        <>
          <p className="lede" style={{ marginBottom: 20 }}>
            {bugs.length} clusters of game-breaking states. Nemotron Ultra read the source and a replayed timeline for each, proposed a patch, and the engine re-ran the game with it applied.
            {" "}{fixed} verified fixed{failed ? `, ${failed} where triage failed` : ""}. Patches are suggestions, not commits.
          </p>
          <div className="grid-2">{bugs.map((b) => <BugCard key={b.id} b={b} />)}</div>
        </>
      ) : (
        <p className="notice">No bug triage for this run yet. Run <code>ai/cli/triage.ts</code>.</p>
      )}
    </section>
  );
}
