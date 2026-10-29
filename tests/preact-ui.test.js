import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";
import { mountUi } from "./helpers/ui.jsx";
import { viewFor } from "../src/ui/shared/component.js";
import { MahjongDomView } from "../src/ui/table/dom-view.js";
import { createMahjongSettingsDialog } from "../src/ui/settings/settings-dialog.js";
import { loadGameStorageCache } from "../src/storage/game-storage-cache.js";
import { createMahjongCareerResult } from "../src/ui/result/career-result-controller.js";

function fixture(t) {
  const window = new Window();
  window.matchMedia = () => ({ matches: true });
  const unmount = mountUi(window.document);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    value: window.document,
    writable: true,
    configurable: true,
  });
  t.after(async () => {
    unmount();
    if (previous) Object.defineProperty(globalThis, "document", previous);
    else delete globalThis.document;
    await window.happyDOM.close();
  });
  return { window, document: window.document };
}
function game(overrides = {}) {
  return {
    phase: "playing",
    players: ["a", "b", "c", "d"],
    playerNames: ["你", "右", "对", "左"],
    scores: [25000, 25000, 25000, 25000],
    handCounts: { a: 13, b: 13, c: 13, d: 13 },
    ownHand: [1, 5, 9],
    drawnTile: 9,
    legalActions: { canDiscard: true },
    roundWind: 1,
    handNumber: 1,
    wallCount: 68,
    turnIndex: 1,
    ...overrides,
  };
}

test("table snapshot updates retain the Three.js host and render numeric hand tiles with one action", (t) => {
  const { document } = fixture(t);
  const actions = [];
  const dom = new MahjongDomView({
    onAction: (action) => actions.push(action),
  });
  const host = document.querySelector("#mahjong-stage");
  const canvas = document.createElement("canvas");
  host.append(canvas);
  const state = game({
    legalActions: { claims: [{ kind: "pon", option: 7 }] },
  });
  dom.render(state, [], 1, "你");
  assert.equal(
    document
      .querySelector('#hand-bottom [data-tile-id="1"]')
      .getAttribute("aria-label"),
    "一万",
  );
  document.querySelector(".claim-pon").click();
  assert.deepEqual(actions, [{ type: "claim", option: 7 }]);
  dom.render({ ...state, wallCount: 67 }, [], 5, "你");
  assert.equal(document.querySelector("#mahjong-stage"), host);
  assert.equal(host.firstChild, canvas);
  assert.equal(
    document.querySelector("#hand-bottom .is-selected").dataset.tileId,
    "5",
  );
  dom.stopCountdown();
});

test("a grouped claim opens a keyboard-dismissible picker and submits the selected option once", (t) => {
  const { document, window } = fixture(t);
  const actions = [];
  const dom = new MahjongDomView({
    onAction: (action) => actions.push(action),
  });
  const state = game({
    legalActions: {
      claims: [
        { kind: "chi", option: 2, tileTypes: [1, 2, 3] },
        { kind: "chi", option: 3, tileTypes: [2, 3, 4] },
      ],
    },
  });
  dom.render(state, [], 0, "你");
  const button = document.querySelector(".claim-chi");
  button.click();
  assert.equal(button.getAttribute("aria-expanded"), "true");
  assert.equal(document.activeElement.className, "claim-choice");
  document
    .querySelector(".claim-choice-layer")
    .dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.equal(document.activeElement, button);
  button.click();
  document.querySelectorAll(".claim-choice")[1].click();
  assert.deepEqual(actions, [{ type: "claim", option: 3 }]);
  dom.stopCountdown();
});

test("spectator and in-flight snapshots cannot offer player actions", (t) => {
  const { document } = fixture(t);
  const dom = new MahjongDomView({ onAction: assert.fail });
  const state = game({
    legalActions: {
      canDiscard: true,
      canTsumo: true,
      canRiichi: true,
      claims: [{ kind: "ron", option: 1 }],
    },
  });
  for (const options of [{ readOnly: true }, { actionInFlight: true }]) {
    dom.render(state, [], 0, "你", options);
    assert.equal(document.querySelector("#claim-actions").hidden, true);
    assert.equal(document.querySelector("#tsumo-button").hidden, true);
    assert.equal(document.querySelector("#riichi-button").hidden, true);
  }
  dom.stopCountdown();
});

test("settings tabs, persisted toggles, sliders and focus are driven by the component", async (t) => {
  const { document, window } = fixture(t);
  const writes = new Map();
  await loadGameStorageCache({
    gameId: "mahjong",
    keys: [],
    backend: {
      getItem: async (key) => writes.get(key) ?? null,
      setItem: async (key, value) => writes.set(key, value),
      removeItem: async (key) => writes.delete(key),
    },
  });
  const root = document.querySelector("#settings-dialog");
  const surface = root.querySelector(".settings-dialog-card");
  const trigger = document.querySelector("#settings-button");
  const musicChanges = [];
  const settings = createMahjongSettingsDialog({
    trigger,
    root,
    surface,
    tabButtons: [...root.querySelectorAll("[data-settings-tab]")],
    onMusicVolumeChange: () => musicChanges.push(settings.musicVolumeScale),
  });
  t.after(() => settings.destroy());
  trigger.focus();
  trigger.click();
  assert.equal(root.hidden, false);
  assert.equal(document.activeElement, surface);
  document.querySelector("#settings-sound-tab").click();
  assert.equal(document.querySelector("#settings-sound-panel").hidden, false);
  const music = document.querySelector("#music-volume-setting");
  music.value = "15";
  music.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.deepEqual(musicChanges, [0.15]);
  assert.equal(
    document.querySelector("#music-volume-value").textContent,
    "15%",
  );
  document.querySelector("#settings-operation-tab").click();
  const hints = document.querySelector("#game-hints-setting");
  hints.checked = false;
  hints.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(settings.gameHintsEnabled, false);
  document.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Escape" }),
  );
  assert.equal(root.hidden, true);
  assert.equal(document.activeElement, trigger);
});

test("room settings expose lobby return only to the current host and keep resume separate", (t) => {
  const { document } = fixture(t);
  const root = document.querySelector("#settings-dialog");
  let exits = 0;
  const settings = createMahjongSettingsDialog({
    trigger: document.querySelector("#settings-button"), root,
    surface: root.querySelector(".settings-dialog-card"),
    tabButtons: [...root.querySelectorAll("[data-settings-tab]")],
    onEndMatch: () => exits++,
  });
  t.after(() => settings.destroy());
  const exit = document.querySelector("#settings-end-match-button");
  const resume = document.querySelector("#settings-return-button");
  settings.setRoomMatchActive(true, false);
  settings.setOpen(true);
  assert.equal(exit.hidden, true);
  assert.equal(resume.textContent, "返回对局");
  resume.click();
  assert.equal(root.hidden, true);
  assert.equal(exits, 0);
  settings.setRoomMatchActive(true, true);
  settings.setOpen(true);
  assert.equal(exit.hidden, false);
  assert.equal(exit.textContent, "返回大厅");
  assert.equal(resume.textContent, "返回对局");
  exit.click();
  assert.equal(exits, 1);
  settings.setRoomMatchActive(true, false);
  assert.equal(exit.hidden, true, "losing ownership updates an already open dialog");
  settings.setRoomMatchActive(false, true);
  assert.equal(exit.hidden, true);
  assert.equal(resume.textContent, "返回大厅");
  settings.setSoloMatchActive(true);
  settings.setEndMatchLabel("暂时离开");
  assert.equal(exit.hidden, false);
  assert.equal(exit.textContent, "暂时离开");
  assert.equal(resume.textContent, "返回对局");
});

test("a match summary renders rows while portrait loads cannot replace a newer selection", (t) => {
  const { document, window } = fixture(t);
  const dom = new MahjongDomView({});
  dom.render(
    game({ phase: "hand_ended", draw: true, results: [] }),
    [],
    0,
    "你",
  );
  dom.setMatchSummary({
    visible: true,
    rows: [{ seat: 1, rank: 1, name: "你", score: 36000 }],
    portraitSource: "one.png",
  });
  const summary = document.querySelector("#match-summary");
  assert.equal(summary.hidden, false);
  assert.deepEqual(
    [...summary.querySelectorAll("td")].map((cell) => cell.textContent),
    ["1位", "你", "36000"],
  );
  dom.setMatchSummary({ portraitSource: "two.png" });
  const image = document.querySelector("#match-summary-photo-image");
  image.dispatchEvent(new window.Event("load"));
  assert.equal(image.dataset.source, "two.png");
  assert.equal(image.hidden, false);
  dom.stopCountdown();
});
