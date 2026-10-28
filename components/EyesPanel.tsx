"use client";
import { useState } from "react";

/** Downscales a PNG frame to a 640 px wide JPEG so three of them stay well under the request size limit. */
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

/** Eyes mode: grabs frames from the embedded replay and asks Nemotron Super-VL what it sees. It describes; it does not decide. */
export default function EyesPanel({ times, defaultQuestion }: { times: number[]; defaultQuestion: string }) {
  const [question, setQuestion] = useState(defaultQuestion);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ text: string; shots: string[] } | null>(null);

  function capture(): Promise<string[]> {
    const frame = document.querySelector<HTMLIFrameElement>("iframe.game-frame");
    if (!frame?.contentWindow) return Promise.reject(new Error("The 3D replay has not loaded yet."));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { window.removeEventListener("message", onMsg); reject(new Error("The replay did not return frames in time.")); }, 60000);
      function onMsg(ev: MessageEvent) {
        if (ev.origin !== window.location.origin || ev.data?.type !== "frames") return;
        clearTimeout(timer); window.removeEventListener("message", onMsg);
        resolve(ev.data.frames as string[]);
      }
      window.addEventListener("message", onMsg);
      frame.contentWindow!.postMessage({ type: "capture", times }, window.location.origin);
    });
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setAnswer(null);
    try {
      const frames = await Promise.all((await capture()).map(shrink));
      const res = await fetch("/api/eyes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ frames, question }) });
      const body = await res.json().catch(() => ({ error: `Unexpected response (HTTP ${res.status}).` }));
      if (!res.ok) setError(`${body.error ?? "Request failed."} (HTTP ${res.status})`);
      else setAnswer({ text: body.text, shots: frames });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <h2 style={{ fontSize: "1.2rem", marginBottom: 8 }}>Eyes: ask Nemotron Super-VL what is on screen</h2>
      <p className="mono" style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: 12 }}>
        Captures 3 frames from this replay at {times.map((t) => `${t}s`).join(", ")} and sends them to the vision model. It describes what it sees and can be wrong; the engine&apos;s invariant checks, not this answer, decide what counts as a bug.
      </p>
      <form onSubmit={ask}>
        <label htmlFor="eyes-q">Question</label>
        <textarea id="eyes-q" rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} required />
        <div style={{ marginTop: 12 }}><button className="btn" type="submit" disabled={busy || !question.trim()}>{busy ? "Capturing and asking..." : "Look at 3 frames"}</button></div>
      </form>
      <div aria-live="polite" style={{ marginTop: 16 }}>
        {error && <p className="notice notice-error">{error}</p>}
        {answer && (
          <>
            <p style={{ marginBottom: 12 }}>{answer.text}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
              {answer.shots.map((s, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={`data:image/jpeg;base64,${s}`} alt={`Frame ${i + 1} at ${times[i]} seconds`} style={{ width: "100%", borderRadius: 6 }} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
