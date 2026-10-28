import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { LuaFactory } from "wasmoon";

test("All room games implement the current Playweft protocol contract", async () => {
  const games = new Map([["src/game/rules/game.lua", 4]]);

  for (const [gamePath, playerCount] of games) {
    const source = await readFile(gamePath, "utf8");
    const players = Array.from(
      { length: playerCount },
      (_, index) => `{ id = "p${index + 1}", seat = ${index + 1} }`,
    ).join(", ");
    const lua = await new LuaFactory().createEngine();
    try {
      await lua.doString(`
        ${source}
        state = setup({
          protocolVersion = 1,
          players = { ${players} },
          match = {
            id = "match_contract",
            ownerId = "p1",
            startedAt = 100,
            randomSeed = "0000000000000000000000000000007b",
          },
        })
        rejection = on_action(state, {}, {
          protocolVersion = 1,
          matchId = "match_contract",
          actionId = "action_contract",
          actionAt = 200,
          version = 0,
          actor = {
            id = "p1",
            role = "player",
            seat = 1,
            isOwner = true,
          },
        })
        projection = view(state, { { type = "contract_probe" } }, {
          protocolVersion = 1,
          matchId = "match_contract",
          version = 0,
          serverTime = 200,
          viewer = {
            id = "p1",
            role = "player",
            seat = 1,
            isOwner = true,
          },
        })
        result = {
          players = state.players,
          rejection = rejection,
          projection = projection,
        }
      `);
      const result = lua.global.get("result");

      assert.equal(
        result.players[0],
        "p1",
        `${gamePath} should normalize players`,
      );
      assert.equal(
        result.rejection.accepted,
        false,
        `${gamePath} should reject explicitly`,
      );
      assert.match(result.rejection.error.code, /^[A-Z][A-Z0-9_]{0,63}$/);
      assert.ok(result.rejection.error.message.length > 0);
      assert.ok(
        result.projection.state,
        `${gamePath} view should return state`,
      );
      assert.equal(result.projection.events[0].type, "contract_probe");
    } finally {
      lua.global.close();
    }
  }
});
