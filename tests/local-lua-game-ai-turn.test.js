import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { createLocalLuaGame } from "../src/runtime/local-lua-game.js";
import { createMahjongSessionController } from "../src/app/session-controller.js";

const HUMAN_ID = "human";
const PLAYERS = [
  { id: HUMAN_ID, name: "你" },
  { id: "ai-1", name: "一号" },
  { id: "ai-2", name: "二号" },
  { id: "ai-3", name: "三号" },
];

const seedFor = (value) => value.toString(16).padStart(32, "0");

async function createGame(t, seed, sourceOverride) {
  const source = sourceOverride ?? await readFile("src/game/rules/game.lua", "utf8");
  t.mock.method(globalThis, "fetch", async () => new Response(source));
  return createLocalLuaGame({
    sourceUrl: "https://games.example.test/mahjong/game.lua",
    players: PLAYERS,
    playerId: HUMAN_ID,
    randomSeed: seedFor(seed),
    matchId: `match-${seed}`,
  });
}

function luaTableValues(value) {
  return Array.isArray(value) ? value : Object.values(value ?? {});
}

async function claimFixture(t, { humanRon = false, thirdRon = false, multipleRon = true, tripleRonAbort = false, pons = false } = {}) {
  const source = await readFile("src/game/rules/game.lua", "utf8");
  return createGame(t, 1, `${source}
    local original_setup = setup
    function setup(context)
      local state = original_setup(context)
      local function ids(types)
        local copies, tiles = {}, {}
        for _, kind in ipairs(types) do
          copies[kind] = (copies[kind] or 0) + 1
          tiles[#tiles + 1] = (kind - 1) * 4 + copies[kind]
        end
        return tiles
      end
      local ready = { 1,2, 4,5,6, 10,11,12, 19,20,21, 28,28 }
      local chi = { 1,2,4,6,8,10,13,16,19,22,25,28,31 }
      local quiet = { 1,4,7,10,13,16,19,22,25,28,29,30,31 }
      local pon = { 3,3,1,4,7,10,13,16,19,22,25,28,31 }
      state.hands.human = ids(${humanRon ? "ready" : "chi"})
      state.riichi.human = ${humanRon}
      state.hands["ai-1"] = ids(${pons ? "pon" : "ready"})
      state.riichi["ai-1"] = ${!pons}
      state.hands["ai-2"] = ids(${pons ? "pon" : thirdRon ? "ready" : "quiet"})
      state.riichi["ai-2"] = ${thirdRon}
      state.hands["ai-3"] = ids(quiet)
      state.drawnTile, state.turnIndex = 9, 4
      state.rules.multipleRon = ${multipleRon}
      state.rules.tripleRonAbort = ${tripleRonAbort}
      return on_action(state, { type = "discard", tileId = 9 }, { actor = { id = "ai-3" } }).state
    end
    do
    local original_claim = choose_ai_claim
    choose_ai_claim = function(state, claimant, ron_only)
      if ron_only then return original_claim(state, claimant, true) end
      ${pons ? `
        assert(#state.claimResponses == 0, "Every AI must see the original response window")
        for index, option in ipairs(claimant.options) do
          if option.kind == "pon" then return { type = "claim", option = index } end
        end
        return { type = "pass" }
      ` : `error("Ron must bypass expensive call strategy")`}
    end
    end
  `);
}

test("a later AI ron is precomputed while the human can chi, then cancels that lower-priority intent", async (t) => {
  const game = await claimFixture(t);
  t.after(() => game.close());
  assert.equal(game.aiDecision().status, "waiting_for_human");
  const before = structuredClone(game.checkpoint());
  const humanChi = luaTableValues(game.view().state.legalActions.claims).find((option) => option.kind === "chi");
  assert.ok(humanChi);
  const plan = game.aiClaimDecisions();
  const decisions = luaTableValues(plan.decisions);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].actorId, "ai-1");
  assert.equal(decisions[0].priority, 4);
  assert.deepEqual(game.checkpoint().state.claimResponses, before.state.claimResponses);
  assert.equal(game.checkpoint().version, before.version);
  const stale = game.claimResponse(decisions[0].action, "ai-1", plan.version + 1);
  assert.equal(stale.error.code, "stale_claim_decision");
  const won = game.claimResponse(decisions[0].action, "ai-1", plan.version);
  assert.equal(won.accepted, true);
  assert.equal(game.view().state.winType, "ron");
  const human = game.claimResponse({ type: "claim", option: humanChi.option }, HUMAN_ID, won.version);
  assert.equal(human.skipped, true);
  assert.equal(game.checkpoint().version, won.version);
  assert.equal(luaTableValues(game.view().state.melds?.human).length, 0);
});

test("precomputed claims preserve multiple ron, head-bump and triple-ron abort rules", async (t) => {
  for (const config of [
    { multipleRon: true, thirdRon: false, tripleRonAbort: false, winners: 2 },
    { multipleRon: false, thirdRon: false, tripleRonAbort: false, winners: 1 },
    { multipleRon: true, thirdRon: true, tripleRonAbort: true, abort: true },
  ]) {
    const game = await claimFixture(t, { ...config, humanRon: true });
    try {
      const plan = game.aiClaimDecisions();
      let version = plan.version;
      for (const decision of luaTableValues(plan.decisions)) {
        const result = game.claimResponse(decision.action, decision.actorId, version);
        assert.equal(result.accepted, true);
        version = result.version;
      }
      assert.equal(game.view().state.phase, "claiming", "a human ron must remain available after AI ron responses");
      const option = luaTableValues(game.view().state.legalActions.claims).find((option) => option.kind === "ron");
      assert.equal(game.claimResponse({ type: "claim", option: option.option }, HUMAN_ID, version).accepted, true);
      const state = game.view().state;
      assert.equal(state.phase, "hand_ended");
      if (config.abort) assert.equal(state.abortiveReason, "三家和");
      else {
        assert.equal(luaTableValues(state.winners).length, config.winners);
        if (!config.multipleRon) assert.deepEqual(state.winners, [HUMAN_ID]);
      }
    } finally { game.close(); }
  }
});

test("AI calls share the original snapshot and resolve by seat rather than submission order", async (t) => {
  const game = await claimFixture(t, { pons: true });
  t.after(() => game.close());
  const plan = game.aiClaimDecisions();
  const decisions = luaTableValues(plan.decisions);
  assert.equal(decisions.length, 2);
  let version = plan.version;
  for (const decision of [...decisions].reverse()) {
    assert.equal(decision.priority, 3);
    const result = game.claimResponse(decision.action, decision.actorId, version);
    assert.equal(result.accepted, true);
    version = result.version;
  }
  const state = game.view().state;
  assert.equal(state.phase, "playing");
  assert.equal(state.turnIndex, 2);
  assert.equal(luaTableValues(state.melds["ai-1"]).length, 1);
  assert.equal(luaTableValues(state.melds["ai-2"]).length, 0);
});

test("the solo session keeps an early chi intent responsive and saves only the AI's winning ron", async (t) => {
  const authority = await claimFixture(t);
  t.after(() => authority.close());
  let state = authority.view().state;
  const log = [];
  const facade = {
    aiClaimDecisions: () => authority.aiClaimDecisions(),
    claimResponse(action, actor, version) {
      const result = authority.claimResponse(action, actor, version);
      return { result, projection: authority.view() };
    },
  };
  const session = createMahjongSessionController({
    humanId: HUMAN_ID, getMode: () => "solo", getGame: () => facade, getState: () => state,
    getAutoActions: () => ({}), getRiichiMode: () => false,
    refreshProjection: (projection) => { state = projection.state; },
    persistAcceptedAction: (action, actorId) => log.push({ action, actorId }),
    onAiError: (error) => { throw error; },
  });
  t.after(() => session.cancelScheduledActions());
  session.scheduleAi();
  assert.equal(session.isActionInFlight(), false);
  const chi = luaTableValues(state.legalActions.claims).find((option) => option.kind === "chi");
  assert.equal(await session.dispatch({ type: "claim", option: chi.option }), true);
  assert.equal(state.phase, "hand_ended");
  assert.equal(state.winType, "ron");
  assert.equal(session.isActionInFlight(), false);
  assert.equal(log.length, 1);
  assert.equal(log[0].actorId, "ai-1");
  const replay = await claimFixture(t);
  try {
    for (const entry of log) assert.equal(replay.action(entry.action, entry.actorId).accepted, true);
    assert.deepEqual(replay.view().state.winners, state.winners);
  } finally { replay.close(); }
});

test("local Mahjong runtime derives the active AI from its authoritative state", async (t) => {
  let game;
  let projection;
  for (let seed = 1; seed <= 16; seed += 1) {
    game = await createGame(t, seed);
    projection = game.view(HUMAN_ID);
    if (projection.state.turnIndex !== 1) break;
    game.close();
    game = undefined;
  }
  t.after(() => game?.close());

  assert.ok(game, "a deterministic seed should give an AI the opening turn");
  const expectedActor = projection.state.players[projection.state.turnIndex - 1];
  const outcome = game.aiTurn(HUMAN_ID);

  assert.equal(outcome.status, "acted");
  assert.equal(outcome.actorId, expectedActor);
  assert.equal(outcome.result.accepted, true);
  assert.equal(outcome.projection.state.moveCount, projection.state.moveCount + 1);
});

test("local Mahjong runtime leaves a human turn untouched", async (t) => {
  let game;
  for (let seed = 1; seed <= 16; seed += 1) {
    game = await createGame(t, seed);
    if (game.view(HUMAN_ID).state.turnIndex === 1) break;
    game.close();
    game = undefined;
  }
  t.after(() => game?.close());

  assert.ok(game, "a deterministic seed should give the human the opening turn");
  const before = game.view(HUMAN_ID);
  const outcome = game.aiTurn(HUMAN_ID);

  assert.equal(outcome.status, "waiting_for_human");
  assert.equal(outcome.actorId, HUMAN_ID);
  assert.equal(outcome.projection.state.moveCount, before.state.moveCount);
});

test("local Mahjong AI can decide one named actor without applying an action", async (t) => {
  let game;
  let projection;
  for (let seed = 1; seed <= 16; seed += 1) {
    game = await createGame(t, seed);
    projection = game.view(HUMAN_ID);
    if (projection.state.turnIndex !== 1) break;
    game.close();
    game = undefined;
  }
  t.after(() => game?.close());

  assert.ok(game, "a deterministic seed should give an AI the opening turn");
  const actorId = projection.state.players[projection.state.turnIndex - 1];
  const checkpoint = game.checkpoint();
  const outcome = game.aiAction(checkpoint.state, actorId);

  assert.equal(outcome.status, "acted");
  assert.equal(outcome.actorId, actorId);
  assert.ok(outcome.action?.type);
  assert.equal(game.view(HUMAN_ID).state.moveCount, projection.state.moveCount);
});

test("local Mahjong AI can decide its authoritative next action without applying it", async (t) => {
  let game;
  let projection;
  for (let seed = 1; seed <= 16; seed += 1) {
    game = await createGame(t, seed);
    projection = game.view(HUMAN_ID);
    if (projection.state.turnIndex !== 1) break;
    game.close();
    game = undefined;
  }
  t.after(() => game?.close());

  assert.ok(game, "a deterministic seed should give an AI the opening turn");
  const outcome = game.aiDecision(HUMAN_ID);

  assert.equal(outcome.status, "acted");
  assert.equal(outcome.actorId, projection.state.players[projection.state.turnIndex - 1]);
  assert.ok(outcome.action?.type);
  assert.equal(game.view(HUMAN_ID).state.moveCount, projection.state.moveCount);
});

test("local Mahjong runtime calculates a human turn's legal preview without mutating state", async (t) => {
  let game;
  let projection;
  for (let seed = 1; seed <= 16; seed += 1) {
    game = await createGame(t, seed);
    projection = game.view(HUMAN_ID);
    if (projection.state.turnIndex === 1) break;
    game.close();
    game = undefined;
  }
  t.after(() => game?.close());

  assert.ok(game, "a deterministic seed should give the human the opening turn");
  const checkpoint = game.checkpoint();
  const legal = game.legalActions(checkpoint.state, HUMAN_ID);

  assert.equal(legal.canDiscard, true);
  assert.ok(legal.riichiTiles && typeof legal.riichiTiles === "object");
  assert.ok(legal.tenpaiDiscards && typeof legal.tenpaiDiscards === "object");
  assert.equal(game.view(HUMAN_ID).state.moveCount, projection.state.moveCount);
});

test("local Mahjong room preview keeps tsumo and riichi for a completed closed hand", async (t) => {
  const game = await createGame(t, 12_345);
  t.after(() => game.close());
  const checkpoint = game.checkpoint();
  const playerIds = PLAYERS.map((player) => player.id);
  const emptyByPlayer = Object.fromEntries(playerIds.map((id) => [id, []]));
  const falseByPlayer = Object.fromEntries(playerIds.map((id) => [id, false]));
  const previewState = {
    players: playerIds,
    phase: "playing",
    turnIndex: 1,
    drawnTile: 89,
    hands: {
      [HUMAN_ID]: [5, 6, 9, 13, 17, 18, 21, 25, 49, 53, 57, 81, 85],
    },
    wall: [0, 0, 0, 0],
    deadWall: checkpoint.state.deadWall,
    kanCount: 0,
    callOccurred: false,
    melds: emptyByPlayer,
    discards: emptyByPlayer,
    riichi: falseByPlayer,
    scores: [25_000, 25_000, 25_000, 25_000],
    matchType: "east",
    roundWind: 1,
    handNumber: 1,
    dealerIndex: 1,
    honba: 0,
    riichiSticks: 0,
    rules: checkpoint.state.rules,
    kuikaeForbidden: { [HUMAN_ID]: {} },
    tempFuriten: { [HUMAN_ID]: false },
    riichiFuriten: { [HUMAN_ID]: false },
    firstTurn: { [HUMAN_ID]: false },
    doubleRiichi: { [HUMAN_ID]: false },
    ippatsu: { [HUMAN_ID]: false },
    rinshanWin: false,
    chankanWin: false,
  };

  const legal = game.legalActions(previewState, HUMAN_ID);

  assert.equal(legal.canTsumo, true);
  assert.equal(legal.canRiichi, true);
});

test("local Mahjong runtime calculates the exact river-bottom discard declaration", async (t) => {
  const game = await createGame(t, 12_345);
  t.after(() => game.close());
  const checkpoint = game.checkpoint();
  checkpoint.state.phase = "playing";
  checkpoint.state.turnIndex = 1;
  checkpoint.state.drawnTile = 0;
  checkpoint.state.melds[HUMAN_ID] = [];
  checkpoint.state.hands[HUMAN_ID] = [
    1, 5, 9, 13, 17, 21, 37, 41, 45, 73, 77, 81, 109, 133,
  ];

  const report = game.tenpaiReport(checkpoint.state, 133, HUMAN_ID);
  const reports = game.tenpaiReports(checkpoint.state, HUMAN_ID);

  assert.equal(report.tenpai, true);
  assert.deepEqual(report, reports[133]);
  assert.deepEqual(luaTableValues(report.waits), [28]);
  assert.equal(report.witness.form, "standard");
  assert.equal(report.witness.pair, 28);
  assert.equal(luaTableValues(report.witness.groups).length, 4);
  assert.match(report.key, /:/);

  checkpoint.state.hands[HUMAN_ID].pop();
  const currentReport = game.currentTenpaiReport(checkpoint.state, HUMAN_ID);

  assert.equal(currentReport.tenpai, true);
  assert.deepEqual(luaTableValues(currentReport.waits), [28]);
  assert.equal(currentReport.furiten, false);
  assert.equal(currentReport.witness, undefined);

  const reconnectedRiichiReport = game.riichiWaitReport(
    {
      hands: { [HUMAN_ID]: checkpoint.state.hands[HUMAN_ID] },
      melds: { [HUMAN_ID]: [] },
    },
    HUMAN_ID,
  );
  assert.equal(reconnectedRiichiReport.tenpai, true);
  assert.deepEqual(luaTableValues(reconnectedRiichiReport.waits), [28]);
  assert.equal(reconnectedRiichiReport.furiten, undefined);

  checkpoint.state.riichi[HUMAN_ID] = true;
  checkpoint.state.drawnTile = 133;
  game.restoreCheckpoint(checkpoint, HUMAN_ID);
  const lockedRiichiReport = game.currentGameTenpaiReport(HUMAN_ID);

  assert.equal(lockedRiichiReport.tenpai, true);
  assert.deepEqual(luaTableValues(lockedRiichiReport.waits), [28]);
  assert.equal(lockedRiichiReport.furiten, false);
});

test("local Mahjong runtime keeps a special-hand riichi wait without a verifier witness", async (t) => {
  const game = await createGame(t, 67_890);
  t.after(() => game.close());
  const checkpoint = game.checkpoint();
  checkpoint.state.phase = "playing";
  checkpoint.state.turnIndex = 1;
  checkpoint.state.drawnTile = 29;
  checkpoint.state.melds[HUMAN_ID] = [];
  checkpoint.state.riichi[HUMAN_ID] = true;
  checkpoint.state.hands[HUMAN_ID] = [
    1, 33, 37, 69, 73, 105, 109, 113, 117, 121, 125, 129, 133,
  ];

  const report = game.currentTenpaiReport(checkpoint.state, HUMAN_ID);

  assert.equal(report.tenpai, true);
  assert.deepEqual(luaTableValues(report.waits), [
    1, 9, 10, 18, 19, 27, 28, 29, 30, 31, 32, 33, 34,
  ]);
  assert.equal(report.witness, undefined);
});

test("local Mahjong authority advances every AI turn without a page-selected actor", async (t) => {
  const game = await createGame(t, 12_345);
  t.after(() => game.close());
  let projection = game.view(HUMAN_ID);
  let steps = 0;

  while (projection.state.phase !== "hand_ended" && steps < 500) {
    const outcome = game.aiTurn(HUMAN_ID);
    if (outcome.status === "waiting_for_human") {
      const action =
        outcome.projection.state.phase === "claiming"
          ? { type: "pass" }
          : {
              type: "discard",
              tileId:
                Number(outcome.projection.state.drawnTile) ||
                outcome.projection.state.ownHand[0],
            };
      assert.equal(game.action(action, HUMAN_ID).accepted, true);
      projection = game.view(HUMAN_ID);
    } else {
      assert.equal(outcome.status, "acted");
      assert.equal(outcome.result.accepted, true);
      projection = outcome.projection;
    }
    steps += 1;
  }

  assert.equal(projection.state.phase, "hand_ended");
  assert.ok(steps > 20 && steps < 500);
});

test("local Mahjong completes a human ron and restores its terminal checkpoint", async (t) => {
  const source = await readFile("src/game/rules/game.lua", "utf8");
  const preparedRonSource = `${source}
    local original_setup = setup
    function setup(context)
      local state = original_setup(context)
      local function ids(types)
        local copies, tiles = {}, {}
        for _, kind in ipairs(types) do
          copies[kind] = (copies[kind] or 0) + 1
          tiles[#tiles + 1] = (kind - 1) * 4 + copies[kind]
        end
        return tiles
      end
      local human = context.players[1].id
      local discarder = context.players[4].id
      state.hands[human] = ids({ 1,2, 4,5,6, 10,11,12, 19,20,21, 28,28 })
      state.riichi[human] = true
      local discarder_hand = ids({ 3,4,5, 7,8,9, 13,14,15, 22,23,24, 29, 3 })
      state.drawnTile = table.remove(discarder_hand)
      state.hands[discarder] = discarder_hand
      state.turnIndex = 4
      return on_action(
        state,
        { type = "discard", tileId = state.drawnTile },
        { actor = { id = discarder } }
      ).state
    end`;
  const game = await createGame(t, 1, preparedRonSource);
  t.after(() => game.close());

  const beforeClaim = game.view(HUMAN_ID);
  const ron = luaTableValues(beforeClaim.state.legalActions.claims).find(
    (claim) => claim?.kind === "ron",
  );
  assert.ok(ron, "the human projection should offer a ron claim");

  const won = game.action({ type: "claim", option: ron.option }, HUMAN_ID);
  assert.equal(won.accepted, true);
  const terminal = game.view(HUMAN_ID);
  assert.equal(terminal.state.phase, "hand_ended");
  assert.equal(terminal.state.winType, "ron");

  const snapshot = structuredClone(game.checkpoint());
  const restored = await createGame(t, 1, preparedRonSource);
  t.after(() => restored.close());
  const restoredProjection = restored.restoreCheckpoint(
    {
      state: snapshot.state,
      events: snapshot.events,
      stateVersion: snapshot.version,
    },
    HUMAN_ID,
  );

  assert.equal(restoredProjection.state.phase, "hand_ended");
  assert.equal(restoredProjection.state.winType, "ron");
});
