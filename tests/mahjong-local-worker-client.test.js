import assert from "node:assert/strict";
import test from "node:test";
import { createLocalLuaGame, resolveLocalLuaSourceUrl } from "../src/runtime/workers/local-game-worker-client.js";

test("mahjong worker resolves rules beside the page instead of its asset bundle", () => {
  assert.equal(
    resolveLocalLuaSourceUrl(
      "./game.lua",
      "https://games.example.test/mahjong/",
    ),
    "https://games.example.test/mahjong/game.lua",
  );
});

function workerFixture(t) {
  const previousWorker = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const workers = [];
  class FakeWorker {
    constructor() { this.listeners = {}; this.requests = []; workers.push(this); }
    addEventListener(type, callback) { this.listeners[type] = callback; }
    postMessage(message) {
      this.requests.push(message);
      if (message.type === "init" && workers[0] === this)
        queueMicrotask(() => this.respond(message, { matchId: "match", projection: { state: { phase: "playing" } } }));
    }
    respond(message, result) { this.listeners.message({ data: { id: message.id, ok: true, result } }); }
    terminate() { this.terminated = true; }
  }
  Object.defineProperty(globalThis, "Worker", { configurable: true, writable: true, value: FakeWorker });
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: { location: { href: "https://game.test/" } } });
  let game;
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  t.after(async () => {
    game?.close();
    await tick();
    if (previousWorker) Object.defineProperty(globalThis, "Worker", previousWorker); else delete globalThis.Worker;
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else delete globalThis.window;
  });
  return { workers, tick, async start() {
    game = await createLocalLuaGame({ sourceUrl: "./game.lua", playerId: "human" });
    return game;
  } };
}

test("career discard returns its projection while the independent reviewer is still initializing", async (t) => {
  const f = workerFixture(t);
  const game = await f.start();
  const action = { type: "discard", tileId: 1 };
  const pending = game.action(action, "human", "human", { evaluateCareer: true });
  await f.tick();
  const request = f.workers[0].requests.at(-1);
  const before = { phase: "playing", moveCount: 5 };
  f.workers[0].respond(request, { result: { accepted: true }, careerReviewState: before,
    projection: { state: { phase: "playing", moveCount: 6 } } });
  const outcome = await pending;
  assert.equal(outcome.projection.state.moveCount, 6);
  assert.equal("careerReviewState" in outcome, false);
  assert.equal(typeof outcome.careerAnalysis.then, "function");
  await f.tick();
  assert.equal(f.workers.length, 2);
  const reviewer = f.workers[1];
  assert.deepEqual(reviewer.requests.map(({ type }) => type), ["init"]);
  // Neither reviewer startup nor policy execution occupies the rules queue.
  const nextView = game.view();
  await f.tick();
  f.workers[0].respond(f.workers[0].requests.at(-1), { state: { moveCount: 7 } });
  assert.equal((await nextView).state.moveCount, 7);
  reviewer.respond(reviewer.requests[0], { matchId: "review", projection: {} });
  await f.tick();
  const review = reviewer.requests.at(-1);
  assert.equal(review.type, "reviewCareerDecision");
  assert.deepEqual(review.payload, { state: before, action, actorId: "human" });
  const evaluation = { eligible: true, agreed: true, review: { quality: 100, major: false } };
  reviewer.respond(review, evaluation);
  assert.deepEqual(await outcome.careerAnalysis, evaluation);
  game.close();
  await f.tick();
  assert.equal(reviewer.terminated, true);
});

test("ordinary and rejected actions never create a career reviewer", async (t) => {
  const f = workerFixture(t);
  const game = await f.start();
  for (const accepted of [true, false]) {
    const pending = game.action({ type: "discard", tileId: 1 });
    await f.tick();
    f.workers[0].respond(f.workers[0].requests.at(-1), { result: { accepted }, careerAnalysis: null, projection: accepted ? {} : null });
    assert.equal((await pending).careerAnalysis, null);
  }
  assert.equal(f.workers.length, 1);
});

test("accepted claim responses use the background review path and skipped responses retain their projection", async (t) => {
  const f = workerFixture(t);
  const game = await f.start();
  const action = { type: "claim", option: 2 };
  const pending = game.claimResponse(action, "human", 8, "human", { evaluateCareer: true });
  await f.tick();
  const request = f.workers[0].requests.at(-1);
  assert.equal(request.payload.actionOptions.evaluateCareer, true);
  assert.equal(request.payload.expectedVersion, 8);
  f.workers[0].respond(request, { result: { accepted: true, version: 9 }, careerReviewState: { phase: "claiming" },
    projection: { state: { phase: "playing" } } });
  const outcome = await pending;
  assert.equal(typeof outcome.careerAnalysis.then, "function");
  await f.tick();
  const reviewer = f.workers[1];
  reviewer.respond(reviewer.requests[0], { projection: {} });
  await f.tick();
  const review = reviewer.requests.at(-1);
  assert.deepEqual(review.payload.action, action);
  reviewer.respond(review, { eligible: true });
  assert.deepEqual(await outcome.careerAnalysis, { eligible: true });
  const skipped = game.claimResponse(action, "human", 9, "human", { evaluateCareer: true });
  await f.tick();
  f.workers[0].respond(f.workers[0].requests.at(-1), { result: { accepted: false, skipped: true },
    careerAnalysis: null, projection: { state: { phase: "hand_ended" } } });
  const result = await skipped;
  assert.equal(result.careerAnalysis, null);
  assert.equal(result.projection.state.phase, "hand_ended");
});

test("closing a game cancels a pending review and records unavailable rather than a bad decision", async (t) => {
  const f = workerFixture(t);
  const game = await f.start();
  const pending = game.action({ type: "discard", tileId: 1 }, "human", "human", { evaluateCareer: true });
  await f.tick();
  f.workers[0].respond(f.workers[0].requests.at(-1), { result: { accepted: true }, careerReviewState: {}, projection: {} });
  const outcome = await pending;
  await f.tick();
  const reviewer = f.workers[1];
  reviewer.respond(reviewer.requests[0], { projection: {} });
  await f.tick();
  game.close();
  assert.deepEqual(await outcome.careerAnalysis, { unavailable: true });
  assert.equal(reviewer.terminated, true);
});
