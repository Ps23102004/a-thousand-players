#!/usr/bin/env python3
"""Build the video around the speaker's REAL recording: cut the take by scene, shorten pauses, speed it up a little, then retime each
video scene to its speech (instead of forcing the voice into the picture). Needs the whisper word-timestamp JSON of the take.

  python3 scripts/natural-voiceover.py footage/cut/takes/take1.m4a footage/cut/takes/take1.json [--out footage/cut/final-natural.mp4]
         [--speed 1.1] [--proof-seconds 6] [--report]

Inputs: footage/cut/narration.tsv (the script the take follows: start, end, scene, text), footage/cut/rough-cut-noproof.mp4 (silent cut
built with PROOF=0) and footage/cut/proof-segs/07b*.mp4 (the proof slides, shown silently as a short scene after Exploit).
"""
import argparse, difflib, json, os, re, subprocess, sys, tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CUT = os.path.join(ROOT, "footage/cut")
TSV = os.path.join(CUT, "narration.tsv")
VIDEO = os.path.join(CUT, "rough-cut-noproof.mp4")
PROOF = sorted(os.path.join(CUT, "proof-segs", f) for f in os.listdir(os.path.join(CUT, "proof-segs"))) if os.path.isdir(os.path.join(CUT, "proof-segs")) else []
PAD_IN, PAD_OUT = 0.12, 0.18
MAX_VIDEO_SLOW, MAX_VIDEO_FAST = 1.6, 0.7


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def duration(p):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).stdout.strip())


def scenes_from_tsv():
    rows = [l.rstrip("\n").split("\t") for l in open(TSV, encoding="utf8") if l.strip()]
    sc = []
    for i, r in enumerate(rows):
        if sc and sc[-1]["name"] == r[2]:
            sc[-1]["last"] = i
        else:
            sc.append({"name": r[2], "first": i, "last": i, "t0": float(r[0])})
    return rows, sc


def line_times(asr, rows):
    W = []
    for sg in json.load(open(asr))["segments"]:
        for w in sg.get("words", []):
            t = re.sub(r"[^a-z0-9%]", "", w["word"].lower())
            if t:
                W.append((t, w["start"], w["end"]))
    global WORDS
    WORDS = W
    sw, own = [], []
    for i, r in enumerate(rows):
        for t in re.sub(r"[^a-z0-9% ]", " ", r[3].lower().replace("2,831", "2831").replace("2,800", "2800")).split():
            sw.append(t); own.append(i)
    sm = difflib.SequenceMatcher(None, [w[0] for w in W], sw, autojunk=False)
    st, en = {}, {}
    for b in sm.get_matching_blocks():
        for k in range(b.size):
            li = own[b.b + k]
            st[li] = min(st.get(li, 1e9), W[b.a + k][1]); en[li] = max(en.get(li, 0), W[b.a + k][2])
    missing = [i + 1 for i in range(len(rows)) if i not in st]
    if missing:
        sys.exit(f"script lines not found in the take: {missing}")
    return st, en


WORDS = []
GAP_CUT, GAP_KEEP = 0.30, 0.10


def keep_ranges(words, a0, a1):
    """Audio ranges to keep: everything from a0 to a1 except the middle of any pause longer than GAP_CUT (GAP_KEEP stays on each side)."""
    ws = [w for w in words if w[1] >= a0 - 0.05 and w[2] <= a1 + 0.05]
    if not ws:
        return [(a0, a1)]
    ranges, start = [], a0
    for prev, nxt in zip(ws, ws[1:]):
        if nxt[1] - prev[2] > GAP_CUT:
            ranges.append((start, prev[2] + GAP_KEEP))
            start = nxt[1] - GAP_KEEP
    ranges.append((start, a1))
    return [(x, y) for x, y in ranges if y - x > 0.05]


def build(a, speed, rows, sc, st, en, tmp):
    vdur = duration(VIDEO)
    bounds = [0.0] + [s["t0"] for s in sc[1:]] + [vdur]
    plan = []
    for n, s in enumerate(sc):
        a0 = max(0.0, st[s["first"]] - PAD_IN)
        a1 = en[s["last"]] + PAD_OUT
        if s["last"] + 1 < len(rows):
            a1 = min(a1, st[s["last"] + 1] - 0.02)
        clip = os.path.join(tmp, f"a{n}.wav")
        keep = keep_ranges(WORDS, a0, a1)
        parts = "".join(f"[0:a]atrim={x:.3f}:{y:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.012,afade=t=out:st={max(0.0, y - x - 0.012):.3f}:d=0.012[p{k}];" for k, (x, y) in enumerate(keep))
        graph = parts + "".join(f"[p{k}]" for k in range(len(keep))) + f"concat=n={len(keep)}:v=0:a=1,atempo={speed:.3f}[o]"
        r = run(["ffmpeg", "-v", "error", "-y", "-i", a.audio, "-filter_complex", graph, "-map", "[o]", "-ac", "1", "-ar", "48000", clip])
        if r.returncode:
            sys.exit(r.stderr[-400:])
        d = duration(clip)
        T = d + 0.30
        S = bounds[n + 1] - bounds[n]
        f = max(MAX_VIDEO_FAST, min(MAX_VIDEO_SLOW, T / S))
        plan.append({"name": s["name"], "b0": bounds[n], "S": S, "clip": clip, "d": d, "T": T, "f": f})
    proof_total = a.proof_seconds
    total = sum(p["T"] for p in plan) + proof_total
    return plan, total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio"); ap.add_argument("asr")
    ap.add_argument("--out", default=os.path.join(CUT, "final-natural.mp4"))
    ap.add_argument("--speed", type=float, default=0.0, help="speech speed-up; 0 = the smallest of 1.0..1.25 that fits under 178 s")
    ap.add_argument("--proof-seconds", type=float, default=6.0)
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args()
    rows, sc = scenes_from_tsv()
    st, en = line_times(a.asr, rows)
    tmp = tempfile.mkdtemp(prefix="natural-")
    speeds = [a.speed] if a.speed else [1.0, 1.05, 1.1, 1.15, 1.2, 1.25]
    for sp in speeds:
        plan, total = build(a, sp, rows, sc, st, en, tmp)
        print(f"speed {sp:.2f}x -> total {total:.1f} s")
        if total <= 178.0:
            break
    else:
        print("WARNING: still over 178 s at the fastest speed")
    for p in plan:
        print(f"{p['name']:9s} speech {p['d']:5.1f}s  scene was {p['S']:5.1f}s  video x{p['f']:.2f}  -> {p['T']:5.1f}s")
    if a.report:
        return
    vparts, t = [], 0.0
    for n, p in enumerate(plan):
        vf = os.path.join(tmp, f"v{n}.mp4")
        extra = max(0.0, p["T"] - p["S"] * p["f"])   # freeze the last frame if even the slowest allowed stretch is too short
        flt = f"setpts={p['f']:.4f}*PTS,fps=30" + (f",tpad=stop_mode=clone:stop_duration={extra:.3f}" if extra > 0.02 else "") + ",format=yuv420p"
        r = run(["ffmpeg", "-v", "error", "-y", "-ss", f"{p['b0']:.3f}", "-t", f"{p['S']:.3f}", "-i", VIDEO, "-vf", flt, "-t", f"{p['T']:.3f}",
                 "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", vf])
        if r.returncode:
            sys.exit(r.stderr[-400:])
        vparts.append((vf, t, p)); t += p["T"]
        if p["name"] == "Exploit" and PROOF and a.proof_seconds > 0:
            pv = os.path.join(tmp, "proof.mp4")
            each = a.proof_seconds / len(PROOF)
            lst = os.path.join(tmp, "proof.txt")
            segs = []
            for k, f in enumerate(PROOF):
                o = os.path.join(tmp, f"pr{k}.mp4")
                run(["ffmpeg", "-v", "error", "-y", "-i", f, "-t", f"{each:.3f}", "-vf", "fps=30,format=yuv420p", "-an", "-c:v", "libx264", "-crf", "18", o])
                segs.append(o)
            open(lst, "w").write("".join(f"file '{x}'\n" for x in segs))
            run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", pv])
            vparts.append((pv, t, None)); t += a.proof_seconds
    lst = os.path.join(tmp, "v.txt")
    open(lst, "w").write("".join(f"file '{v}'\n" for v, _, _ in vparts))
    silent = os.path.join(tmp, "silent.mp4")
    r = run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", silent])
    if r.returncode:
        sys.exit(r.stderr[-400:])
    vd = duration(silent)
    cmd = ["ffmpeg", "-v", "error", "-y"]
    fl, lb, k = [], [], 0
    for v, t0, p in vparts:
        if p is None:
            continue
        cmd += ["-i", p["clip"]]
        fl.append(f"[{k}:a]adelay={int((t0 + 0.15) * 1000)}:all=1,apad=whole_dur={vd:.3f}[a{k}]"); lb.append(f"[a{k}]"); k += 1
    graph = ";".join(fl) + ";" + "".join(lb) + f"amix=inputs={k}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,atrim=0:{vd:.3f}[aout]"
    cmd += ["-i", silent, "-filter_complex", graph, "-map", f"{k}:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", a.out]
    r = run(cmd)
    if r.returncode:
        sys.exit("ffmpeg failed: " + r.stderr[-500:])
    print("wrote", a.out, f"{duration(a.out):.2f}s")
    json.dump([{"scene": p["name"], "start": round(t0, 2), "speech": round(p["d"], 2)} for _, t0, p in vparts if p], open(os.path.join(CUT, "natural-timeline.json"), "w"), indent=1)


main()
