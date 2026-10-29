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

## After the P1 deploy (same day, later)

| Route / page | Result | Time |
|---|---|---|
| `/`, `/bugs`, `/games`, `/modes/balance`, `/modes/repro`, `/replay?key=p0537:1` | HTTP 200 | 0.3 to 1.1 s |
| `/bugs` page contains the Glitch Hunter score (`8/10 (80`) and `/games` the controls block | yes | |
| `POST /api/prophet` with a tuning that is not the cached example (`anim.SWEEP.damage` 11.5, `anim.SWEEP.recovery` 0.5) | 200, `cached: false`, 200 personas per side; before 66/200 wins, after 62/200; bug rounds 1 and 1 | 36.7 s on Vercel |

The "before" value of 66 wins equals the locally measured seed-1 baseline in `docs/prophet.md`, so the baseline is reproducible across the laptop and Vercel. A single hosted run; not repeated.
