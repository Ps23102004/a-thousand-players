// Pure logic of Design Advisor mode: frame timing, request checks, the crowd evidence table, game-text extraction,
// search queries, the synthesis prompt and, most important, the validation that decides which model suggestions survive.
// Nothing here calls a model or the network, so all of it is tested with fakes (lib/advisor.test.ts).
import type { Summary } from "./types";

export const ADVISOR_FRAMES = 4;
export const ADVISOR_AREAS = ["lighting", "camera", "readability", "difficulty", "onboarding", "dialogue", "feedback"] as const;
export type Area = (typeof ADVISOR_AREAS)[number];
export const MAX_RECOMMENDATIONS = 6;
const MAX_FRAME_CHARS = 350_000;   // base64 chars per frame, same limit as Eyes mode (lib/eyes.ts)
const MAX_SUGGESTION = 600;
const MAX_HOW_TO_TEST = 400;
const MAX_NOTE = 160;

const BUG_EVENTS = new Set(["stuck", "oob", "nan", "clip", "airborne", "softlock", "crash"]);
/**
 * Four moments, early to late, across the part of the round worth reviewing: from the start to 85% of the round, but stopping
 * a second before the first engine-detected bug when there is one (after a fighter falls out of the arena the camera follows it
 * into empty space, and those frames say nothing about the design). `roundSeconds` is 10 when unknown. One decimal.
 */
export function advisorFrameTimes(roundSeconds: number, events: readonly (readonly [number, string, ...unknown[]])[] = []): number[] {
  const end = roundSeconds > 0 ? roundSeconds : 10;
  const lo = Math.min(0.1 * end, 1.5);
  let hi = 0.85 * end;
  const bug = events.find((e) => BUG_EVENTS.has(e[1]))?.[0];
  if (bug !== undefined && bug - 1 > lo + 3) hi = Math.min(hi, bug - 1);
  return [0, 1 / 3, 2 / 3, 1].map((f) => Math.round((lo + f * (hi - lo)) * 10) / 10);
}

// A clean recorded round: 28 s, a win by 10 hp, both fighters landed hits, no engine-detected bug (checked in app/api/advisor.test.ts).
export const DEFAULT_ROUND = "p0396:1";
const KEY_RE = /^[A-Za-z0-9_-]{1,24}:\d{1,3}$/;
/** What the round box holds: a bare key (p0537:1) or a pasted /replay link. A link without a key= still names its round through its t= token. */
export function parseRoundInput(input: string | undefined): { key?: string; token?: string } {
  const s = (input ?? "").trim();
  if (!s) return { key: DEFAULT_ROUND };
  if (KEY_RE.test(s)) return { key: s };
  let q: URLSearchParams;
  try { q = new URL(s, "http://x").searchParams; } catch { return {}; }
  const key = q.get("key");
  if (key && KEY_RE.test(key)) return { key };
  const token = q.get("t");
  return token ? { token } : {};
}

/** The cleaned request, or {error,status} for one that must be refused before any model or search call. */
export function validateAdvisorBody(body: unknown): { key: string; frames: string[] } | { error: string; status: number } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.key !== "string" || !KEY_RE.test(b.key)) return { error: `"key" must be a recorded round like ${DEFAULT_ROUND}.`, status: 400 };
  const frames = b.frames;
  if (!Array.isArray(frames) || frames.length !== ADVISOR_FRAMES) return { error: `"frames" must be exactly ${ADVISOR_FRAMES} images.`, status: 400 };
  for (const f of frames) {
    if (typeof f !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(f)) return { error: "Each frame must be base64 image data without a data: prefix.", status: 400 };
    if (f.length > MAX_FRAME_CHARS) return { error: "A frame is too large. Frames are limited to about 260 KB each.", status: 413 };
    if (!f.startsWith("/9j/") && !f.startsWith("iVBOR")) return { error: "Frames must be JPEG or PNG.", status: 400 };
  }
  return { key: b.key, frames: frames as string[] };
}

// ---------- crowd evidence ----------
export interface CrowdRow { id: string; label: string; value: number; display: string }
export interface CrowdInput {
  summary: Pick<Summary, "players" | "rounds" | "byArchetype" | "quitCurve">;
  /** The same crowd replayed with the sweep nerfed (data/run-main/runs-sweep-nerf.jsonl); null when that run is absent. */
  sweepNerf: Pick<Summary, "byArchetype"> | null;
  bugs: { id: string; signature: string; count: number }[];
  /** The best strategy the exploit search found (data/run-main/exploit.json), reduced to what the table needs. */
  topStrategy: { label: string; winRate: number; hits: Record<string, number> } | null;
  /** Default values of the game's rule constants (game/src/tuning.js). */
  rules: Record<string, number>;
  round: { key: string; out: string; t: number; hp: [number, number] } | null;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** The compact evidence table. Every number is computed here from the recorded crowd; the model only cites a row by id. */
export function buildCrowdTable(i: CrowdInput): CrowdRow[] {
  const rows: CrowdRow[] = [];
  const add = (id: string, label: string, value: number, display: string) => rows.push({ id, label, value, display });
  for (const [a, s] of Object.entries(i.summary.byArchetype)) {
    add(`quit.${a}`, `Quit rate, ${a} (${s.players} players)`, s.quitRate, pct(s.quitRate));
    add(`win.${a}`, `Win rate against the CPU, ${a}`, s.winRate, pct(s.winRate));
  }
  const curve = i.summary.quitCurve;
  for (const c of curve) add(`remain.r${c.round}`, `Players still playing at the start of round ${c.round}`, c.remaining, pct(c.remaining));
  let wall: { from: (typeof curve)[number]; to: (typeof curve)[number]; drop: number } | null = null;
  for (let k = 1; k < curve.length; k++) {
    const drop = curve[k - 1].remaining - curve[k].remaining;
    if (!wall || drop > wall.drop) wall = { from: curve[k - 1], to: curve[k], drop };
  }
  if (wall) {
    add("wall.biggestDrop", `Biggest one-round drop in players still playing: round ${wall.from.round} to ${wall.to.round} (${pct(wall.from.remaining)} to ${pct(wall.to.remaining)})`,
      r3(wall.drop), `${Math.round(wall.drop * 100)} points`);
  }
  if (i.sweepNerf) {
    for (const a of ["cheeser", "casual"]) {
      const before = i.summary.byArchetype[a], after = i.sweepNerf.byArchetype[a];
      if (before && after) add(`sweepNerf.${a}`, `Win rate, ${a}, before and after nerfing the sweep`, after.winRate, `${pct(before.winRate)} before, ${pct(after.winRate)} after`);
    }
  }
  if (i.topStrategy) {
    const entries = Object.entries(i.topStrategy.hits);
    const total = entries.reduce((s, [, n]) => s + n, 0);
    const top = entries.sort((a, b) => b[1] - a[1])[0];
    if (top && total > 0) {
      add("exploit.top", `Best simulated-player strategy against the CPU rival: ${i.topStrategy.label.slice(0, 60)}`, r3(top[1] / total),
        `${pct(top[1] / total)} of landed hits were ${top[0]} (win rate ${pct(i.topStrategy.winRate)})`);
    }
  }
  if (i.rules.cpuLowBlock !== undefined) add("rule.cpuLowBlock", "Rule rules.cpuLowBlock in the shipped game: chance the CPU rival crouch-blocks a low attack", i.rules.cpuLowBlock, String(i.rules.cpuLowBlock));
  if (i.bugs.length) {
    add("bugs.total", `Rounds with an engine-detected bug (${i.bugs.length} clusters)`, i.bugs.reduce((s, b) => s + b.count, 0), `${i.bugs.reduce((s, b) => s + b.count, 0)} rounds`);
    for (const b of i.bugs) add(`bug.${b.id}`, `Bug ${b.id}: ${b.signature.slice(0, 80)}`, b.count, `${b.count} rounds`);
  }
  if (i.round) add("round.result", `This round (${i.round.key})`, i.round.t, `${i.round.out} in ${i.round.t.toFixed(1)} s, hp ${i.round.hp[0]} vs ${i.round.hp[1]}`);
  return rows;
}

// ---------- the game's own words ----------
const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
const stripTags = (s: string) => s.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTITIES[e]).replace(/\s+/g, " ").trim();

/**
 * Player-facing text of the game, one string per line: every visible phrase in index.html (story, help, tips, controls) and the
 * sentence-like string literals in hud.js (end-of-match titles and summaries). Attributes, scripts and code are not read.
 */
export function extractGameText(indexHtml: string, hudJs: string): string[] {
  const html = indexHtml.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t, inner: string) => `\n${stripTags(inner)}\n`)
    .replace(/<\/?(?:p|div|header|footer|main|aside|button|span|small|strong|b|label|li|section)\b[^>]*>/gi, "\n");
  const fromHtml = html.split("\n").map(stripTags);
  const fromJs = [...hudJs.matchAll(/'([^'\n\\]{8,200})'/g)].map((m) => m[1]).filter((s) => /^[A-Z][^<>${}]*[.!?]$/.test(s));
  const seen = new Set<string>();
  return [...fromHtml, ...fromJs].filter((l) => l.length >= 8 && !seen.has(l) && seen.add(l));
}

// ---------- tuning keys ----------
/** Default values of the RULES constants in game/src/tuning.js (comments ignored). */
export function parseRuleDefaults(tuningJs: string): Record<string, number> {
  const body = /RULES\s*=\s*\{([\s\S]*?)\}\s*;/.exec(tuningJs.replace(/\/\/.*$/gm, ""))?.[1] ?? "";
  return Object.fromEntries([...body.matchAll(/\b([A-Za-z]\w*)\s*:\s*(-?\d+(?:\.\d+)?)/g)].map((m) => [m[1], Number(m[2])]));
}
/** Every key a recommendation may name in howToTest: data/baseline-tuning.json plus rules.<RULES key>. */
export function knownTuningKeys(baselineKeys: string[], rules: Record<string, number>): Set<string> {
  return new Set([...baselineKeys, ...Object.keys(rules).map((k) => `rules.${k}`)]);
}

// ---------- web search ----------
// Developer and design sources only; forums, video sites and the browser-game portals that polluted earlier searches are left out.
export const ADVISOR_DOMAINS = [
  "gamedeveloper.com", "gdcvault.com", "gamasutra.com", "game-wisdom.com", "gamedesignskills.com", "gameuidatabase.com",
  "lostgarden.com", "supercombo.gg", "dustloop.com", "critpoints.net",
];
export interface Source { title: string; url: string; snippet: string; query: string }

/**
 * The searches to run, built from the game's genre and nothing else (never from client text). A brawler or fighting game searches as
 * "fighting game"; any other genre is searched as itself. The genre phrase leads and stays short: adding it as a suffix
 * ("3D physics brawler") pulled magazine PDFs and unrelated lists in the first live run, short topic phrases found real design articles.
 */
export function advisorQueries(genre: string): string[] {
  const g = /brawler|fighting/i.test(genre) ? "fighting game" : genre;
  return [
    `${g} visual clarity: hit feedback and camera readability`,
    `${g} new player onboarding and difficulty tutorial design`,
    `${g} lighting, contrast and stage readability for character silhouettes`,
  ];
}

// ---------- synthesis prompt ----------
const WORD_LIMIT = 3500;
/** The game text exactly as the prompt shows it to the model (one line per row, cut at WORD_LIMIT characters). */
const givenGameText = (lines: string[]) => lines.join("\n").slice(0, WORD_LIMIT).split("\n");
export function synthesisPrompt(i: { frameNotes: string; crowd: CrowdRow[]; gameText: string[]; sources: Source[]; tuningKeys: string[]; frameTimes: number[] }): { system: string; user: string } {
  const system = [
    "You are a game design reviewer. You get four sources of evidence about one 3D fighting game: notes from a vision model on 4 frames, a table of measurements from a simulated crowd of players (not real people), the game's own player-facing text, and web search results.",
    `Write 4 to ${MAX_RECOMMENDATIONS} concrete recommendations that a small team could act on, spread over different areas (visuals, difficulty, onboarding, the game's text) as far as the evidence supports each one; fewer is fine only if the evidence really is thin. Every recommendation must be backed by evidence you cite from the material below, and must not claim more than the evidence shows.`,
    "Reading the crowd table: a nerf that leaves a win rate close to where it was means the nerfed move was not the main cause. Cite a crowd row only if it bears directly on the suggestion; do not add rows or frames as decoration. The exploit row is a strategy played by a simulated player against the built-in CPU rival, not a CPU behaviour. A rule row shows the current value of a game rule; a suggestion about that rule should name it in howToTest. For dialogue and onboarding, quote the line of the game's text you would change, in double quotes, copied exactly as written.",
    "Engine bugs are tracked separately: do not recommend fixing a bug unless it changes how readable the fight is. Write about design: what the player sees, is told and feels.",
    "Rules: Cite only frame numbers 1 to 4, crowd row ids from the table, and URLs exactly as they appear in the search results. Do not invent sources, numbers or tuning keys. Do not say anything is viral, trending or popular unless a search result you cite says that word. Popularity is not proof that a change works.",
    "The crowd is a set of simulated players, not people; the frames are the 3D canvas only (the health bars and other on-screen HUD are not in the frames).",
    'Output strict JSON and nothing else: {"recommendations":[{"area":"lighting|camera|readability|difficulty|onboarding|dialogue|feedback","suggestion":"one or two sentences","evidence":[{"type":"frame","index":2},{"type":"crowd","row":"quit.casual"},{"type":"web","url":"https://..."}],"howToTest":"one line","strength":"suggestion|supported by crowd data"}]}',
    'howToTest: for a gameplay or difficulty change you MUST name the exact tuning key from the list that would test it with the crowd; for a visual or text change say it needs human playtesters. strength is "supported by crowd data" only when a crowd row shows the problem the suggestion addresses; otherwise "suggestion".',
  ].join("\n");
  const cap = (s: string) => (s.length > WORD_LIMIT ? s.slice(0, WORD_LIMIT) + "..." : s);
  const user = [
    `## Frame notes (frames 1-4 at ${i.frameTimes.map((t) => `${t}s`).join(", ")} of one recorded round)`,
    cap(i.frameNotes),
    "\n## Crowd table (id | measure | value)",
    ...i.crowd.map((r) => `${r.id} | ${r.label} | ${r.display}`),
    "\n## The game's own text (story, help, tips, end screens)",
    cap(i.gameText.join("\n")),
    "\n## Web search results (title | url | excerpt)",
    ...(i.sources.length ? i.sources.map((s) => `${s.title} | ${s.url} | ${s.snippet}`) : ["(no results; do not cite any web source)"]),
    "\n## Tuning keys that exist (name one in howToTest for a gameplay change)",
    i.tuningKeys.join(", "),
  ].join("\n");
  return { system, user };
}

// ---------- validation ----------
export type Evidence =
  | { type: "frame"; index: number; note?: string }
  | { type: "crowd"; row: string; label: string; display: string }
  | { type: "web"; url: string; title: string };
export interface Recommendation { area: Area; suggestion: string; evidence: Evidence[]; howToTest: string; strength: "suggestion" | "supported by crowd data" }
export interface Dropped { recommendations: number; evidence: number; reasons: string[] }
export interface ValidationContext {
  frameCount: number; crowd: CrowdRow[]; sources: Source[]; tuningKeys: Set<string>;
  /** The game's own text lines, as given to the model; onboarding and dialogue suggestions must quote one of them. */
  gameText: string[];
}

function normUrl(u: unknown): string | null {
  if (typeof u !== "string") return null;
  try {
    const x = new URL(u.trim());
    return x.protocol === "http:" || x.protocol === "https:" ? `${x.protocol}//${x.host}${x.pathname.replace(/\/+$/, "")}${x.search}` : null;
  } catch { return null; }
}
const HYPE = /\b(?:viral\w*|trend\w*|popular\w*)\b/gi;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * Keeps only the recommendations the evidence supports. Code, not the model, decides. A whole recommendation is dropped when it
 * has no valid evidence; cites ANY web URL that was not among the fetched sources; names a tuning key that does not exist;
 * is an onboarding or dialogue suggestion that quotes no line found verbatim in the game text the model was given; or uses
 * "viral", "trending" or "popular" (any word starting that way) without that same word in the title or snippet of a web source
 * the same recommendation cites. "supported by crowd data" is kept only for a difficulty or onboarding suggestion that cites a
 * crowd row and names a real tuning key in howToTest; otherwise it becomes "suggestion". A bad frame index or crowd row id only
 * removes that one cited item. Evidence is rebuilt from the real rows and sources, so the model cannot change a number or a title.
 * Code checks that cited evidence exists, not that it is relevant.
 */
export function validateRecommendations(raw: unknown, ctx: ValidationContext): { recommendations: Recommendation[]; dropped: Dropped; proposed: number } {
  const dropped: Dropped = { recommendations: 0, evidence: 0, reasons: [] };
  const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.recommendations) ? raw.recommendations : [];
  const sourceByUrl = new Map(ctx.sources.flatMap((s) => { const n = normUrl(s.url); return n ? [[n, s] as const] : []; }));
  const rowById = new Map(ctx.crowd.map((r) => [r.id, r]));
  const shown = givenGameText(ctx.gameText).map((l) => l.replace(/\s+/g, " ").trim());
  const out: Recommendation[] = [];
  const drop = (why: string) => { dropped.recommendations++; if (!dropped.reasons.includes(why)) dropped.reasons.push(why); };

  for (const item of list) {
    if (!isObj(item)) { drop("not an object"); continue; }
    const area = ADVISOR_AREAS.find((a) => a === item.area);
    const suggestion = typeof item.suggestion === "string" ? item.suggestion.trim() : "";
    const howToTest = typeof item.howToTest === "string" ? item.howToTest.trim() : "";
    if (!area) { drop("area is not one of the seven"); continue; }
    if (!suggestion || suggestion.length > MAX_SUGGESTION) { drop("suggestion empty or too long"); continue; }
    if (!howToTest || howToTest.length > MAX_HOW_TO_TEST) { drop("howToTest empty or too long"); continue; }
    const keys = howToTest.match(/\b(?:rules|anim|rival)\.[A-Za-z0-9_.]*[A-Za-z0-9_]/g) ?? [];
    if (keys.some((k) => !ctx.tuningKeys.has(k))) { drop("howToTest names a tuning key that does not exist"); continue; }
    if (!keys.length && (area === "difficulty" || !/playtest/i.test(howToTest))) { drop(area === "difficulty" ? "a difficulty change must name the tuning key that tests it" : "howToTest names no tuning key and does not ask for human playtesters"); continue; }
    if ((area === "onboarding" || area === "dialogue") && ![...`${suggestion} ${howToTest}`.matchAll(/"([^"]{4,})"|\u201C([^\u201D]{4,})\u201D/g)].some((m) => shown.some((l) => l.includes((m[1] ?? m[2]).replace(/\s+/g, " ").trim())))) {
      drop("onboarding and dialogue suggestions must quote a line of the game text"); continue;
    }

    const evidence: Evidence[] = [];
    const seen = new Set<string>();
    const push = (key: string, e: Evidence) => { if (!seen.has(key)) { seen.add(key); evidence.push(e); } };
    let badUrl = false;
    for (const e of Array.isArray(item.evidence) ? item.evidence : []) {
      if (!isObj(e)) { dropped.evidence++; continue; }
      if (e.type === "frame" && typeof e.index === "number" && Number.isInteger(e.index) && e.index >= 1 && e.index <= ctx.frameCount) {
        const note = typeof e.note === "string" && e.note.trim() ? e.note.trim().slice(0, MAX_NOTE) : undefined;
        push(`f${e.index}`, note ? { type: "frame", index: e.index, note } : { type: "frame", index: e.index });
      } else if (e.type === "crowd" && typeof e.row === "string" && rowById.has(e.row.trim())) {
        const r = rowById.get(e.row.trim())!;
        push(`c${r.id}`, { type: "crowd", row: r.id, label: r.label, display: r.display });
      } else if (e.type === "web" && sourceByUrl.has(normUrl(e.url) ?? "")) {
        const s = sourceByUrl.get(normUrl(e.url)!)!;
        push(`w${s.url}`, { type: "web", url: s.url, title: s.title });
      } else { dropped.evidence++; if (e.type === "web") badUrl = true; }
    }
    if (badUrl) { drop("cites a web URL that was not a search result"); continue; }
    if (!evidence.length) { drop("no valid evidence"); continue; }
    // "viral", "trending", "popular": each such word must appear in the title or snippet of a web source this same recommendation cites.
    const citedText = evidence.flatMap((e) => (e.type === "web" ? [sourceByUrl.get(normUrl(e.url)!)!] : [])).map((s) => `${s.title} ${s.snippet}`).join(" ");
    const claim = [suggestion, howToTest, ...evidence.flatMap((e) => (e.type === "frame" && e.note ? [e.note] : []))].join(" ");
    const hype = [...claim.matchAll(HYPE)].map((m) => m[0].toLowerCase());
    if (hype.some((w) => !new RegExp(`\\b${w}\\b`, "i").test(citedText))) { drop('says "viral", "trending" or "popular" but no source it cites does'); continue; }
    const crowdBacked = evidence.some((e) => e.type === "crowd");
    const testable = keys.length > 0 && (area === "difficulty" || area === "onboarding");
    out.push({ area, suggestion, evidence, howToTest, strength: item.strength === "supported by crowd data" && crowdBacked && testable ? "supported by crowd data" : "suggestion" });
  }
  if (out.length > MAX_RECOMMENDATIONS) {
    dropped.recommendations += out.length - MAX_RECOMMENDATIONS;
    dropped.reasons.push(`more than ${MAX_RECOMMENDATIONS}`);
    out.length = MAX_RECOMMENDATIONS;
  }
  return { recommendations: out, dropped, proposed: list.length };
}
