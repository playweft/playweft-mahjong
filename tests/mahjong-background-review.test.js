import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createMahjongSoloSaveController } from "../src/app/solo-save-controller.js";
import { createCareerStore } from "../src/storage/career-store.js";
import { createMahjongSoloSave } from "../src/game/replay/solo-save.js";
import { createLocalLuaGame } from "../src/runtime/local-lua-game.js";
import { evaluateCareerDecision } from "../src/game/career/evaluate-decision.js";

const human = "mahjong-player";
const save = (id) => createMahjongSoloSave({ randomSeed: "0123456789abcdef0123456789abcdef", matchId: id, matchType: "hanchan", rules: {} });
const evaluation = { eligible: true, agreed: true, review: { quality: 90, major: false } };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function fixture() {
  const entries = new Map();
  const store = createCareerStore({ getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) });
  store.activate(1);
  const controller = createMahjongSoloSaveController({ initialSave: save("first"),
    writeSave: (...args) => store.persistMatch(...args), clearSave: () => store.clearMatch() });
  return { store, controller };
}

test("pending reviews do not hold the action journal and late results keep newer AI actions", async () => {
  const { store, controller } = fixture();
  const review = deferred();
  await controller.persistAcceptedAction({ type: "discard", tileId: 1 }, human,
    { state: { phase: "playing" } }, null, review.promise);
  assert.equal(store.read(1).currentMatch.actions.length, 1);
  assert.equal(store.read(1).analysis.reviewed, 0);
  await controller.persistAcceptedAction({ type: "discard", tileId: 2 }, "a", { state: { phase: "playing" } });
  review.resolve(evaluation);
  await controller.flushEvaluations();
  assert.equal(store.read(1).analysis.reviewed, 1);
  assert.equal(store.read(1).analysis.qualityTotal, 90);
  assert.equal(store.read(1).currentMatch.actions.length, 2);
  await controller.flushEvaluations();
  assert.equal(store.read(1).analysis.reviewed, 1, "flushing twice cannot count a decision twice");
});

test("final placement waits for earlier reviews before choosing the grade", async () => {
  const { store, controller } = fixture();
  const state = { phase: "hand_ended", matchEnded: true, players: [human, "a", "b", "c"], scores: [30000, 25000, 24000, 21000] };
  for (const id of ["first", "second"]) {
    const current = save(id);
    store.persistMatch(current, state);
    store.clearMatch();
  }
  controller.set(save("third"));
  store.write(1, { ...store.read(1), analysis: {
    ...store.read(1).analysis, matchId: "third", eligible: 29, reviewed: 29, qualityTotal: 29 * 81, majorMistakes: 2,
  } });
  const review = deferred();
  await controller.persistAcceptedAction({ type: "discard", tileId: 1 }, human,
    { state: { phase: "playing" } }, null, review.promise);
  let finished = false;
  const settlement = controller.persistAcceptedAction({ type: "pass" }, "a", { state }, {
    checkpoint: async () => ({ state, events: [], version: 2 }),
  }).then(() => { finished = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(finished, false);
  assert.equal(store.read(1).placement.length, 2);
  review.resolve(evaluation);
  await settlement;
  const career = store.read(1);
  assert.equal(career.tier, "C2", "105 raw points plus 30 qualifying reviews unlocks C2");
  assert.equal(career.placement.at(-1).analysis.reviewed, 30);
  assert.equal(career.lastSettlement.total, 105);
  assert.equal(career.currentMatch.actions.length, 2);
});

test("late review results cannot enter a replacement match or a different save slot", async () => {
  const { store, controller } = fixture();
  const review = deferred();
  await controller.persistAcceptedAction({ type: "discard", tileId: 1 }, human,
    { state: { phase: "playing" } }, null, review.promise);
  controller.clear();
  store.activate(2);
  controller.set(save("replacement"));
  await controller.write();
  review.resolve(evaluation);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(store.read(1).analysis.reviewed, 0);
  assert.equal(store.read(2).analysis.reviewed, 0);
  assert.equal(store.read(2).currentMatch.matchId, "replacement");
});

test("failed background evaluation is unavailable, not an incorrect decision", async () => {
  const { store, controller } = fixture();
  const review = deferred();
  await controller.persistAcceptedAction({ type: "discard", tileId: 1 }, human,
    { state: { phase: "playing" } }, null, review.promise);
  review.reject(new Error("worker closed"));
  await controller.flushEvaluations();
  const { analysis } = store.read(1);
  assert.equal(analysis.unavailable, 1);
  assert.equal(analysis.reviewed, 0);
  assert.equal(analysis.majorMistakes, 0);
});

test("a delayed policy review uses the pre-discard snapshot after the authoritative game advances", async (t) => {
  const source = await readFile("src/game/rules/game.lua", "utf8");
  t.mock.method(globalThis, "fetch", async () => new Response(source));
  const game = await createLocalLuaGame({ sourceUrl: "https://game.test/game.lua", playerId: human,
    players: [human, "a", "b", "c"].map((id) => ({ id })),
    randomSeed: "0000000000000000000000000000002a", settings: { initialDealerSeat: 1, canonicalMatchSeats: true } });
  try {
    const snapshot = game.checkpoint().state;
    const action = game.aiAction(snapshot, human).action;
    const expected = evaluateCareerDecision(game, action, human, snapshot);
    assert.equal(game.action(action, human).accepted, true);
    const after = game.checkpoint();
    assert.deepEqual(evaluateCareerDecision(game, action, human, snapshot), expected);
    assert.deepEqual(game.checkpoint(), after, "review cannot change the authoritative game");
  } finally { game.close(); }
});

test("the actual rules worker acknowledges a career discard without invoking policy evaluation", async (t) => {
  const source = await readFile("src/game/rules/game.lua", "utf8");
  t.mock.method(globalThis, "fetch", async () => new Response(`${source}
    function ai_action_review() error("policy must not run in the action response") end
  `));
  const previous = Object.getOwnPropertyDescriptor(globalThis, "self");
  let receive;
  const replies = new Map();
  Object.defineProperty(globalThis, "self", { configurable: true, writable: true, value: {
    addEventListener: (_type, callback) => { receive = callback; },
    postMessage: (message) => {
      const reply = replies.get(message.id);
      replies.delete(message.id);
      if (message.ok) reply.resolve(structuredClone(message.result));
      else reply.reject(new Error(message.error.message));
    },
  } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, "self", previous); else delete globalThis.self; });
  await import("../src/runtime/workers/local-game-worker.js");
  let id = 0;
  const request = (type, payload = {}) => new Promise((resolve, reject) => {
    replies.set(++id, { resolve, reject });
    receive({ data: { id, type, payload } });
  });
  await request("init", { viewerId: human, options: {
    sourceUrl: "https://game.test/game.lua", playerId: human,
    players: [human, "a", "b", "c"].map((id) => ({ id })),
    randomSeed: "0000000000000000000000000000002a", settings: { initialDealerSeat: 1, canonicalMatchSeats: true },
  } });
  const before = await request("checkpoint");
  const action = { type: "discard", tileId: before.state.drawnTile };
  const outcome = await request("action", { action, actorId: human, viewerId: human, actionOptions: { evaluateCareer: true } });
  assert.equal(outcome.result.accepted, true);
  assert.equal(outcome.careerAnalysis, null, "no policy is evaluated inline, even when it would fail");
  const snapshot = outcome.careerReviewState;
  assert.equal(snapshot.moveCount, before.state.moveCount);
  assert.deepEqual(snapshot.hands[human], before.state.hands[human]);
  assert.deepEqual(Object.keys(snapshot.hands), [human]);
  assert.equal(snapshot.paipu, undefined);
  assert.equal(snapshot.wall.length, before.state.wall.length);
  assert.ok(snapshot.wall.every((tile) => tile === 0));
  assert.ok(outcome.projection.state.moveCount > before.state.moveCount);
  const after = await request("checkpoint");
  assert.deepEqual(await request("reviewCareerDecision", { state: snapshot, action, actorId: human }), { unavailable: true });
  assert.deepEqual(await request("checkpoint"), after);
  const callState = structuredClone(before.state);
  callState.phase = "claiming";
  callState.turnIndex = 2;
  callState.drawnTile = 0;
  callState.hands[human] = [125,126,5,9,13,21,25,29,41,45,97,98,117];
  callState.lastDiscard = { player: "a", playerIndex: 2, tile: 128, discardIndex: 1 };
  callState.discards.a = [{ tile: 128, claimed: false }];
  callState.claimants = [{ playerId: human, playerIndex: 1, distance: 3,
    options: [{ kind: "pon", tileIds: [125,126] }] }];
  callState.claimResponses = [];
  callState.claimIndex = 1;
  await request("restoreCheckpoint", { checkpoint: { state: callState, events: [], stateVersion: 20 }, viewerId: human });
  const pass = await request("claimResponse", { action: { type: "pass" }, actorId: human,
    expectedVersion: 20, viewerId: human, actionOptions: { evaluateCareer: true } });
  assert.equal(pass.result.accepted, true);
  assert.equal(pass.careerAnalysis, null);
  assert.equal(pass.careerReviewState.phase, "claiming");
  assert.deepEqual(pass.careerReviewState.claimants.map((entry) => entry.playerId), [human]);
  assert.equal(pass.projection.state.phase, "playing");
  const skipped = await request("claimResponse", { action: { type: "claim", option: 1 }, actorId: human,
    expectedVersion: 21, viewerId: human, actionOptions: { evaluateCareer: true } });
  assert.equal(skipped.result.skipped, true);
  assert.equal(skipped.careerReviewState, undefined);
  assert.equal(skipped.projection.state.phase, "playing", "a skipped response still returns the latest projection");
});
