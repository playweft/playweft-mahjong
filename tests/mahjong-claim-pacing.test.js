import assert from "node:assert/strict";
import test from "node:test";
import { createMahjongClaimPacing } from "../src/game/rules/claim-pacing.js";

test("claim pacing starts at visible contact and keeps its sampled interval within 250–400 ms", async () => {
  for (const [random, expected] of [[0, 250], [1 / 3, 300], [1, 400]]) {
    let landed, timer, resolved = false;
    const pacing = createMahjongClaimPacing({
      random: () => random,
      afterDiscardContact(_state, callback) { landed = callback; return () => {}; },
      setTimer(callback, delay) { timer = { callback, delay }; return 1; },
      clearTimer() {},
    });
    void pacing.ready.then(() => { resolved = true; });
    await Promise.resolve();
    assert.equal(timer, undefined, "falling time is not consumed by the recognition interval");
    assert.equal(resolved, false);
    landed();
    assert.equal(timer.delay, expected);
    timer.callback();
    await pacing.ready;
    assert.equal(resolved, true);
  }
});

test("cancelling a claim wait detaches contact, clears timers and releases the waiter", async () => {
  for (const contactFirst of [false, true]) {
    let landed, detached = 0, cleared = 0;
    const pacing = createMahjongClaimPacing({
      afterDiscardContact(_state, callback) { landed = callback; return () => detached++; },
      setTimer: () => 7,
      clearTimer(timer) { assert.equal(timer, 7); cleared++; },
    });
    if (contactFirst) landed();
    pacing.cancel();
    await pacing.ready;
    assert.equal(detached, 1);
    assert.equal(cleared, contactFirst ? 1 : 0);
    landed();
    assert.equal(cleared, contactFirst ? 1 : 0);
  }
});
