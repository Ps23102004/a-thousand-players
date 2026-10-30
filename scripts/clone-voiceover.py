#!/usr/bin/env python3
"""Render the narration in a cloned voice (local VoiceStudio API on :3900) and mux it onto footage/cut/rough-cut.mp4.

One paragraph per scene (footage/cut/narration2.tsv: start, end, scene, text). Each paragraph is generated once, then placed at its
scene start; a paragraph longer than its scene is sped up (at most MAX_SPEED) and the script reports anything that still overruns.

  python3 scripts/clone-voiceover.py [--out footage/cut/final-clone.mp4] [--only Home,Terminal] [--no-mux]

Needs the VoiceStudio API running (cd ~/Developer/VoiceStudio && bun run dev:api) with the OmniVoice model installed, and a reference
voice in footage/cut/vo/ref.wav + ref.txt (3 to 10 s of the speaker, exact transcript). Only use a voice you are allowed to clone.
"""
import argparse, json, os, re, subprocess, sys, urllib.request, uuid

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
VIDEO = os.path.join(ROOT, "footage/cut/rough-cut.mp4")
TSV = os.path.join(ROOT, "footage/cut/narration2.tsv")
REF = os.path.join(ROOT, "footage/cut/vo/ref.wav")
REFTXT = os.path.join(ROOT, "footage/cut/vo/ref.txt")
OUTDIR = os.path.join(ROOT, "footage/cut/vo")
API = "http://localhost:3900"
MAX_SPEED = 1.12


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def duration(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).stdout.strip())


def multipart(fields, files):
    b = uuid.uuid4().hex
    body = b""
    for k, v in fields.items():
        body += f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    for k, (name, data, ctype) in files.items():
        body += f'--{b}\r\nContent-Disposition: form-data; name="{k}"; filename="{name}"\r\nContent-Type: {ctype}\r\n\r\n'.encode() + data + b"\r\n"
    body += f"--{b}--\r\n".encode()
    return body, f"multipart/form-data; boundary={b}"


PRONOUNCE = [(r"\bNano\b", "Nay-no"), (r"Super-VL", "Super V L")]
TAIL = " Thank you very much."  # sacrificial: the model mumbles the last words of a passage, so these are cut off afterwards
WMODEL = os.environ.get("WHISPER_MODEL_DIR", "/private/tmp/claude-501/p1/wmodels")


def spoken(text):
    for pat, rep in PRONOUNCE:
        text = re.sub(pat, rep, text)
    return text


def cut_tail(wav, script_text):
    """Cut the sacrificial tail: keep audio up to the end of the last word of the real script (word timestamps from whisper)."""
    import json, difflib, tempfile
    tmp = tempfile.mkdtemp(prefix="tail-")
    r16 = os.path.join(tmp, "a.wav")
    run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-ac", "1", "-ar", "16000", r16])
    run(["whisper", r16, "--model", "small.en", "--model_dir", WMODEL, "--language", "en", "--word_timestamps", "True",
         "--output_format", "json", "--output_dir", tmp, "--fp16", "False"])
    d = json.load(open(os.path.join(tmp, "a.json")))
    words = [(re.sub(r"[^a-z0-9%]", "", w["word"].lower()), w["end"]) for sg in d["segments"] for w in sg.get("words", [])]
    words = [w for w in words if w[0]]
    ref = re.sub(r"[^a-z0-9% ]", " ", script_text.lower().replace("2,831", "2831").replace("2,800", "2800")).split()
    sm = difflib.SequenceMatcher(None, [w[0] for w in words], ref, autojunk=False)
    last = None
    for b in sm.get_matching_blocks():
        for k in range(b.size):
            if b.b + k >= len(ref) - 2:  # one of the final 2 script words
                last = max(last or 0, words[b.a + k][1])
    return last


def generate(text, speed=1.0):
    fields = {"text": text, "language": "English", "ref_text": open(REFTXT).read().strip(), "speed": str(speed),
              "effect_preset": "raw", "num_step": "48", "guidance_scale": "2.5"}
    body, ctype = multipart(fields, {"ref_audio": ("ref.wav", open(REF, "rb").read(), "audio/wav")})
    req = urllib.request.Request(API + "/generate", data=body, headers={"Content-Type": ctype})
    with urllib.request.urlopen(req, timeout=600) as r:
        return r.read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "footage/cut/final-clone.mp4"))
    ap.add_argument("--only", default="")
    ap.add_argument("--gen-speed", type=float, default=1.0, help="speaking speed passed to the voice model for the scenes in --only")
    ap.add_argument("--no-mux", action="store_true")
    a = ap.parse_args()
    rows = [l.rstrip("\n").split("\t") for l in open(TSV, encoding="utf8") if l.strip()]
    only = set(filter(None, a.only.split(",")))
    vdur = duration(VIDEO)
    plan = []
    for i, (t0, t1, scene, text) in enumerate(rows):
        wav = os.path.join(OUTDIR, f"{scene}.wav")
        if (not only or scene in only) and (only or not os.path.exists(wav)):
            print(f"generating {scene} ({len(text.split())} words)...", flush=True)
            open(wav, "wb").write(generate(spoken(text) + TAIL, a.gen_speed if only else 1.0))
            end = cut_tail(wav, text)
            if end:
                run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-t", f"{end + 0.12:.3f}", "-c:a", "pcm_s16le", wav + ".cut.wav"])
                os.replace(wav + ".cut.wav", wav)
            else:
                print("  WARNING: could not find the end of the real text; kept the full audio")
        if not os.path.exists(wav):
            sys.exit(f"missing {wav}; run without --only first")
        trimmed = wav.replace(".wav", "-trim.wav")
        # shorten the model's sentence gaps (longer than 0.35 s) to 0.22 s so the passage flows like one breath
        run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-af", "silenceremove=stop_periods=-1:stop_duration=0.3:stop_threshold=-33dB:stop_silence=0.2", trimmed])
        wav = trimmed
        nxt = float(rows[i + 1][0]) - 0.15 if i + 1 < len(rows) else vdur - 0.2
        d = duration(wav)
        speed = min(MAX_SPEED, max(1.0, d / max(0.5, nxt - float(t0))))
        plan.append((i + 1, float(t0), wav, d, speed, scene, nxt))
    over = []
    for n, t0, wav, d, speed, scene, nxt in plan:
        end = t0 + d / speed
        flag = "  OVERRUNS" if end > nxt + 0.05 else ""
        if flag:
            over.append(scene)
        print(f"{n:2d} {scene:9s} start {t0:6.1f}s  speech {d:5.1f}s  speed {speed:.2f}x  ends {end:6.1f}s  (scene ends {nxt:5.1f}s){flag}")
    if a.no_mux:
        return
    cmd = ["ffmpeg", "-v", "error", "-y"]
    fl, lb = [], []
    for k, (n, t0, wav, d, speed, scene, nxt) in enumerate(plan):
        cmd += ["-i", wav]
        at = f"atempo={speed:.4f}," if speed > 1.001 else ""
        fl.append(f"[{k}:a]aresample=48000,{at}adelay={int(t0 * 1000)}:all=1,apad=whole_dur={vdur:.3f}[a{k}]")
        lb.append(f"[a{k}]")
    graph = ";".join(fl) + ";" + "".join(lb) + f"amix=inputs={len(plan)}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,atrim=0:{vdur:.3f}[aout]"
    cmd += ["-i", VIDEO, "-filter_complex", graph, "-map", f"{len(plan)}:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            "-t", f"{vdur:.3f}", "-movflags", "+faststart", a.out]
    r = run(cmd)
    if r.returncode:
        sys.exit("ffmpeg failed: " + r.stderr[-600:])
    print("wrote", a.out, f"{duration(a.out):.2f}s", "| overruns:", over or "none")


main()
