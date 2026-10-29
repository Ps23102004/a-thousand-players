"use client";
import { useState } from "react";
import { TRIAGE_CALIBRATION as CAL } from "@/lib/calibration";
import type { ReproMatch, TriageLiveResponse, TriageVerdict } from "@/lib/web-types";

const VERDICT: Record<TriageVerdict, { label: string; cls: string }> = {
  fixed: { label: "fixed: the replay has no bug events", cls: "chip-ok" },
  "not-fixed": { label: "not fixed: the replay still breaks", cls: "chip-warn" },
  "patch-did-not-apply": { label: "patch did not apply", cls: "chip-warn" },
  "not-a-bug": { label: "Ultra says this is legitimate gameplay", cls: "chip-warn" },
  "reused-shipped-fix": { label: "not credited: the patch only switches on a fix the game already ships", cls: "chip-warn" },
};
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const sideText = (s: { out: string; t: number; bugs: string[]; bugEvents: number; crash: string | null }) =>
  `${s.bugEvents} bug event${s.bugEvents === 1 ? "" : "s"}${s.bugs.length ? ` (${s.bugs.join(", ")})` : ""}, ${s.out} at ${s.t}s${s.crash ? `, crash: ${s.crash}` : ""}`;

/** One Repro match: the recorded round plus a "Triage this" button that makes ONE live Nemotron Ultra call and replays the seed with its patch. */
export default function MatchRow({ m }: { m: ReproMatch }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TriageLiveResponse | null>(null);

  async function triage() {
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/triage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p: m.p, round: m.round }) });
      const body = await res.json().catch(() => ({ error: `Unexpected response (HTTP ${res.status}).` }));
      if (!res.ok) setError(`${body.error ?? "Request failed."} (HTTP ${res.status})`);
      else setResult(body as TriageLiveResponse);
    } catch {
      setError("Network error. Is the server running?");
    } finally {
      setBusy(false);
    }
  }

  const v = result ? VERDICT[result.verdict] : null;
  return (
    <>
      <tr>
        <td>{m.name} <span style={{ color: "var(--muted)" }}>({m.archetype})</span></td>
        <td className="num">{m.round}</td>
        <td className="mono" style={{ fontSize: "0.85em" }}>{m.events.map((e) => `${e[1]}${e[3] !== undefined ? ` ${e[3]}` : ""} @${e[0]}s`).join(", ")}</td>
        <td>{m.out} at {m.t}s</td>
        <td>
          <div className="chips">
            <a className="chip" href={m.href}>▶ seed {m.seed}</a>
            <button className="chip" type="button" onClick={triage} disabled={busy} style={{ cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 }} aria-label={`Triage round ${m.round} of ${m.name} with Nemotron Ultra`}>
              {busy ? "Ultra is reading the code (up to 2 tries)..." : result ? "Triage again" : "Triage this (Ultra)"}
            </button>
          </div>
        </td>
      </tr>
      {(busy || error || result) && (
        <tr>
          <td colSpan={5} style={{ padding: "12px 16px 20px" }} aria-live="polite">
            {busy && <p className="mono" style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Replaying seed {m.seed} for the evidence timeline, asking Nemotron Ultra for a root cause and patch (up to 40 s), then replaying the seed again with the patch applied.</p>}
            {error && <p className="notice notice-error">{error}</p>}
            {result && v && (
              <div className="finding" style={{ gap: 12 }}>
                <div className="chips">
                  <span className={`chip ${v.cls}`}>{v.label}</span>
                  <span className="chip">{result.signature}</span>
                  <span className="chip">{result.sameSignature} recorded round{result.sameSignature === 1 ? "" : "s"} share this signature</span>
                  <span className="chip">Ultra {secs(result.ms.model)} · {result.triage.tokensIn.toLocaleString()} tokens in</span>
                  <span className="chip" title="Ultra's own number, not calibrated: see the line below">Ultra states {Math.round(result.triage.confidence * 100)}% confidence</span>
                </div>
                <p className="mono" style={{ fontSize: "0.8rem", color: "var(--muted)", margin: 0 }}>
                  Stated {Math.round(result.triage.confidence * 100)}% vs observed: {result.verdict === "fixed" ? "the replay is clean" : "the replay did not credit a fix"}.
                  {" "}Ultra&apos;s confidence is not calibrated. In {CAL.triages} measured triages it said {Math.round(CAL.minConfidence * 100)}-{Math.round(CAL.maxConfidence * 100)}% every time, and {CAL.fixed} of the {CAL.triages} patches fixed the replay
                  {" "}(Brier {CAL.brier.toFixed(2)}; always saying {Math.round((CAL.fixed / CAL.triages) * 100)}% would score {CAL.baseRateBrier.toFixed(2)}). The replay verdict decides; the number does not.
                </p>
                <h3 style={{ fontSize: "1.05rem", margin: 0 }}>{result.triage.title}</h3>
                <div><div className="label">Root cause (Nemotron Ultra)</div><p>{result.triage.rootCause}</p></div>
                {result.triage.playerImpact && <div><div className="label">Player impact</div><p>{result.triage.playerImpact}</p></div>}
                <div>
                  <div className="label">Patch{result.applied.some((a) => !a.ok) ? ` · ${result.applied.filter((a) => !a.ok).map((a) => `${a.file}: ${a.why}`).join("; ")}` : ""}</div>
                  {result.triage.patches.length ? result.triage.patches.map((p, i) => (
                    <pre key={i} className="diff" aria-label={`Patch to ${p.file}`}>
                      <span className="diff-file">{p.file}{"\n"}</span>
                      <span className="diff-del">{`- ${p.find}\n`}</span>
                      <span className="diff-add">{`+ ${p.replace}`}</span>
                    </pre>
                  )) : <p className="notice">No patch proposed.</p>}
                </div>
                <div>
                  <div className="label">Replay of seed {result.seed}, decided by code</div>
                  <p className="mono" style={{ fontSize: "0.85rem" }}>
                    shipped game: {sideText(result.before)}<br />
                    {result.after ? <>with the patch: {sideText(result.after)}</> : result.afterError ?? "with the patch: not replayed"}
                  </p>
                  <p className="mono" style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 6 }}>
                    Both replays use the recorded tuning {JSON.stringify(result.tuning)} so the round reproduces as recorded; the shipped game&apos;s own hand fix for mount release is switched off by it.
                    {result.verdict === "fixed" && <> One seed, no regression crowd: &quot;fixed&quot; means this one round runs clean, not that the game is fixed.</>}
                    Timings: replay {secs(result.ms.replayBefore)}, model {secs(result.ms.model)}, patch + replay {secs(result.ms.replayAfter)}.
                  </p>
                </div>
                <div className="chips"><a className="chip" href={result.href}>▶ replay seed {result.seed}</a></div>
                <details>
                  <summary>Evidence timeline Ultra read ({result.timeline.length} rows, 10 Hz around the first bug event)</summary>
                  <pre style={{ fontSize: "0.72rem", maxHeight: 320, overflow: "auto" }}>{result.timeline.join("\n")}</pre>
                </details>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
