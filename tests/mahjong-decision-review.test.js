import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { LuaFactory } from "wasmoon";
import { createLocalLuaGame } from "../src/runtime/local-lua-game.js";
import { evaluateCareerDecision } from "../src/game/career/evaluate-decision.js";
import { assessDecisionEvidence } from "../src/game/career/decision-evidence.js";

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
function review_call(kind, bad)
  local hand = kind == "chi" and (bad and {2,3,1,9,10,18,19,27,28,29,30,31,34}
    or {2,3,6,7,8,11,12,13,20,21,25,25,30})
    or (kind == "pon" and {32,32,2,3,4,6,7,8,11,12,25,25,30}
      or {32,32,32,2,3,4,6,7,8,11,12,25,25})
  local state = review_fresh(904, hand)
  state.phase, state.turnIndex, state.drawnTile = "claiming", 1, 0
  state.lastDiscard = {player="p1",playerIndex=1,tile=kind == "chi" and 13 or 128,discardIndex=1}
  state.discards.p1 = {{tile=state.lastDiscard.tile,claimed=false}}
  local options = {{kind=kind,tileIds={state.hands.p2[1],state.hands.p2[2]}}}
  if kind == "kan" then
    options[1].tileIds[3] = state.hands.p2[3]
    options[2] = {kind="pon",tileIds={state.hands.p2[1],state.hands.p2[2]}}
  end
  state.claimants, state.claimResponses, state.claimIndex = {{playerId="p2",playerIndex=2,distance=1,options=options}}, {}, 1
  return state
end
function review_self_kan(kind, locked)
  local hand = kind == "ankan" and {32,32,32,2,3,4,6,7,8,11,11,11,25}
    or {2,3,4,6,7,8,11,12,25,25}
  local state = review_fresh(905, hand)
  state.drawnTile, state.riichi.p2 = 128, locked == true
  if kind == "kakan" then
    state.melds.p2 = {{kind="pon",tiles={125,126,127},fromIndex=1}}
  end
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
      assert.deepEqual(evaluateCareerDecision(game, action, "human", snapshot), evaluateCareerDecision(game, action, "human", full.state));
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

test("chi, pon, daiminkan and passing use the same action-score baseline", async () => {
  const result = await scenario(`
    result = {}
    for _, kind in ipairs({"chi", "pon", "kan"}) do
      local state = review_call(kind, false)
      result[kind] = {
        called = ai_action_review(state,"p2",{type="claim",option=1}),
        passed = ai_action_review(state,"p2",{type="pass"}),
      }
    end
    bad = review_call("chi", true)
    result.bad = {called=ai_action_review(bad,"p2",{type="claim",option=1}),passed=ai_action_review(bad,"p2",{type="pass"})}
  `);
  for (const value of Object.values(result)) {
    assert.equal(value.called.bestScore, value.passed.bestScore);
    assert.deepEqual(value.called.bestAction, value.passed.bestAction);
    assert.equal(value.passed.chosenScore, 0);
    assert.ok(value.called.scoreLoss >= 0);
  }
  assert.equal(result.bad.passed.scoreLoss, 0);
  assert.ok(result.bad.called.scoreLoss > 14, "a no-yaku chi loses value against passing");
  assert.ok(result.pon.passed.scoreLoss > 14, "passing up a useful value-honor call is also reviewed");
  assert.equal(result.kan.called.decisionCount, 3, "pon, daiminkan and pass are compared together");
});

test("ankan, kakan and declining a legal self-kan are reviewed without sampling a future tile", async () => {
  const result = await scenario(`
    result = {}
    for _, kind in ipairs({"ankan", "kakan"}) do
      local state = review_self_kan(kind, false)
      result[kind] = {
        kan=ai_action_review(state,"p2",{type="kan",kind=kind,tileType=32}),
        discard=ai_action_review(state,"p2",{type="discard",tileId=128}),
      }
    end
    locked = review_self_kan("ankan", true)
    result.locked = {
      kan=ai_action_review(locked,"p2",{type="kan",kind="ankan",tileType=32}),
      discard=ai_action_review(locked,"p2",{type="discard",tileId=128}),
    }
  `);
  for (const value of Object.values(result)) {
    assert.equal(value.kan.kanAvailable, true);
    assert.equal(value.kan.bestScore, value.discard.bestScore);
    assert.deepEqual(value.kan.bestAction, value.discard.bestAction);
    assert.ok(value.kan.scoreLoss >= 0);
  }
  assert.equal(result.locked.kan.decisionCount, 2);
});

test("claim reviews exclude ron-only choices and already cancelled claimants", async () => {
  const result = await scenario(`
    state = review_call("pon", false)
    state.claimants[1].options = {{kind="ron",tileIds={}}}
    result = {ron=ai_action_review(state,"p2",{type="pass"}) == nil}
    state.claimants[1].options = {{kind="pon",tileIds={125,126}}}
    state.claimResponses = {{claimant=1,option=0}}
    result.cancelled = ai_action_review(state,"p2",{type="pass"}) == nil
  `);
  assert.deepEqual(result, { ron: true, cancelled: true });
});

test("compact claim snapshots contain only the viewer's options and reproduce the full-state rating", async (t) => {
  const fixture = await scenario(`result = review_call("kan", false)`);
  t.mock.method(globalThis, "fetch", async () => new Response(source));
  const game = await createLocalLuaGame({ sourceUrl: "https://game.test/game.lua", playerId: "p2",
    players: ["p1", "p2", "p3", "p4"].map((id) => ({ id })), randomSeed: "00000000000000000000000000000001" });
  try {
    game.restoreCheckpoint({ state: fixture, events: [], stateVersion: 3 });
    const snapshot = game.careerReviewSnapshot("p2");
    assert.equal(snapshot.lastDiscard.tile, 128);
    assert.deepEqual(snapshot.claimants.map((claimant) => claimant.playerId), ["p2"]);
    assert.deepEqual(Object.keys(snapshot.hands), ["p2"]);
    assert.equal(snapshot.paipu, undefined);
    for (const action of [{ type: "pass" }, { type: "claim", option: 1 }, { type: "claim", option: 2 }]) {
      const compact = evaluateCareerDecision(game, action, "p2", snapshot);
      assert.equal(compact.eligible, true);
      assert.deepEqual(compact, evaluateCareerDecision(game, action, "p2", fixture));
    }
  } finally { game.close(); }
});

test("claim agreement compares consumed tile kinds and red status instead of option indices", () => {
  const state = { phase: "claiming", claimants: [{ playerId: "human", options: [
    { kind: "pon", tileIds: [18, 19] }, { kind: "pon", tileIds: [19, 20] }, { kind: "pon", tileIds: [17, 18] },
  ] }] };
  const game = { aiActionReview: (_state, _actor, action) => ({
    bestAction: { type: "claim", option: 1 }, decisionCount: 4, scoreLoss: 0, mode: "call",
    context: { hand: "1:1:0:1", pressure: 0, objective: "normal", claiming: true, shanten: 2 },
    evidenceCandidates: [{ action, selected: true, shanten: 1, yaku: true, value: 2 }],
  }) };
  assert.equal(evaluateCareerDecision(game, { type: "claim", option: 2 }, "human", state).agreed, true);
  assert.equal(evaluateCareerDecision(game, { type: "claim", option: 3 }, "human", state).agreed, false);
});

test("actual Lua call features separate a structural mistake from an uninformative pass", async () => {
  const result = await scenario(`
    result = {
      bad = ai_action_review(review_call("chi",true),"p2",{type="claim",option=1}),
      pass = ai_action_review(review_call("chi",true),"p2",{type="pass"}),
      useful = ai_action_review(review_call("pon",false),"p2",{type="claim",option=1}),
    }
  `);
  const bad = assessDecisionEvidence(result.bad);
  assert.equal(bad.dimensions.efficiency.major, true);
  assert.equal(bad.dimensions.efficiency.reason, "call_shanten_regression");
  assert.deepEqual(assessDecisionEvidence(result.pass).dimensions, {});
  assert.equal(assessDecisionEvidence(result.useful).dimensions.efficiency.loss, 0);
});

test("actual self-kan review does not convert playing-policy preference into skill evidence", async () => {
  const result = await scenario(`
    state = review_self_kan("ankan",false)
    result = {kan=ai_action_review(state,"p2",{type="kan",kind="ankan",tileType=32}),
      pass=ai_action_review(state,"p2",{type="discard",tileId=128})}
  `);
  assert.deepEqual(assessDecisionEvidence(result.kan).dimensions, {});
  assert.deepEqual(assessDecisionEvidence(result.pass).dimensions, {});
  assert.ok(result.pass.scoreLoss < 24, "there is no forced minimum margin for the policy's preferred kan");
});
