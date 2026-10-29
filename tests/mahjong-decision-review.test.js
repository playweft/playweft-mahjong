import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { LuaFactory } from "wasmoon";
import { createLocalLuaGame } from "../src/runtime/local-lua-game.js";
import { evaluateCareerDiscard } from "../src/game/career/evaluate-discard.js";

const source = await readFile("src/game/rules/game.lua", "utf8");
const fixtures = `
function review_ids(types)
  local copies, tiles = {}, {}
  for _, kind in ipairs(types) do
    copies[kind] = (copies[kind] or 0) + 1
    tiles[#tiles + 1] = (kind - 1) * 4 + copies[kind]
  end
  return tiles
end
function review_fresh(seed, hand)
  local state = setup({ players = {{id="p1",seat=1},{id="p2",seat=2},{id="p3",seat=3},{id="p4",seat=4}},
    match = { randomSeed = string.format("%032x", seed) } })
  state.turnIndex, state.firstTurn.p2 = 2, false
  state.hands.p2, state.drawnTile, state.kuikaeForbidden.p2 = review_ids(hand), 117, {}
  return state
end
function review_riichi()
  return review_fresh(902, {2,3,4,6,7,8,11,12,13,20,21,26,26})
end
function review_dama()
  local state = review_fresh(903, {2,3,4,6,7,8,20,21,24,24,26,26,26})
  state.deadWall[1] = 97
  return state
end
`;

async function scenario(script) {
  const lua = await new LuaFactory().createEngine();
  try {
    await lua.doString(`${source}\n${fixtures}\n${script}`);
    return lua.global.get("result");
  } finally { lua.global.close(); }
}

test("review scores riichi and dama separately on the same discarded tile", async () => {
  const result = await scenario(`
    r, d = review_riichi(), review_dama()
    result = {
      goodRiichi = ai_action_review(r, "p2", {type="riichi",tileId=117}),
      missedRiichi = ai_action_review(r, "p2", {type="discard",tileId=117}),
      goodDama = ai_action_review(d, "p2", {type="discard",tileId=117}),
      badRiichi = ai_action_review(d, "p2", {type="riichi",tileId=117}),
    }
  `);
  assert.deepEqual(result.goodRiichi.bestAction, { type: "riichi", tileId: 117 });
  assert.equal(result.goodRiichi.scoreLoss, 0);
  assert.ok(result.missedRiichi.riichiLoss > 14);
  assert.equal(result.missedRiichi.scoreLoss, result.missedRiichi.riichiLoss);
  assert.deepEqual(result.goodDama.bestAction, { type: "discard", tileId: 117 });
  assert.equal(result.goodDama.scoreLoss, 0);
  assert.ok(result.badRiichi.riichiLoss > 14);
  assert.equal(result.badRiichi.scoreLoss, result.badRiichi.riichiLoss);
});

test("all selected actions share one complete candidate analysis and an invariant scoring baseline", async () => {
  const result = await scenario(`
    review_original_choose = choose_ai_discard
    review_calls, review_complete = 0, true
    choose_ai_discard = function(...)
      review_calls = review_calls + 1
      review_complete = review_complete and select(7, ...) == true
      return review_original_choose(...)
    end
    review_state, reviews = review_riichi(), {}
    for _, tile in ipairs(hand_with_drawn(review_state, "p2")) do
      local before = review_calls
      local review = ai_action_review(review_state, "p2", {type="discard",tileId=tile})
      assert(review_calls == before + 1, "one analysis per review")
      reviews[#reviews + 1] = review
    end
    result = { reviews = reviews, complete = review_complete, calls = review_calls }
  `);
  assert.equal(result.complete, true);
  assert.equal(result.calls, 14);
  const first = result.reviews[0];
  for (const review of result.reviews) {
    assert.deepEqual(review.bestAction, first.bestAction);
    assert.equal(review.bestScore, first.bestScore);
    assert.equal(review.candidateCount, first.candidateCount);
    assert.ok(review.chosenScore <= review.bestScore + 0.001);
  }
});

test("review never offers an unaffordable, open-hand or late-wall riichi", async () => {
  const result = await scenario(`
    result = {}
    for _, reason in ipairs({"poor", "late", "open"}) do
      local state = review_riichi()
      if reason == "poor" then state.scores[2] = 900 end
      if reason == "late" then state.wall = {1,2,3} end
      if reason == "open" then
        state.melds.p2 = {{kind="chi",tiles={5,9,13}}}
        state.hands.p2 = review_ids({6,7,8,11,12,13,20,21,26,26})
      end
      local discard = ai_action_review(state, "p2", {type="discard",tileId=117})
      result[reason] = {best=discard.bestAction.type,riichi=discard.riichiAvailable,
        illegal=ai_action_review(state, "p2", {type="riichi",tileId=117}) == nil}
    end
  `);
  for (const value of Object.values(result)) {
    assert.equal(value.best, "discard");
    assert.equal(value.riichi, false);
    assert.equal(value.illegal, true);
  }
});

test("compact snapshots preserve review results without hidden hands, future draws or historical logs", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(source));
  for (const seed of [1, 42, 123]) {
    const game = await createLocalLuaGame({ sourceUrl: "https://game.test/game.lua", playerId: "human",
      players: ["human", "a", "b", "c"].map((id) => ({ id })), randomSeed: seed.toString(16).padStart(32, "0"),
      settings: { initialDealerSeat: 1, canonicalMatchSeats: true } });
    try {
      const full = game.checkpoint();
      const action = game.aiAction(full.state, "human").action;
      const snapshot = game.careerReviewSnapshot("human");
      assert.deepEqual(evaluateCareerDiscard(game, action, "human", snapshot), evaluateCareerDiscard(game, action, "human", full.state));
      assert.deepEqual(Object.keys(snapshot.hands), ["human"]);
      assert.equal(snapshot.paipu, undefined);
      assert.equal(snapshot.rinshan, undefined);
      assert.equal(snapshot.seed, undefined);
      assert.equal(snapshot.wall.length, full.state.wall.length);
      assert.ok(snapshot.wall.every((tile) => tile === 0));
      assert.equal(snapshot.deadWall[0], full.state.deadWall[0]);
      assert.equal(snapshot.deadWall[1], 0);
      assert.ok(JSON.stringify(snapshot).length < JSON.stringify(full.state).length * 0.5);
      const changed = structuredClone(full.state);
      changed.hands.a = [136];
      changed.wall.fill(136);
      changed.deadWall[1] = 136;
      changed.deadWall[2] = 135;
      changed.paipu.privateNoise = "history".repeat(10000);
      game.restoreCheckpoint({ state: changed, events: [], stateVersion: full.version });
      assert.deepEqual(game.careerReviewSnapshot("human"), snapshot, "private state and historical growth do not change the review payload");
    } finally { game.close(); }
  }
});
