import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';

const USAGE = 'Usage: node blackbox/cli.mjs <http(s)://url> [--seconds 60] [--seed 1] [--out reports/name] [--vision]';
export function parseArgs(args) {
  if (!args[0]) throw new Error(USAGE);
  const url = new URL(args[0]);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) browser games are supported');
  const opts = { url: args[0], seconds: 60, seed: 1, out: 'reports/blackbox', vision: false };
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--vision') { opts.vision = true; continue; }
    if (!['--seconds', '--seed', '--out'].includes(arg) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(USAGE);
    const value = args[++i]; opts[arg.slice(2)] = arg === '--out' ? value : Number(value);
  }
  if (!Number.isFinite(opts.seconds) || opts.seconds < 1 || opts.seconds > 3600) throw new Error('seconds must be between 1 and 3600 (inclusive)');
  if (!Number.isSafeInteger(opts.seed) || opts.seed < 0 || opts.seed > 0xffffffff) throw new Error('seed must be an unsigned 32-bit integer');
  return opts;
}
export async function visionOpinion(images, { chat, VL }) {
  if (images.length < 3) return { status: 'insufficient-frames', secondOpinion: true };
  const chosen = [images[0], images[Math.floor((images.length - 1) / 2)], images.at(-1)];
  const answer = await chat({ model: VL, user: 'These are chronological screenshots of an unknown browser game. Describe possible visible glitches only. Distinguish normal gameplay, uncertainty, and observable artifacts. This is a second opinion, not proof of a bug.', images: chosen, maxTokens: 700, temperature: 0.2, thinking: false, retries: 0, timeoutMs: 30000 });
  return { status: 'completed', secondOpinion: true, content: answer.content };
}
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_DIR ?? join(homedir(), '.local/lib/node_modules/@playwright/cli/node_modules/playwright'));
  const { explore } = await import('./explorer.mjs');
  const browser = await chromium.launch({ headless: false, channel: 'chrome' });
  try {
    // An explicit context: the explorer opens a second page in page.context() to decode screenshots, which Playwright refuses for a browser.newPage() page.
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const report = await explore({ ...opts, page });
    if (opts.vision) {
      try {
        // tsx is already installed; register only when the opt-in vision path is used.
        const { tsImport } = await import('tsx/esm/api');
        const models = await tsImport('../ai/models.ts', import.meta.url);
        const images = await Promise.all(report.frames.filter(f => ['initial', 'periodic', 'final'].includes(f.label)).map(async f => (await readFile(join(opts.out, f.file))).toString('base64')));
        report.vision = await visionOpinion(images, models);
      } catch (error) { report.vision = { status: 'failed', secondOpinion: true, message: error.message }; }
      await writeFile(join(opts.out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    }
    console.log(`${report.status}: ${report.findings.length} finding(s); ${report.frames.length} screenshots; input trace and report: ${opts.out}`);
    if (report.status === 'incomplete' || report.vision?.status === 'failed') process.exitCode = 1;
  } finally { await browser.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
