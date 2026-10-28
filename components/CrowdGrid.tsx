"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Tile } from "@/lib/web-types";

const SPEED = 2;          // playback speed: rounds are long, the grid should feel busy
const HOLD = 1.2;         // seconds (wall clock) to hold the final frame
const COLORS = { persona: "#8ccf1f", rival: "#c9cec6", floor: "#2c2f32", bg: "#0c0d0e", hit: "#ff7a66", text: "#a2a79f" };

type Pose = "down" | "attack" | "hurt" | "block" | "move";
const poseOf = (name = ""): Pose =>
  /down|knock|ko/i.test(name) ? "down" : /attack|active|startup|strike|punch|kick/i.test(name) ? "attack"
    : /hit|stun|hurt/i.test(name) ? "hurt" : /block|guard|parry/i.test(name) ? "block" : "move";

export default function CrowdGrid({ tiles, states, halfWidth, mobileCount }: { tiles: Tile[]; states: string[]; halfWidth: number; mobileCount: number }) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layout = useRef({ cols: 8, tw: 0, th: 0, count: tiles.length });
  const hoverRef = useRef(-1);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(false);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!, wrap = wrapRef.current!;
    const ctx = canvas.getContext("2d")!;
    const poses = states.map(poseOf);
    const offsets = tiles.map((_, i) => ((i * 7919) % 97) / 97);
    let raf = 0;
    const start = performance.now();

    const resize = () => {
      const w = wrap.clientWidth;
      const cols = w >= 900 ? 8 : w >= 560 ? 6 : 4;
      const count = cols >= 8 ? tiles.length : Math.min(tiles.length, mobileCount);
      const tw = w / cols, th = tw * 0.72;
      const rows = Math.ceil(count / cols);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(th * rows * dpr);
      canvas.style.height = `${th * rows}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout.current = { cols, tw, th, count };
    };

    const drawTile = (tile: Tile, i: number, now: number) => {
      const { cols, tw, th } = layout.current;
      const ox = (i % cols) * tw, oy = Math.floor(i / cols) * th;
      const dur = (tile.f.length - 1) * tile.dt;
      const cycle = dur / SPEED + HOLD;
      // rAF timestamps can be slightly earlier than `start`, so keep the phase non-negative
      const phase = ((now / 1000 + offsets[i] * cycle) % cycle + cycle) % cycle;
      const t = playing ? Math.min(dur, phase * SPEED) : dur * 0.6;
      const k = t / tile.dt, a = Math.min(Math.floor(k), tile.f.length - 1), b = Math.min(tile.f.length - 1, a + 1), u = k - a;
      const fa = tile.f[a], fb = tile.f[b];
      const lerp = (j: number) => (fa[j] + (fb[j] - fa[j]) * u);

      ctx.save();
      ctx.translate(ox, oy);
      ctx.beginPath();
      ctx.rect(1, 1, tw - 2, th - 2);
      ctx.clip();
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, tw, th);

      const pad = tw * 0.06, floorY = th * 0.78;
      const toX = (x10: number) => pad + ((x10 / 10 + halfWidth) / (2 * halfWidth)) * (tw - 2 * pad);
      ctx.fillStyle = COLORS.floor;
      ctx.fillRect(pad, floorY, tw - 2 * pad, 1);

      // hp bars
      const barW = (tw - 3 * pad) / 2, barY = th * 0.08, barH = Math.max(3, th * 0.05);
      ctx.fillStyle = "#1f2123";
      ctx.fillRect(pad, barY, barW, barH);
      ctx.fillRect(tw - pad - barW, barY, barW, barH);
      ctx.fillStyle = COLORS.persona;
      ctx.fillRect(pad, barY, (barW * Math.max(0, lerp(2))) / 100, barH);
      ctx.fillStyle = COLORS.rival;
      const w1 = (barW * Math.max(0, lerp(3))) / 100;
      ctx.fillRect(tw - pad - w1, barY, w1, barH);

      const fh = th * 0.38, fw = Math.max(4, tw * 0.045);
      const drawFighter = (x10: number, pose: Pose, color: string, facing: 1 | -1) => {
        const cx = toX(x10);
        ctx.fillStyle = pose === "hurt" ? COLORS.hit : color;
        ctx.beginPath();
        if (pose === "down") ctx.roundRect(cx - fh / 2, floorY - fw, fh, fw, fw / 2);
        else ctx.roundRect(cx - fw / 2, floorY - fh, fw, fh, fw / 2);
        ctx.fill();
        if (pose === "attack") ctx.fillRect(facing > 0 ? cx + fw / 2 : cx - fw / 2 - fw * 1.1, floorY - fh * 0.72, fw * 1.1, Math.max(2, fw * 0.3));
        if (pose === "block") ctx.fillRect(facing > 0 ? cx + fw / 2 + 1 : cx - fw / 2 - 3, floorY - fh * 0.85, 2, fh * 0.5);
      };
      const x0 = lerp(0), x1 = lerp(1);
      const facing0: 1 | -1 = x1 >= x0 ? 1 : -1;
      drawFighter(x0, poses[fa[4]] ?? "move", COLORS.persona, facing0);
      drawFighter(x1, poses[fa[5]] ?? "move", COLORS.rival, facing0 === 1 ? -1 : 1);

      for (const [ht, who] of tile.hits) {
        const age = t - ht;
        if (age < 0 || age > 0.25) continue;
        const cx = toX(who === 0 ? x1 : x0);
        ctx.strokeStyle = COLORS.hit;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 1 - age / 0.25;
        ctx.beginPath();
        ctx.arc(cx, floorY - fh * 0.7, 3 + age * 40, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      const font = Math.max(8, Math.min(11, tw * 0.075));
      ctx.font = `600 ${font}px ui-monospace, Menlo, monospace`;
      if (tile.live) {
        const label = "NANO LIVE";
        const lw = ctx.measureText(label).width + 8;
        ctx.fillStyle = COLORS.persona;
        ctx.fillRect(pad, th - font - 6, lw, font + 4);
        ctx.fillStyle = "#0d1400";
        ctx.fillText(label, pad + 4, th - 5);
      }
      if (t >= dur) {
        ctx.fillStyle = tile.outcome === "win" ? COLORS.persona : tile.outcome === "loss" ? COLORS.hit : COLORS.text;
        ctx.textAlign = "right";
        ctx.fillText(tile.outcome.toUpperCase(), tw - pad, th - 5);
        ctx.textAlign = "left";
      }
      if (hoverRef.current === i) {
        ctx.strokeStyle = COLORS.persona;
        ctx.lineWidth = 2;
        ctx.strokeRect(2, 2, tw - 4, th - 4);
      }
      ctx.restore();
      ctx.strokeStyle = "#1c1e20";
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + 0.5, oy + 0.5, tw - 1, th - 1);
    };

    const frame = (now: number) => {
      const { count } = layout.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < count; i++) drawTile(tiles[i], i, now - start);
      if (playing) raf = requestAnimationFrame(frame);
    };

    const ro = new ResizeObserver(() => { resize(); if (!playing) frame(performance.now()); });
    ro.observe(wrap);
    resize();
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [tiles, states, halfWidth, mobileCount, playing]);

  const indexAt = (e: React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const { cols, tw, th, count } = layout.current;
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const i = Math.floor(y / th) * cols + Math.floor(x / tw);
    return { i: i >= 0 && i < count ? i : -1, x, y };
  };

  const shown = hover && hover.i >= 0 ? tiles[hover.i] : null;
  const live = tiles.filter((t) => t.live).length;
  return (
    <div className="crowd" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Grid of ${tiles.length} recorded rounds replaying at ${SPEED}x speed. Green capsule is the synthetic player, grey is the CPU rival. ${live} tiles are Nano-driven live players. A list of every round with replay links follows the grid.`}
        onMouseMove={(e) => { const h = indexAt(e); hoverRef.current = h.i; setHover(h); }}
        onMouseLeave={() => { hoverRef.current = -1; setHover(null); }}
        onClick={(e) => { const { i } = indexAt(e); if (i >= 0) router.push(tiles[i].href); }}
      />
      {shown && hover && (
        <div className="tip" style={{ left: Math.min(hover.x + 14, (wrapRef.current?.clientWidth ?? 300) - 200), top: hover.y + 14 }}>
          <div style={{ color: "var(--text)" }}>{shown.name} · {shown.archetype}</div>
          <div>round {shown.round} · {shown.outcome}{shown.live ? " · Nano live" : ""}</div>
          <div style={{ color: "var(--accent)" }}>click to replay</div>
        </div>
      )}
      <div className="crowd-bar">
        <div className="legend">
          <span><i className="swatch" style={{ background: COLORS.persona }} />synthetic player</span>
          <span><i className="swatch" style={{ background: COLORS.rival }} />CPU rival</span>
          <span><i className="swatch" style={{ background: COLORS.hit }} />hit</span>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => setPlaying((p) => !p)} aria-pressed={!playing}>
          {playing ? "Pause" : "Play"}
        </button>
      </div>
      <details>
        <summary>List of all {tiles.length} rounds (text version)</summary>
        <ol className="tile-list">
          {tiles.map((t) => (
            <li key={t.key}><a href={t.href}>{t.name}</a> {t.archetype}, r{t.round}, {t.outcome}{t.live ? ", Nano live" : ""}</li>
          ))}
        </ol>
      </details>
    </div>
  );
}
