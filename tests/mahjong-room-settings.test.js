import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";
import { mountUi } from "./helpers/ui.jsx";
import { createMahjongRoomController } from "../src/app/room-controller.js";
import { createMahjongSettingsDialog } from "../src/ui/settings/settings-dialog.js";

function fixture(t, { confirm = async () => true, rendererReady = Promise.resolve() } = {}) {
  const window = new Window();
  window.matchMedia = () => ({ matches: true });
  const unmount = mountUi(window.document);
  const document = window.document;
  const root = document.querySelector("#settings-dialog");
  const calls = [];
  let mode = "room", playerId = "host", currentState;
  let controller;
  const settings = createMahjongSettingsDialog({
    trigger: document.querySelector("#settings-button"), root,
    surface: root.querySelector(".settings-dialog-card"),
    tabButtons: [...root.querySelectorAll("[data-settings-tab]")],
    onEndMatch: () => void controller.returnToLobby(),
  });
  const elements = Object.fromEntries([
    ["app", "mahjong-app"], ["setup", "setup-panel"], ["loading", "loading-panel"],
    ["loadingMessage", "loading-message"], ["result", "result-panel"],
  ].map(([key, id]) => [key, document.getElementById(id)]));
  const table = {
    getState: () => currentState,
    refresh: async ({ state }) => { currentState = state; calls.push("refresh"); },
    reset: () => { currentState = undefined; calls.push("reset"); },
    syncMatchMusic: (options) => calls.push(["music", options]),
    applyLegalActions() {}, applyRiichiTenpai() {},
  };
  controller = createMahjongRoomController({
    window, elements, settingsDialog: settings, tableController: table,
    visualRendererReady: rendererReady,
    getPlayMode: () => mode, setPlayMode: (value) => { mode = value; },
    getPlayerId: () => playerId, setPlayerId: (value) => { playerId = value; },
    getGameInitializing: () => false, getDestroyed: () => false,
    getClient: () => ({ confirm: async (message) => { calls.push("confirm"); return confirm(message); } }),
    getSession: () => ({
      cancelScheduledActions: () => calls.push("cancel"),
      confirmRoomState: () => calls.push("confirmed"), isActionInFlight: () => false,
      dispatch: async (action) => { calls.push(action); return true; },
    }),
    themeController: { setRoomPlayerIdentity() {} },
    showRoomSetup: () => { calls.push("lobby"); elements.setup.hidden = false; },
    showLoadingError: assert.fail, showMessage: assert.fail,
  });
  t.after(async () => { controller.destroy(); settings.destroy(); unmount(); await window.happyDOM.close(); });
  const state = (overrides = {}) => controller.handleState({ playerId, state: {
    phase: "playing", roomIsOwner: true, players: ["host", "guest", "a", "b"],
    turnIndex: 2, wallCount: 60, moveCount: 0, ...overrides,
  } });
  return { controller, settings, elements, table, calls, state, root,
    exit: document.querySelector("#settings-end-match-button"),
    resume: document.querySelector("#settings-return-button"),
  };
}

test("authoritative room ownership updates settings and only the host can submit lobby return", async (t) => {
  const f = fixture(t);
  f.controller.handleReady({ mode: "room", playerId: "host", player: { isOwner: true } });
  await f.state();
  assert.equal(f.exit.hidden, false);
  assert.equal(f.exit.textContent, "返回大厅");
  assert.equal(f.resume.textContent, "返回对局");
  f.settings.setOpen(true);
  assert.equal(await f.controller.returnToLobby(), true);
  assert.equal(f.root.hidden, true);
  assert.deepEqual(f.calls.filter((call) => call?.type === "return_to_lobby"), [{ type: "return_to_lobby" }]);
  await f.state({ roomIsOwner: false });
  assert.equal(f.exit.hidden, true);
  assert.equal(f.resume.textContent, "返回对局");
  assert.equal(await f.controller.returnToLobby(), false);
  assert.equal(f.calls.filter((call) => call === "confirm").length, 1);
});

test("declining lobby return preserves the active match and open settings", async (t) => {
  const f = fixture(t, { confirm: async () => false });
  await f.state();
  f.settings.setOpen(true);
  assert.equal(await f.controller.returnToLobby(), false);
  assert.equal(f.root.hidden, false);
  assert.equal(f.table.getState().phase, "playing");
  assert.equal(f.calls.some((call) => call?.type === "return_to_lobby"), false);
});

test("ownership loss during confirmation cannot submit a return action", async (t) => {
  let resolve;
  const f = fixture(t, { confirm: () => new Promise((done) => { resolve = done; }) });
  await f.state();
  const pending = f.controller.returnToLobby();
  assert.equal(await f.controller.returnToLobby(), false, "double clicks do not open another confirmation");
  await f.state({ roomIsOwner: false });
  resolve(true);
  assert.equal(await pending, false);
  assert.equal(f.calls.some((call) => call?.type === "return_to_lobby"), false);
});

test("a lobby broadcast clears the old table and shows setup for the host or waiting for guests", async (t) => {
  for (const isOwner of [true, false]) {
    const f = fixture(t);
    await f.state({ roomIsOwner: isOwner });
    f.settings.setOpen(true);
    await f.state({ phase: "lobby", roomIsOwner: isOwner });
    assert.equal(f.root.hidden, true);
    assert.equal(f.table.getState(), undefined);
    assert.equal(f.exit.hidden, true);
    assert.equal(f.elements.result.hidden, true);
    assert.equal(f.calls.includes("cancel"), true);
    assert.equal(f.calls.includes("reset"), true);
    assert.equal(f.calls.includes("lobby"), isOwner);
    assert.equal(f.elements.setup.hidden, !isOwner);
    if (!isOwner) assert.equal(f.elements.loading.hidden, false);
  }
});

test("an older room render cannot cover the lobby after waiting for the renderer", async (t) => {
  let resolve;
  const f = fixture(t, { rendererReady: new Promise((done) => { resolve = done; }) });
  const oldState = f.state();
  await f.state({ phase: "lobby" });
  resolve();
  await oldState;
  assert.equal(f.calls.includes("refresh"), false);
  assert.equal(f.elements.setup.hidden, false);
  assert.equal(f.table.getState(), undefined);
});
