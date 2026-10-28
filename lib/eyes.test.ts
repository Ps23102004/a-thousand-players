import { test } from "node:test";
import assert from "node:assert/strict";
import { captureTimes, validateEyes } from "./eyes";

const jpeg = "/9j/" + "A".repeat(100);
test("validateEyes accepts good input and refuses bad input before any model call", () => {
  assert.deepEqual(validateEyes({ frames: [jpeg], question: " hi " }), { frames: [jpeg], question: "hi" });
  assert.ok("question" in (validateEyes({ frames: [jpeg] }) as object));
  for (const bad of [{}, { frames: [] }, { frames: [jpeg, jpeg, jpeg, jpeg] }, { frames: ["data:image/png;base64,AAAA"] }, { frames: ["AAAA"] }, { frames: [5] }, { frames: [jpeg], question: "x".repeat(301) }, { frames: ["/9j/" + "A".repeat(400000)] }]) {
    assert.ok("error" in (validateEyes(bad) as object), JSON.stringify(bad).slice(0, 40));
  }
});

test("captureTimes centers on the first bug event, else spreads evenly, always inside the round", () => {
  assert.deepEqual(captureTimes({ t: 30, ev: [[5, "hit", 0], [13.8, "airborne", 0]] }, 99), [11.3, 13.8, 15.3]);
  assert.deepEqual(captureTimes({ t: 20, ev: [[1, "oob", 0]] }, 99), [0, 1, 2.5]);
  assert.deepEqual(captureTimes({ t: 40, ev: [] }, 99), [10, 20, 30]);
  assert.deepEqual(captureTimes(undefined, 60), [15, 30, 45]);
});
