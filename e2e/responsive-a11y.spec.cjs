// Mobile/tablet layout, tap targets, keyboard focus, labels/alt text and colour contrast.
const { test, expect } = require("playwright/test");
const { shot, contrastProbe, tapProbe } = require("./helpers.cjs");

const PAGES = ["/", "/bugs", "/modes/exploit", "/modes/repro", "/modes/balance", "/replay?key=p0537%3A1"];
const slug = (u) => u.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
const SIZES = { mobile: { width: 375, height: 812 }, tablet: { width: 768, height: 1024 } };

for (const [size, viewport] of Object.entries(SIZES)) {
  test.describe(`${size} ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: size === "mobile", isMobile: size === "mobile" });
    for (const url of PAGES) {
      test(`${url} has no horizontal scroll and usable tap targets`, async ({ page }) => {
        await page.goto(url);
        await page.waitForLoadState("networkidle").catch(() => {});
        const overflow = await page.evaluate(() => {
          const vw = document.documentElement.clientWidth;
          const wide = [...document.querySelectorAll("body *")].filter((e) => {
            const r = e.getBoundingClientRect();
            return r.right > vw + 1 && !e.closest(".table-wrap, pre, .diff") && getComputedStyle(e).position !== "fixed";
          }).slice(0, 5).map((e) => `${e.tagName.toLowerCase()}.${e.className} right=${Math.round(e.getBoundingClientRect().right)}`);
          return { scrollWidth: document.documentElement.scrollWidth, vw, wide };
        });
        const small = await page.evaluate(tapProbe);
        test.info().annotations.push({ type: "overflow", description: JSON.stringify(overflow) }, { type: "small-targets", description: JSON.stringify(small) });
        await shot(page, `${size}-${slug(url)}`);
        expect(overflow.scrollWidth, `horizontal scroll: ${overflow.wide.join("; ")}`).toBeLessThanOrEqual(overflow.vw);
        expect(small.crowded, "controls under 24x24 px with no spacing").toEqual([]);
      });
    }

    test("repro form is usable", async ({ page }) => {
      await page.goto("/modes/repro");
      const box = page.getByLabel("Bug report", { exact: true });
      await (size === "mobile" ? box.tap() : box.click());
      await box.fill("He floated.");
      await expect(page.getByRole("button", { name: "Find it in the crowd" })).toBeEnabled();
      const b = await page.getByRole("button", { name: "Use an example" }).boundingBox();
      expect(b.x + b.width).toBeLessThanOrEqual(viewport.width);
      expect((await box.boundingBox()).width).toBeGreaterThan(viewport.width * 0.6);
    });
  });
}

test.describe("keyboard", () => {
  test("skip link is first and moves focus to main", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const first = page.locator(":focus");
    await expect(first).toHaveText("Skip to content");
    await expect(first).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });

  test("tab order reaches the repro form controls with visible focus", async ({ page }) => {
    await page.goto("/modes/repro");
    await page.getByLabel("Bug report", { exact: true }).fill("x");
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    const order = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      const f = await page.evaluate(() => {
        const e = document.activeElement, s = getComputedStyle(e);
        return { tag: e.tagName.toLowerCase(), text: (e.textContent || e.id || "").trim().slice(0, 30), visible: (e.matches(":focus-visible") && s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== "none" || s.borderColor === "rgb(140, 207, 31)" };
      });
      order.push(f);
      if (f.text === "Use an example") break;
    }
    test.info().annotations.push({ type: "tab-order", description: JSON.stringify(order) });
    expect(order.some((o) => o.tag === "textarea"), "textarea reached").toBe(true);
    expect(order.map((o) => o.text)).toEqual(expect.arrayContaining(["Find it in the crowd", "Use an example"]));
    expect(order.filter((o) => !o.visible), "focused elements without a visible indicator").toEqual([]);
    await page.screenshot({ path: `${__dirname}/screenshots/keyboard-focus-repro.png` });
  });

  test("tab order on replay reaches copy link, details, iframe and Eyes form", async ({ page }) => {
    await page.goto("/replay?key=p0537%3A1");
    const seen = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      seen.push(await page.evaluate(() => { const e = document.activeElement; return `${e.tagName.toLowerCase()}:${(e.textContent || e.id || e.title || "").trim().slice(0, 24)}`; }));
    }
    test.info().annotations.push({ type: "replay-tab", description: JSON.stringify(seen) });
    const joined = seen.join("|");
    for (const want of ["button:Copy replay link", "summary:Raw token", "iframe:", "textarea:", "button:Look at 3 frames"]) expect(joined).toContain(want);
  });
});

test.describe("accessibility pass", () => {
  for (const url of PAGES) {
    test(`${url}: landmarks, labels, alt text, headings`, async ({ page }) => {
      await page.goto(url);
      const r = await page.evaluate(() => {
        const unlabeled = [...document.querySelectorAll("input:not([type=hidden]), textarea, select")].filter((e) => !(e.labels?.length || e.getAttribute("aria-label") || e.getAttribute("aria-labelledby"))).map((e) => e.outerHTML.slice(0, 80));
        const noAlt = [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).map((i) => i.src.slice(0, 80));
        const unnamedButtons = [...document.querySelectorAll("button, a[href]")].filter((b) => !(b.textContent.trim() || b.getAttribute("aria-label") || b.title)).map((b) => b.outerHTML.slice(0, 80));
        const iframes = [...document.querySelectorAll("iframe")].filter((f) => !f.title).length;
        const h1 = document.querySelectorAll("h1").length;
        const levels = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => +h.tagName[1]);
        const skips = levels.filter((l, i) => i && l > levels[i - 1] + 1).length;
        const ids = [...document.querySelectorAll("[id]")].map((e) => e.id); const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
        return { lang: document.documentElement.lang, title: document.title, main: !!document.querySelector("main"), h1, skips, unlabeled, noAlt, unnamedButtons, iframes, dupIds };
      });
      test.info().annotations.push({ type: "a11y", description: JSON.stringify(r) });
      expect(r.lang).toBe("en");
      expect(r.title).toMatch(/A Thousand Players/);
      expect(r.main).toBe(true);
      expect(r.h1).toBe(1);
      expect(r.skips, "heading level skips").toBe(0);
      expect(r.unlabeled).toEqual([]);
      expect(r.noAlt).toEqual([]);
      expect(r.unnamedButtons).toEqual([]);
      expect(r.iframes).toBe(0);
      expect(r.dupIds).toEqual([]);
    });

    test(`${url}: text contrast meets WCAG AA`, async ({ page }) => {
      await page.goto(url);
      await page.waitForLoadState("networkidle").catch(() => {});
      const { checked, fails } = await page.evaluate(contrastProbe);
      test.info().annotations.push({ type: "contrast", description: JSON.stringify({ checked, fails: fails.slice(0, 15) }) });
      expect(checked).toBeGreaterThan(5);
      expect(fails).toEqual([]);
    });
  }
});
