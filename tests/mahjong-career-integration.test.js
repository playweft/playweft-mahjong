import { mountUi } from "./helpers/ui.jsx";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LuaFactory } from "wasmoon";
import { Window } from "happy-dom";
import { createMahjongLobbyMenu } from "../src/ui/lobby/lobby-menu-controller.js";
import { createCareerStore } from "../src/storage/career-store.js";
import { createMahjongSoloSaveController } from "../src/app/solo-save-controller.js";
import { createMahjongSoloSave } from "../src/game/replay/solo-save.js";

const source = await readFile("src/game/rules/game.lua", "utf8");

test("Lua candidate review accepts equivalent physical copies and never changes the game", async () => {
  const lua = await new LuaFactory().createEngine();
  try {
    await lua.doString(`${source}
      state = setup({ players = {{id="mahjong-player",seat=1},{id="a",seat=2},{id="b",seat=3},{id="c",seat=4}}, match={randomSeed="0123456789abcdef0123456789abcdef"} })
      actor = state.players[state.turnIndex]
      before_move = state.moveCount
      best_action = ai_action(state, actor)
      review = ai_action_review(state, actor, best_action)
      result = { review = review, before = before_move, after = state.moveCount }
    `);
    const result = lua.global.get("result");
    assert.equal(result.before, result.after);
    assert.ok(result.review);
    assert.ok(Number.isFinite(result.review.scoreLoss));
    assert.ok(result.review.scoreLoss >= 0);
  } finally { lua.global.close(); }
});

test("accepted final action saves progress and settlement together and forwards evaluation", async () => {
  const entries = new Map();
  const store = createCareerStore({ getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) });
  store.activate(1);
  const save = createMahjongSoloSave({ randomSeed: "0123456789abcdef0123456789abcdef", matchId: "final", matchType: "hanchan", rules: {} });
  store.persistMatch(save);
  const state = { phase: "hand_ended", matchEnded: true, players: ["mahjong-player", "a", "b", "c"], scores: [40000, 20000, 20000, 20000] };
  const controller = createMahjongSoloSaveController({ initialSave: save, humanId: "mahjong-player",
    writeSave: (...args) => store.persistMatch(...args), clearSave: () => store.clearMatch() });
  await controller.persistAcceptedAction({ type: "pass" }, "mahjong-player", { state }, {
    checkpoint: async () => ({ state, events: [], version: 1 }),
  }, { eligible: true, agreed: true, review: { quality: 100, major: false } });
  const career = store.read(1);
  assert.equal(career.placement.length, 1);
  assert.equal(career.placement[0].analysis.reviewed, 1);
  assert.equal(career.currentMatch.actions.length, 1);
  controller.clear();
  assert.equal(store.read(1).placement.length, 1);
  assert.equal(store.read(1).currentMatch, null);
});

test("lobby navigation keeps training lengths in the submenu and exposes three career slots", async () => {
  const window = new Window();
  mountUi(window.document);
  const entries = new Map();
  const store = createCareerStore({ getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) });
  window.matchMedia = () => ({ matches: true });
  const starts = [];
  const menu = createMahjongLobbyMenu({ document: window.document, window, careerStore: store, startCareer: async (slot) => starts.push(slot), showError: assert.fail });
  const document = window.document;
  assert.equal(document.querySelector('[data-lobby-page="training"]').hidden, true);
  assert.equal(document.querySelectorAll('[data-lobby-page="home"] [data-match-type]').length, 0);
  document.querySelector('[data-lobby-target="training"]').click();
  await window.happyDOM.whenAsyncComplete();
  assert.equal(document.querySelector('[data-lobby-page="training"]').hidden, false);
  assert.equal(document.querySelectorAll('[data-lobby-page="training"] [data-match-type]').length, 2);
  document.querySelector('[data-lobby-page="training"] [data-lobby-target="home"]').click();
  await window.happyDOM.whenAsyncComplete();
  document.querySelector('[data-lobby-target="career"]').click();
  await window.happyDOM.whenAsyncComplete();
  assert.equal(document.querySelector('[data-lobby-page="career"]').hidden, false);
  assert.equal(document.querySelectorAll('[data-career-slot]').length, 3);
  document.querySelector('[data-career-slot="2"]').click();
  await window.happyDOM.whenAsyncComplete();
  assert.deepEqual(starts, [2]);
  assert.match(document.querySelector('[data-lobby-page="career"] h2').textContent, /立志戦/);
  menu.destroy();
  await window.happyDOM.close();
});

test("the actual local Lua facade reviews a discard without mutating authoritative state", async (t) => {
  const { createLocalLuaGame } = await import("../src/runtime/local-lua-game.js");
  const { evaluateCareerDiscard } = await import("../src/game/career/evaluate-discard.js");
  t.mock.method(globalThis, "fetch", async () => new Response(source));
  const game = await createLocalLuaGame({ sourceUrl: "https://games.example.test/mahjong/game.lua", playerId: "mahjong-player",
    players: [{ id: "mahjong-player" }, { id: "a" }, { id: "b" }, { id: "c" }],
    randomSeed: "0123456789abcdef0123456789abcdef", settings: { matchType: "hanchan", initialDealerSeat: 1, canonicalMatchSeats: true } });
  try {
    const checkpoint = game.checkpoint();
    const actor = checkpoint.state.players[checkpoint.state.turnIndex - 1];
    const action = game.aiAction(checkpoint.state, actor).action;
    assert.ok(["discard", "riichi"].includes(action.type));
    const review = evaluateCareerDiscard(game, action, actor);
    assert.equal(review.eligible, true);
    assert.equal(review.agreed, true);
    assert.ok(review.review.quality >= 0 && review.review.quality <= 100);
    assert.deepEqual(game.checkpoint(), checkpoint);
  } finally { game.close(); }
});
