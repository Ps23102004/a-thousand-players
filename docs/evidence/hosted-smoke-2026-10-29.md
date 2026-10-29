# Hosted smoke test, 2026-10-29

URL: https://a-thousand-players.vercel.app (Vercel Hobby, deployed from the CLI). Logged-out `curl`, one call per live route, real Token Factory and Tavily keys set as Vercel environment variables. One request each; nothing was retried.

| Route | Result | Time |
|---|---|---|
| 9 pages (`/`, `/bugs`, `/games`, `/modes/exploit`, `/modes/repro`, `/modes/balance`, `/modes/advisor`, `/replay`, `/replay?key=p0537:1`) | HTTP 200 | 0.2 to 0.8 s |
| unknown page | HTTP 404 | |
| `POST /api/repro` (a bug report written fresh for this test) | 200, new oracle (knockdown + stuck) | not timed |
| `POST /api/balance` ("Nerf sweep: slower startup and less damage.") | 200, `anim.SWEEP.startup` 0.096, `anim.SWEEP.damage` 12.8 | 2.6 s |
| `POST /api/precedent` (Tavily) | 200, results returned | 3.1 s |
| `POST /api/triage {p0537, round 1}` (Ultra) | 200, verdict `not-fixed`; the child replay process ran on Vercel | 9.0 s |
| `POST /api/eyes` (3 frames cut from the recorded replay video) | 200, Super-VL answered | 2.4 s |
| `POST /api/advisor` (4 frames, round `p0537:1`) | 200, frame notes and recommendations returned | 13.0 s |

Not tested here: the browser click path, mobile layout, the rate-limit 429 (12 quick calls), and the cached fallback after a cap is hit.
