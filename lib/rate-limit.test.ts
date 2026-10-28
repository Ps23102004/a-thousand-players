import { test } from "node:test";
import assert from "node:assert/strict";
import { createLimiter } from "./rate-limit";

const T0 = Date.UTC(2026, 9, 28, 12, 0, 0);
const MIN = 60_000;

test("per-IP minute window: the Nth+1 call inside 60 s is refused, with a reason naming the limit", () => {
  const check = createLimiter(3, 1000);
  for (let i = 0; i < 3; i++) assert.deepEqual(check("a", T0 + i), { ok: true });
  const r = check("a", T0 + 3);
  assert.equal(r.ok, false);
  if (!r.ok) { assert.equal(r.reason, "limit is 3 per minute"); assert.ok(Number.isInteger(r.retryAfter) && r.retryAfter >= 1 && r.retryAfter <= 60); }
});

test("the window slides: a hit exactly 60 s old no longer counts, one that is 59.999 s old still does", () => {
  const check = createLimiter(1, 1000);
  assert.equal(check("a", T0).ok, true);
  assert.equal(check("a", T0 + MIN - 1).ok, false, "59.999 s later: still blocked");
  assert.equal(check("a", T0 + MIN).ok, true, "60.000 s later: allowed again");
  assert.equal(check("a", T0 + MIN + 1).ok, false, "and that new hit counts");
});

test("retryAfter is the whole seconds until the oldest hit leaves the window", () => {
  const check = createLimiter(2, 1000);
  check("a", T0); check("a", T0 + 10_000);
  let r = check("a", T0 + 20_000);
  assert.ok(!r.ok && r.retryAfter === 40, JSON.stringify(r));
  r = check("a", T0 + 59_500);
  assert.ok(!r.ok && r.retryAfter === 1, "0.5 s left rounds up to 1");
  assert.equal(check("a", T0 + MIN).ok, true, "retrying after retryAfter works");
});

test("refused calls do not use up quota: neither the minute window nor the daily count moves", () => {
  const check = createLimiter(1, 3);
  assert.equal(check("a", T0).ok, true);
  for (let i = 1; i <= 50; i++) assert.equal(check("a", T0 + i).ok, false);
  assert.equal(check("a", T0 + MIN).ok, true, "hammering did not extend the block");
  assert.equal(check("b", T0 + MIN + 1).ok, true, "and the daily count is only 2 so far");
  assert.equal(check("c", T0 + MIN + 2).ok, false, "a, a, b used the daily cap of 3");
});

test("IPs are independent for the per-minute limit", () => {
  const check = createLimiter(1, 1000);
  assert.equal(check("1.1.1.1", T0).ok, true);
  assert.equal(check("1.1.1.1", T0 + 1).ok, false);
  assert.equal(check("2.2.2.2", T0 + 2).ok, true);
  assert.equal(check("1.1.1.1", T0 + 3).ok, false);
});

test("the daily cap is global across IPs and reports a 1 h retry", () => {
  const check = createLimiter(100, 5);
  for (let i = 0; i < 5; i++) assert.equal(check(`ip${i}`, T0 + i).ok, true);
  const r = check("brand-new-ip", T0 + 10);
  assert.deepEqual(r, { ok: false, retryAfter: 3600, reason: "daily cap of 5 requests reached" });
  assert.equal(check("ip0", T0 + 5 * MIN).ok, false, "a minute later is still the same day");
});

test("the daily cap wins over the per-minute message when both apply", () => {
  const check = createLimiter(1, 1);
  check("a", T0);
  const r = check("a", T0 + 1);
  assert.ok(!r.ok && /daily cap/.test(r.reason));
});

test("UTC midnight resets the daily count and every IP window", () => {
  const check = createLimiter(1, 2);
  const lateEvening = Date.UTC(2026, 9, 28, 23, 59, 50), justAfter = Date.UTC(2026, 9, 29, 0, 0, 5);
  assert.equal(check("a", lateEvening).ok, true);
  assert.equal(check("b", lateEvening + 1).ok, true);
  assert.equal(check("c", lateEvening + 2).ok, false, "daily cap of 2");
  assert.equal(check("a", justAfter).ok, true, "new day: counters and windows are cleared even though 'a' called 15 s ago");
  assert.equal(check("a", justAfter + 1).ok, false, "but the per-minute limit is live again immediately");
});

test("a limiter instance owns its state", () => {
  const a = createLimiter(1, 1), b = createLimiter(1, 1);
  assert.equal(a("x", T0).ok, true);
  assert.equal(a("x", T0 + 1).ok, false);
  assert.equal(b("x", T0 + 2).ok, true);
});

test("a zero daily cap refuses everything", () => {
  const check = createLimiter(5, 0);
  assert.deepEqual(check("a", T0), { ok: false, retryAfter: 3600, reason: "daily cap of 0 requests reached" });
});

test("default clock: the first real-time call is allowed", () => {
  const check = createLimiter(1, 1);
  assert.equal(check("a").ok, true);
  assert.equal(check("a").ok, false);
});

test("many distinct IPs are handled (and counted against the global cap)", () => {
  const check = createLimiter(2, 5000);
  let ok = 0;
  for (let i = 0; i < 5000; i++) if (check(`10.0.${i >> 8}.${i & 255}`, T0 + i).ok) ok++;
  assert.equal(ok, 5000);
  assert.equal(check("overflow", T0 + 6000).ok, false);
});

test("perMinute = 0 refuses, but the retryAfter it reports should be a number (BUG: NaN)", { todo: "rate-limit.ts: with perMinute 0 `hits[0]` is undefined so retryAfter is NaN (Retry-After: NaN). Not reachable with the shipped (10, 200) config." }, () => {
  const check = createLimiter(0, 10);
  const r = check("a", T0);
  assert.equal(r.ok, false);
  assert.ok(!r.ok && Number.isFinite(r.retryAfter));
});
