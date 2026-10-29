#!/usr/bin/env python3
"""Place a recorded voice-over on the silent cut, line by line.

Read docs/VOICEOVER-READ-THIS.md line by line with a pause of about one second between lines. This script finds each spoken line
(silence detection), checks that the count matches footage/cut/narration.tsv, speeds a line up slightly if it would overrun its
window (never more than 1.15x), delays it to its scene time, mixes, normalises loudness and muxes onto footage/cut/rough-cut.mp4.

  python3 scripts/align-voiceover.py ~/Desktop/voiceover.m4a [--out footage/cut/final.mp4] [--report]

Needs ffmpeg and ffprobe. Falls back with a clear message (and writes nothing) when the line count does not match.
"""
import argparse, os, re, subprocess, sys, tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
VIDEO = os.path.join(ROOT, "footage/cut/rough-cut.mp4")
TSV = os.path.join(ROOT, "footage/cut/narration.tsv")
MAX_SPEEDUP = 1.15


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def duration(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).stdout.strip())


def lines():
    out = []
    for l in open(TSV, encoding="utf8"):
        p = l.rstrip("\n").split("\t")
        if len(p) >= 4 and p[0].replace(".", "").isdigit():
            out.append((float(p[0]), float(p[1]), p[2], p[3]))
    return out


def speech_segments(wav, noise_db, min_sil):
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", wav, "-af", f"silencedetect=noise={noise_db}dB:d={min_sil}", "-f", "null", "-"])
    total = duration(wav)
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    segs, cur = [], 0.0
    for s, e in zip(starts, ends):
        if s - cur > 0.15:
            segs.append((cur, s))
        cur = e
    if total - cur > 0.15 and (not starts or len(ends) >= len(starts)):
        segs.append((cur, total))
    return [(a, b) for a, b in segs if b - a > 0.25]


def find_segments(wav, n):
    for noise in (-35, -32, -38, -30, -42, -28, -45):
        for sil in (0.6, 0.5, 0.7, 0.45, 0.8, 0.9, 0.4, 1.0):
            segs = speech_segments(wav, noise, sil)
            if len(segs) == n:
                return segs, (noise, sil)
    return None, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--out", default=os.path.join(ROOT, "footage/cut/final.mp4"))
    ap.add_argument("--report", action="store_true", help="only print the alignment, write nothing")
    a = ap.parse_args()
    L = lines()
    tmp = tempfile.mkdtemp(prefix="align-")
    wav = os.path.join(tmp, "in.wav")
    r = run(["ffmpeg", "-v", "error", "-y", "-i", os.path.expanduser(a.audio), "-vn", "-ac", "1", "-ar", "48000", wav])
    if r.returncode:
        sys.exit("could not read audio: " + r.stderr[:300])
    segs, how = find_segments(wav, len(L))
    if not segs:
        found = len(speech_segments(wav, -35, 0.6))
        sys.exit(f"Found about {found} spoken lines, expected {len(L)}. Read line by line with a clear pause between lines, "
                 f"or send the take as is and I will cut it by hand (the whole take can also be time-stretched to fit).")
    vdur = duration(VIDEO)
    plan, warnings = [], []
    for i, ((a0, a1), (t0, t1, scene, text)) in enumerate(zip(segs, L)):
        d, win = a1 - a0, t1 - t0
        nxt = L[i + 1][0] if i + 1 < len(L) else vdur
        room = nxt - 0.1 - t0  # may run past its own window into the pause before the next line
        speed = 1.0
        if d > room:
            speed = min(MAX_SPEEDUP, d / room)
        if d / speed > room + 0.05:
            warnings.append(f"line {i + 1} ({text[:40]}...) is {d:.1f}s, room {room:.1f}s: will overlap the next line; read it shorter")
        plan.append((i + 1, t0, a0, a1, speed, d / speed, text))
    for p in plan:
        print(f"{p[0]:2d} start {p[1]:6.1f}s  take {p[2]:6.1f}-{p[3]:6.1f}  speed {p[4]:.2f}x  len {p[5]:4.1f}s  {p[6][:50]}")
    print(f"segmentation: noise {how[0]} dB, min silence {how[1]} s; video {vdur:.1f}s")
    for w in warnings:
        print("WARNING:", w)
    if a.report:
        return
    parts, filters, labels = [], [], []
    cmd = ["ffmpeg", "-v", "error", "-y"]
    for n, (i, t0, a0, a1, speed, _, _) in enumerate(plan):
        cmd += ["-ss", f"{max(0, a0 - 0.05):.3f}", "-t", f"{a1 - a0 + 0.1:.3f}", "-i", wav]
        atempo = f"atempo={speed:.4f}," if speed > 1.001 else ""
        filters.append(f"[{n}:a]{atempo}adelay={int(t0 * 1000)}:all=1,apad=whole_dur={vdur:.3f}[a{n}]")
        labels.append(f"[a{n}]")
    graph = ";".join(filters) + ";" + "".join(labels) + f"amix=inputs={len(plan)}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,atrim=0:{vdur:.3f}[aout]"
    cmd += ["-i", VIDEO, "-filter_complex", graph, "-map", f"{len(plan)}:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            "-t", f"{vdur:.3f}", "-movflags", "+faststart", a.out]
    r = run(cmd)
    if r.returncode:
        sys.exit("ffmpeg failed: " + r.stderr[-600:])
    print("wrote", a.out, f"{duration(a.out):.2f}s")


main()
