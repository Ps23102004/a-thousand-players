"use client";
import { useState } from "react";
import type { CrowdRow, Dropped, Evidence, Recommendation, Source } from "@/lib/advisor";
import corpusJson from "@/data/reviews/corpus.json";
import { parseReviewCorpus } from "@/lib/reviews";
import ReviewEvidence from "./ReviewEvidence";

const corpus = parseReviewCorpus(corpusJson);

interface Answer {
  frameNotes: string; frameTimes: number[]; sources: Source[]; searches: { run: number; failed: number };
  recommendations: Recommendation[]; proposed: number; dropped: Dropped; models: { vision: string; synthesis: string }; generatedAt: string;
  cached?: boolean; cachedNotice?: string;
}

/** Downscales a PNG frame to a 640 px wide JPEG so four of them stay well under the request size limit. */
async function shrink(pngBase64: string): Promise<string> {
  const img = new Image();
  img.src = `data:image/png;base64,${pngBase64}`;
  await img.decode();
  const w = 640, h = Math.round((img.height / img.width) * w);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return c.toDataURL("image/jpeg", 0.72).split(",")[1];
}

/** Asks the embedded replay (game/replay.html) for frames at the given seconds, the same postMessage path Eyes mode uses. */
function capture(times: number[]): Promise<string[]> {
  const frame = document.querySelector<HTMLIFrameElement>("iframe.game-frame");
  if (!frame?.contentWindow) return Promise.reject(new Error("The 3D replay has not loaded yet."));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { window.removeEventListener("message", onMsg); reject(new Error("The replay did not return frames in time.")); }, 90000);
    function onMsg(ev: MessageEvent) {
      if (ev.origin !== window.location.origin || ev.data?.type !== "frames") return;
      clearTimeout(timer); window.removeEventListener("message", onMsg);
      resolve(ev.data.frames as string[]);
    }
    window.addEventListener("message", onMsg);
    frame.contentWindow!.postMessage({ type: "capture", times }, window.location.origin);
  });
}

function EvidenceItem({ e, times }: { e: Evidence; times: number[] }) {
  if (e.type === "frame") return <li><span className="chip">frame</span> Frame {e.index} ({times[e.index - 1]} s){e.note ? `: ${e.note}` : ""}</li>;
  if (e.type === "crowd") return <li><span className="chip">crowd</span> {e.label}: <strong>{e.display}</strong> <code>{e.row}</code></li>;
  if (e.type === "review") return <li><ReviewEvidence review={{ ...e, text: e.quote }} /></li>;
  return <li><span className="chip">web</span> <a href={e.url} target="_blank" rel="noreferrer noopener">{e.title}</a> <span style={{ color: "var(--muted)", wordBreak: "break-all" }}>{e.url}</span></li>;
}

export default function AdvisorClient({ roundKey, times, crowd, gameTextLines }: { roundKey: string; times: number[]; crowd: CrowdRow[]; gameTextLines: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ data: Answer; shots: string[] } | null>(null);

  async function run() {
    setBusy(true); setError(null); setAnswer(null);
    try {
      const frames = await Promise.all((await capture(times)).map(shrink));
      const res = await fetch("/api/advisor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: roundKey, frames }) });
      const body = await res.json().catch(() => ({ error: `Unexpected response (HTTP ${res.status}).` }));
      if (!res.ok) setError(`${body.error ?? "Request failed."} (HTTP ${res.status})`);
      else setAnswer({ data: body as Answer, shots: frames });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const a = answer?.data;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 24 }}>
      <div className="panel">
        <h2 style={{ fontSize: "1.2rem", marginBottom: 8 }}>Crowd evidence for this game</h2>
        <p style={{ color: "var(--muted)", marginBottom: 12, fontSize: "0.9rem" }}>
          Computed by code from the recorded crowd run (simulated players, not people). The advisor cites rows by id; it cannot change a number.
        </p>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Row</th><th>Measure</th><th className="num">Value</th></tr></thead>
            <tbody>{crowd.map((r) => <tr key={r.id}><td><code>{r.id}</code></td><td>{r.label}</td><td className="num">{r.display}</td></tr>)}</tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ fontSize: "1.2rem", marginBottom: 8 }}>Player opinion (public reviews)</h2>
        <p>{corpus.entries.length} public review quotes in the committed corpus. Cited retrieval with attribution; no training or fine-tuning.</p>
        {corpus.placeholder ? <p className="notice" style={{ marginTop: 10 }}>Review collection is pending. No public review evidence is included yet.</p> : (
          <details style={{ marginTop: 10 }}><summary>View the committed review quotes</summary>
            <ul style={{ paddingLeft: 18, display: "grid", gap: 12 }}>{corpus.entries.map((r, i) => <li key={i}><ReviewEvidence review={r} /></li>)}</ul>
          </details>
        )}
        <p style={{ color: "var(--muted)", marginTop: 10, fontSize: "0.85rem" }}>The advisor selects up to eight quotes by theme overlap with the crowd findings. Each quote is one attributed opinion, not a measure of player agreement or proof that a suggested change works.</p>
      </div>

      <div className="panel">
        <h2 style={{ fontSize: "1.2rem", marginBottom: 8 }}>Run the advisor</h2>
        <p style={{ color: "var(--muted)", marginBottom: 12, fontSize: "0.9rem" }}>
          One click makes one vision call (4 frames), three web searches that the server words itself, and one Nemotron Super call (a second only if the first answer is not JSON). It also reads {gameTextLines} lines of the game&apos;s own text. Nothing you type reaches a search query.
        </p>
        <button className="btn" type="button" onClick={run} disabled={busy}>{busy ? "Capturing frames and asking..." : "Capture 4 frames and get suggestions"}</button>
      </div>

      <div aria-live="polite" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 24 }}>
        {error && <p className="notice notice-error">{error}</p>}
        {a?.cachedNotice && <p className="notice">{a.cachedNotice}</p>}
        {answer && a && (
          <>
            <div className="panel">
              <h2 style={{ fontSize: "1.2rem", marginBottom: 8 }}>Frames used</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginBottom: 12 }}>
                {answer.shots.map((s, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={`data:image/jpeg;base64,${s}`} alt={`Frame ${i + 1} at ${times[i]} seconds`} style={{ width: "100%", borderRadius: 6 }} />
                ))}
              </div>
              <details><summary>What the vision model said it saw</summary><p style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{a.frameNotes}</p></details>
            </div>

            <div>
              <h2 style={{ fontSize: "1.4rem", marginBottom: 8 }}>Suggestions</h2>
              <p style={{ color: "var(--muted)", marginBottom: 12, fontSize: "0.9rem" }}>
                The model wrote {a.proposed}; {a.recommendations.length} passed validation and {a.dropped.recommendations} {a.dropped.recommendations === 1 ? "was" : "were"} dropped
                {a.dropped.reasons.length ? ` (${a.dropped.reasons.join("; ")})` : ""}. {a.dropped.evidence} cited {a.dropped.evidence === 1 ? "item was" : "items were"} discarded as invalid (an unknown source, frame or row).
              </p>
              {a.recommendations.length === 0 && <p className="notice">Nothing survived validation. That is the safe outcome when the model cites things it was not given.</p>}
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
                {a.recommendations.map((r, i) => (
                  <article key={i} className="panel" aria-label={`Suggestion ${i + 1}: ${r.area}`}>
                    <div className="chips" style={{ marginBottom: 8 }}>
                      <span className="chip">{r.area}</span>
                      <span className={r.strength === "supported by crowd data" ? "chip chip-ok" : "chip"} style={{ whiteSpace: "normal" }}>{r.strength}</span>
                      {r.evidence.some((e) => e.type === "review") && <span className="chip" style={{ whiteSpace: "normal" }}>Review-sourced suggestion</span>}
                    </div>
                    <p style={{ marginBottom: 10 }}>{r.suggestion}</p>
                    {r.strength === "supported by crowd data" && <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 10 }}>The crowd data shows the problem. The suggested fix itself is untested.</p>}
                    <ul style={{ margin: "0 0 10px", paddingLeft: 18, display: "grid", gap: 4 }} aria-label="Evidence">{r.evidence.map((e, k) => <EvidenceItem key={k} e={e} times={times} />)}</ul>
                    <p className="mono" style={{ fontSize: "0.85rem" }}><strong>How to test:</strong> {r.howToTest}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="panel">
              <h2 style={{ fontSize: "1.2rem", marginBottom: 8 }}>{a.sources.some((s) => s.kind === "review") ? "Search and review sources" : "Sources the searches returned"}</h2>
              {a.sources.length ? (
                <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                  {a.sources.map((s, i) => <li key={`${s.url}:${i}`}>{s.kind === "review" && s.review ? <ReviewEvidence review={s.review} /> : <><a href={s.url} target="_blank" rel="noreferrer noopener">{s.title}</a><div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{s.snippet}</div></>}</li>)}
                </ul>
              ) : <p className="notice">No search results came back, so no suggestion can cite the web.</p>}
              <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 10 }}>{a.searches.run - a.searches.failed} of {a.searches.run} searches succeeded. Models: {a.models.vision} (frames), {a.models.synthesis} (suggestions). Runtime search domains are limited to developer and design sites; review quotes come from the committed corpus.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
