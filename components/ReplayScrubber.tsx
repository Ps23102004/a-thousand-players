"use client";
import { useEffect, useRef, useState } from "react";
import type { Trace } from "@/lib/types";

const C = { persona: "#8ccf1f", rival: "#c9cec6", hit: "#ff7a66", floor: "#2c2f32", muted: "#a2a79f" };

export default function ReplayScrubber({ trace, states, halfWidth }: { trace: Trace; states: string[]; halfWidth: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const last = trace.f.length - 1;
  const t = i * trace.dt;

  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) return;
    if (i >= last) { setPlaying(false); return; }
    const id = setTimeout(() => setI(i + 1), trace.dt * 1000);
    return () => clearTimeout(id);
  }, [playing, i, last, trace.dt]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const w = canvas.clientWidth, h = canvas.clientHeight, dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0c0d0e";
    ctx.fillRect(0, 0, w, h);
    const pad = 24, floorY = h * 0.8;
    const toX = (x: number) => pad + ((x + halfWidth) / (2 * halfWidth)) * (w - 2 * pad);
    ctx.fillStyle = C.floor;
    ctx.fillRect(pad, floorY, w - 2 * pad, 2);
    for (const x of [-halfWidth, halfWidth]) ctx.fillRect(toX(x) - 1, floorY - h * 0.5, 2, h * 0.5);

    const [x0, x1, hp0, hp1, s0, s1] = trace.f[i];
    const barW = (w - 3 * pad) / 2;
    ctx.fillStyle = "#1f2123";
    ctx.fillRect(pad, 16, barW, 10);
    ctx.fillRect(w - pad - barW, 16, barW, 10);
    ctx.fillStyle = C.persona;
    ctx.fillRect(pad, 16, (barW * hp0) / 100, 10);
    ctx.fillStyle = C.rival;
    ctx.fillRect(w - pad - (barW * hp1) / 100, 16, (barW * hp1) / 100, 10);

    const fh = h * 0.42, fw = Math.max(10, w * 0.03);
    const fighter = (x: number, state: string, color: string, label: string, labelY: number) => {
      const cx = toX(x);
      const down = /down|knock/i.test(state);
      ctx.fillStyle = /hit|stun/i.test(state) ? C.hit : color;
      ctx.beginPath();
      if (down) ctx.roundRect(cx - fh / 2, floorY - fw, fh, fw, fw / 2);
      else ctx.roundRect(cx - fw / 2, floorY - fh, fw, fh, fw / 2);
      ctx.fill();
      ctx.fillStyle = C.muted;
      ctx.font = "11px ui-monospace, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${label} · ${state}`, cx, labelY);
    };
    fighter(x0, states[s0] ?? "", C.persona, "player", floorY + 18);
    fighter(x1, states[s1] ?? "", C.rival, "rival", floorY + 34);
    for (const e of trace.ev) {
      if (e[1] !== "hit" || t - e[0] < 0 || t - e[0] > 0.3) continue;
      ctx.strokeStyle = C.hit;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(toX(e[2] === 0 ? x1 : x0), floorY - fh * 0.7, 8 + (t - e[0]) * 60, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [i, t, trace, states, halfWidth]);

  const [x0, x1, hp0, hp1, s0, s1] = trace.f[i];
  const recent = trace.ev.filter((e) => e[0] <= t).slice(-4).reverse();
  return (
    <div>
      <canvas ref={canvasRef} style={{ width: "100%", height: 280, display: "block", border: "1px solid var(--line)", borderRadius: 4 }}
        role="img" aria-label={`Top-down replay at ${t.toFixed(1)} s. Player at x ${x0.toFixed(1)} with ${hp0} hp (${states[s0]}), rival at x ${x1.toFixed(1)} with ${hp1} hp (${states[s1]}).`} />
      <div className="scrub-controls">
        <button type="button" className="btn btn-ghost" onClick={() => { if (i >= last) setI(0); setPlaying((p) => !p); }}>{playing ? "Pause" : "Play"}</button>
        <label htmlFor="scrub" className="sr-only">Replay time</label>
        <input id="scrub" type="range" min={0} max={last} value={i} onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }}
          aria-valuetext={`${t.toFixed(1)} seconds`} />
        <span aria-live="off" className="mono">{t.toFixed(1)} / {(last * trace.dt).toFixed(1)} s</span>
      </div>
      <p className="mono" style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 8 }}>
        Recent events: {recent.length ? recent.map((e) => `${e[0].toFixed(1)}s ${e[1]} by ${e[2] === 0 ? "player" : "rival"}${e[3] ? ` (${e[3]})` : ""}`).join(" · ") : "none yet"}
      </p>
    </div>
  );
}
