import assert from "node:assert/strict";
import test from "node:test";
import { createMahjongSoloClaimController } from "../src/app/solo-claim-controller.js";

const settle = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture({ decisions, deferredPlan, apply, evaluation, persist } = {}) {
  let clock = 0, timerId = 0, landed, planning = 0;
  let state = {
    players: ["human", "ai-1", "ai-2", "ai-3"],
    phase: "claiming", roundWind: 1, handNumber: 1, honba: 0, moveCount: 8,
    pendingDiscard: { playerIndex: 4, discardIndex: 2 },
    legalActions: { claims: [{ kind: "chi", option: 1 }] },
  };
  const calls = [], timers = new Map(), errors = [];
  const reviewOptions = [], savedEvaluations = [];
  let version = 8;
  const game = {
    async aiClaimDecisions() {
      planning++;
      calls.push(["think", clock]);
      return deferredPlan ? deferredPlan.promise : {
        status: "claiming", version, decisions: decisions ?? [],
        human: { distance: 1, options: [{ option: 1, priority: 2 }] },
      };
    },
    async claimResponse(action, actorId, expectedVersion, viewerId, actionOptions) {
      reviewOptions.push([actorId, actionOptions]);
      assert.equal(expectedVersion, version);
      calls.push([actorId, action, clock]);
      const skipped = apply?.(action, actorId) === "skip";
      if (!skipped) version++;
      return { result: { accepted: !skipped, skipped, version }, projection: { state, events: [] },
        careerAnalysis: !skipped && actorId === "human" ? evaluation : undefined };
    },
  };
  const controller = createMahjongSoloClaimController({
    humanId: "human", getGame: () => game, getState: () => state, isActive: () => true,
    afterDiscardContact(_state, callback) { landed = callback; return () => { landed = null; }; },
    random: () => 1 / 3,
    setTimer(callback, delay) { const id = ++timerId; timers.set(id, { callback, at: clock + delay }); return id; },
    clearTimer: (id) => timers.delete(id),
    persistAcceptedAction: async (action, actor, projection, game, evaluation) => {
      calls.push(["save", actor, action]); savedEvaluations.push(evaluation);
      await persist?.(evaluation);
    },
    refreshProjection: () => calls.push(["render", clock]),
    onError: (error) => errors.push(error),
  });
  return {
    controller, calls, errors, game, timers, reviewOptions, savedEvaluations,
    planning: () => planning,
    setState: (next) => { state = next; },
    state: () => state,
    async advance(time) {
      clock = time;
      for (const [id, timer] of timers) {
        if (timer.at <= time) { timers.delete(id); timer.callback(); }
      }
      await settle();
    },
    land() { landed(); },
  };
}
const ron = { actorId: "ai-2", priority: 4, distance: 3, action: { type: "claim", option: 1 } };

test("claim thinking starts before landing without locking the human; AI declares after landing plus its reaction interval", async () => {
  const f = fixture({ decisions: [ron] });
  f.controller.ensure();
  await settle();
  assert.equal(f.planning(), 1);
  assert.equal(f.controller.isBusy(), false);
  assert.deepEqual(f.calls, [["think", 0]]);
  await f.advance(240);
  f.land();
  f.controller.ensure();
  assert.equal(f.planning(), 1, "a re-render cannot reroll timing or recompute the same window");
  await f.advance(539);
  assert.equal(f.calls.some(([who]) => who === "ai-2"), false);
  await f.advance(540);
  assert.deepEqual(f.calls.find(([who]) => who === "ai-2"), ["ai-2", ron.action, 540]);
  assert.deepEqual(f.errors, []);
  f.controller.cancel();
});

test("manual claim review options and its pending evaluation reach persistence without delaying the response", async () => {
  const review = deferred();
  const f = fixture({ evaluation: review.promise });
  f.controller.ensure();
  await settle();
  assert.equal(await f.controller.respond({ type: "claim", option: 1 }, { evaluateCareer: true }), true);
  assert.deepEqual(f.reviewOptions, [["human", { evaluateCareer: true }]]);
  assert.deepEqual(f.savedEvaluations, [review.promise]);
  assert.equal(f.calls.some(([action]) => action === "render"), true);
  f.controller.cancel();
  review.resolve(null);
});

test("automatic passes do not request reviews and cancelled calls never persist one", async () => {
  const f = fixture();
  f.controller.ensure();
  await settle();
  await f.controller.respond({ type: "pass" }, { evaluateCareer: false });
  assert.deepEqual(f.reviewOptions, [["human", { evaluateCareer: false }]]);
  f.controller.cancel();
  const skipped = fixture({ decisions: [ron], evaluation: Promise.resolve({ eligible: true }),
    apply: (_action, actor) => actor === "human" ? "skip" : undefined });
  skipped.controller.ensure();
  const response = skipped.controller.respond({ type: "claim", option: 1 }, { evaluateCareer: true });
  await settle(); skipped.land(); await skipped.advance(300);
  await response;
  assert.deepEqual(skipped.savedEvaluations, [undefined], "only the AI's accepted ron was persisted");
  skipped.controller.cancel();
});

test("a match-ending pass displays the result before settlement waits for its review", async () => {
  const review = deferred();
  let f;
  f = fixture({ evaluation: review.promise, persist: (evaluation) => evaluation,
    apply: () => f.setState({ ...f.state(), phase: "hand_ended", matchEnded: true }) });
  f.controller.ensure();
  await settle();
  const response = f.controller.respond({ type: "pass" }, { evaluateCareer: true });
  await settle();
  assert.equal(f.calls.some(([action]) => action === "render"), true);
  review.resolve(null);
  assert.equal(await response, true);
  assert.equal(f.calls.filter(([action]) => action === "render").length, 1);
  f.controller.cancel();
});

test("an early human choice is held and higher-priority AI ron is applied first", async () => {
  const f = fixture({ decisions: [ron], apply: (_action, actor) => actor === "human" ? "skip" : undefined });
  f.controller.ensure();
  const response = f.controller.respond({ type: "claim", option: 1 });
  await settle();
  assert.equal(f.controller.isBusy(), true);
  assert.equal(f.calls.some(([who]) => who === "human"), false);
  await f.advance(240); f.land();
  await f.advance(540);
  assert.equal(await response, true, "the selected intent is superseded by the winning ron rather than rejected as an invalid action");
  const applied = f.calls.filter(([who]) => who.startsWith("ai-") || who === "human");
  assert.deepEqual(applied.map(([who]) => who), ["ai-2", "human"]);
  assert.deepEqual(f.calls.filter(([who]) => who === "save").map(([, actor]) => actor), ["ai-2"]);
  assert.equal(f.controller.isBusy(), false);
  f.controller.cancel();
});

test("a long claim calculation uses the reaction window and declares immediately when ready", async () => {
  const plan = deferred();
  const f = fixture({ deferredPlan: plan });
  f.controller.ensure();
  await settle();
  await f.advance(240); f.land();
  await f.advance(850);
  assert.equal(f.calls.length, 1);
  plan.resolve({ status: "claiming", version: 8, decisions: [ron] });
  await settle();
  assert.equal(f.calls.find(([who]) => who === "ai-2")[2], 850);
  assert.equal(f.timers.size, 0, "thinking must not be followed by another artificial reaction delay");
  f.controller.cancel();
});

test("AI passes do not delay an uncontested human response", async () => {
  const f = fixture({ decisions: [{ actorId: "ai-1", priority: 0, distance: 2, action: { type: "pass" } }] });
  f.controller.ensure();
  await settle();
  assert.equal(f.controller.isBusy(), false);
  assert.equal(await f.controller.respond({ type: "claim", option: 1 }), true);
  assert.equal(f.calls.find(([who]) => who === "human")[2], 0);
  f.controller.cancel();
});

test("cancellation drops the human intent, timer and late AI result", async () => {
  const plan = deferred();
  const f = fixture({ deferredPlan: plan });
  f.controller.ensure();
  const response = f.controller.respond({ type: "claim", option: 1 });
  await settle();
  f.land();
  f.controller.cancel();
  assert.equal(await response, false);
  assert.equal(f.timers.size, 0);
  plan.resolve({ status: "claiming", version: 8, decisions: [ron] });
  await settle();
  await f.advance(1000);
  assert.deepEqual(f.calls, [["think", 0]]);
});

test("a changed discard window cannot accept the previous window's computed response", async () => {
  const plan = deferred();
  const f = fixture({ deferredPlan: plan });
  f.controller.ensure();
  await settle();
  f.setState({ ...f.state(), phase: "playing" });
  f.controller.ensure();
  plan.resolve({ status: "claiming", version: 8, decisions: [ron] });
  await settle();
  assert.deepEqual(f.calls, [["think", 0]]);
});
