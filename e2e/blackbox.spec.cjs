const { test, expect } = require('playwright/test');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { resolve, join } = require('node:path');
const { pathToFileURL } = require('node:url');

// Self-contained local fixture server. No dependency on Next, baseURL, or external sites.
test.describe('black-box planted bugs', () => {
  test.describe.configure({ mode: 'serial' });
  let server;
  test.beforeAll(async () => {
    const html = await readFile(resolve(__dirname, '../blackbox/fixtures/bugged-game.html'));
    const turns = await readFile(resolve(__dirname, '../blackbox/fixtures/turn-based-game.html'));
    const menus = await readFile(resolve(__dirname, '../blackbox/fixtures/multi-menu-game.html'));
    const levels = await readFile(resolve(__dirname, '../blackbox/fixtures/level-list-game.html'));
    server = createServer((req, res) => {
      if (!req.url.startsWith('/game')) { res.writeHead(404); res.end(); return; }
      const body = req.url.startsWith('/game-turns') ? turns : req.url.startsWith('/game-menus') ? menus
        : req.url.startsWith('/game-levels') ? levels : html;
      res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(body);
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3193, '127.0.0.1', resolve); });
  });

  for (const [fixture, path, animated] of [
    ['menus', ['Play', 'Endless', 'Easy'], true], ['levels', ['Loopy'], false],
  ]) {
    test(`menu progression reaches the ${fixture} game and captures its controls`, async ({ browser }, testInfo) => {
      const { explore } = await import(pathToFileURL(resolve(__dirname, '../blackbox/explorer.mjs')).href);
      const context = await browser.newContext({ viewport: { width: 960, height: 640 } });
      try {
        const page = await context.newPage(), out = testInfo.outputPath(fixture);
        const report = await explore({ page, url: `http://127.0.0.1:3193/game-${fixture}`, seconds: 23, seed: 1, out });
        expect(report.status).toBe('completed');
        expect(report.startupClicks.map(c => [c.text, c.status])).toEqual(path.map(text => [text, 'sent']));
        expect(report.environment.some(e => e.kind === 'not-started')).toBe(false);
        expect(report.findings).toEqual([]);
        expect(report.animationEvidence).toBe(animated);
        expect(report.controls).toBe(animated ? 'inconclusive' : 'responsive');
        await expect(page.locator('canvas')).toBeVisible();
        await expect(page.locator('#menu')).toHaveCount(0);
        expect(report.frames.some(f => f.label.startsWith('startup:'))).toBe(true);
        const gameFrames = report.frames.filter(f => ['initial', 'idle-probe', 'periodic'].includes(f.label) || f.label.startsWith('control-probe:'));
        expect(gameFrames.length).toBeGreaterThan(3);
        expect(gameFrames.every(f => f.region === 'largest-visible-canvas')).toBe(true);
        expect(report.frames.some(f => f.label === 'control-probe:ArrowUp')).toBe(true);
        const trace = JSON.parse(await readFile(join(out, 'inputs.json'), 'utf8'));
        expect(trace.filter(i => i.type === 'startup-click').map(i => i.text)).toEqual(path);
        expect(trace.some(i => i.type === 'canvas-click' && i.status === 'sent' && i.t >= report.startupClicks.at(-1).t)).toBe(true);
        for (const frame of gameFrames) expect((await readFile(join(out, frame.file))).length).toBeGreaterThan(100);
        await testInfo.attach('blackbox-report', { path: join(out, 'report.json'), contentType: 'application/json' });
      } finally { await context.close(); }
    });
  }
  test.afterAll(async () => { if (server?.listening) await new Promise(resolve => server.close(resolve)); });
  for (const [bug, expected] of Object.entries({ none: [], 'animated-deadkeys': [], 'delayed-animated-deadkeys': [], 'single-request': ['failed-request'], 'single-console': ['console-error'], freeze: ['freeze'], blank: ['blank'], error: ['page-error'], deadkeys: ['deadkeys'], crash: ['crash'] })) {
    test(`reports exactly ${bug}`, async ({ browser }, testInfo) => {
      const { explore } = await import(pathToFileURL(resolve(__dirname, '../blackbox/explorer.mjs')).href);
      const context = await browser.newContext({ viewport: { width: 960, height: 640 } });
      try {
        const page = await context.newPage();
        const out = testInfo.outputPath(`blackbox-${bug}`);
        const report = await explore({ page, url: `http://127.0.0.1:3193/game?bug=${bug}`, seconds: 23, seed: 1, out });
        expect(report.status).toBe(bug === 'crash' ? 'crashed' : 'completed');
        expect([...new Set(report.findings.map(f => f.kind))].sort()).toEqual(expected);
        if (bug.includes('animated-deadkeys')) {
          expect(report.animationEvidence).toBe(true);
          expect(report.controls).toBe('inconclusive');
        }
        if (bug.startsWith('single-')) expect(report.findings[0].confidence).toBe('low');
        expect(report.startupClicks.some(c => /start/i.test(c.text) && c.status === 'sent')).toBe(true);
        expect(report.frames.length).toBeGreaterThanOrEqual(2);
        const trace = JSON.parse(await readFile(join(out, 'inputs.json'), 'utf8'));
        expect(trace.some(i => i.type === 'keydown' && i.status === 'sent')).toBe(true);
        expect(trace.some(i => i.type === 'canvas-click' && i.status === 'sent')).toBe(true);
        for (const frame of report.frames) expect((await readFile(join(out, frame.file))).length).toBeGreaterThan(100);
        await testInfo.attach('blackbox-report', { path: join(out, 'report.json'), contentType: 'application/json' });
      } finally { await context.close(); }
    });
  }

  test('arrow-only turn-based fixture has no deadkeys or freeze finding', async ({ browser }, testInfo) => {
    const { explore } = await import(pathToFileURL(resolve(__dirname, '../blackbox/explorer.mjs')).href);
    const context = await browser.newContext({ viewport: { width: 960, height: 640 } });
    try {
      const report = await explore({ page: await context.newPage(), url: 'http://127.0.0.1:3193/game-turns',
        seconds: 23, seed: 1, out: testInfo.outputPath('turns') });
      expect(report.status).toBe('completed');
      expect(report.controls).toBe('responsive');
      expect(report.findings).toEqual([]);
      expect(report.frames.some(f => f.label === 'control-probe:ArrowUp')).toBe(true);
    } finally { await context.close(); }
  });
});
