import { mountUi } from "./helpers/ui.jsx";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Window } from "happy-dom";
import { createMahjongCareerResult } from "../src/ui/result/career-result-controller.js";
import { createCareerStore } from "../src/storage/career-store.js";
import { hasPendingLeagueResult, hasPendingPlacementResult, parseCareer } from "../src/game/career/career.js";
import { createMahjongSoloSave } from "../src/game/replay/solo-save.js";

async function fixture({ flush = async () => {}, onStartLeague = async () => {}, onReturnToLobby = async () => {}, showError = assert.fail } = {}) {
  const window = new Window();
  mountUi(window.document);
  const data = new Map();
  const store = createCareerStore({ getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) });
  store.activate(2);
  const finishMatch = (id, scores) => {
    const save = createMahjongSoloSave({ randomSeed: "0123456789abcdef0123456789abcdef", matchId: id, matchType: "hanchan", rules: {} });
    store.persistMatch(save, { matchEnded: true, players: ["mahjong-player", "a", "b", "c"], scores });
    return store.read(2);
  };
  const page = createMahjongCareerResult({ document: window.document, careerStore: store, flush, onStartLeague, onReturnToLobby, showError });
  const panel = window.document.querySelector("#career-result");
  return { window, store, page, panel, finishMatch, async close() { page.destroy(); await window.happyDOM.close(); } };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function place(f) {
  f.finishMatch("first", [41000, 24000, 19000, 16000]); f.store.clearMatch();
  f.finishMatch("second", [33000, 35000, 17000, 15000]); f.store.clearMatch();
  return f.finishMatch("third", [47000, 22000, 18000, 13000]);
}

function beginLeague(f, tier = "C3") {
  const career = place(f);
  f.store.acknowledgePlacementResult();
  f.store.clearMatch();
  f.store.write(2, { ...f.store.read(2), tier, highestTier: tier });
  return career;
}

function completePeriod(f, scores) {
  let career;
  for (let index = 0; index < 8; index++) {
    career = f.finishMatch(`league-${index + 1}`, scores);
    if (index < 7) f.store.clearMatch();
  }
  return career;
}

test("third placement reveals the persisted grade and three real results, without decision evaluation", async () => {
  const f = await fixture();
  try {
    assert.equal(f.page.show(f.finishMatch("first", [40000, 30000, 20000, 10000])), false);
    f.store.clearMatch();
    f.finishMatch("second", [33000, 35000, 17000, 15000]); f.store.clearMatch();
    const career = f.finishMatch("third", [47000, 22000, 18000, 13000]);
    assert.equal(f.page.show(career), true);
    assert.equal(f.panel.hidden, false);
    assert.equal(f.panel.querySelector("#career-result-grade").textContent, career.tier);
    assert.deepEqual([...f.panel.querySelectorAll("tbody tr")].map((row) => row.textContent), ["第一场1位40000+45.0", "第二场2位33000+18.0", "第三场1位47000+52.0"]);
    assert.equal(f.panel.querySelector("#career-result-total").textContent, "+115.0 pt");
    assert.doesNotMatch(f.panel.textContent, /决策|一致率|AI|评价|%/);
    assert.equal(f.window.document.activeElement.id, "career-result-start");
    assert.equal(hasPendingPlacementResult(f.store.read(2)), true);
  } finally { await f.close(); }
});

test("quality changes the placement grade while the result page and stored totals show only raw match points", async () => {
  for (const [quality, grade] of [[100, "D1"], [60, "D3"]]) {
    const f = await fixture();
    try {
      const matches = [
        [35000, 25000, 22000, 18000],
        [20000, 50000, 18000, 12000],
        [10000, 40000, 30000, 20000],
      ];
      let career;
      for (const [index, scores] of matches.entries()) {
        const id = `quality-${quality}-${index}`;
        const current = f.store.read(2);
        f.store.write(2, { ...current, analysis: {
          ...current.analysis, matchId: id, eligible: 20, reviewed: 20,
          qualityTotal: quality * 20, majorMistakes: quality <= 60 ? 20 : 0,
        } });
        career = f.finishMatch(id, scores);
        if (index < 2) f.store.clearMatch();
      }
      assert.equal(career.tier, grade);
      assert.equal(career.lastSettlement.total, 0);
      assert.deepEqual(career.placement.map((result) => result.points), [40, 5, -45]);
      const loaded = parseCareer(JSON.stringify(career));
      assert.equal(loaded.tier, grade);
      assert.equal(loaded.lastSettlement.total, 0);
      assert.equal(f.page.show(loaded), true);
      assert.equal(f.panel.querySelector("#career-result-grade").textContent, grade);
      assert.equal(f.panel.querySelector("#career-result-total").textContent, "0.0 pt");
      assert.deepEqual([...f.panel.querySelectorAll("tbody tr")].map((row) => row.textContent),
        ["第一场1位35000+40.0", "第二场2位20000+5.0", "第三场4位10000-45.0"]);
      assert.doesNotMatch(f.panel.textContent, /质量|修正|决策|一致率|评价/);
    } finally { await f.close(); }
  }
});

for (const [button, action] of [["start", "league"], ["back", "lobby"]]) {
  test(`${action} waits for storage, acknowledges only this slot and prevents double activation`, async () => {
    let flushed;
    const calls = [];
    const f = await fixture({ flush: () => new Promise((resolve) => { flushed = resolve; }),
      onStartLeague: async (slot) => calls.push(["league", slot]), onReturnToLobby: async (slot) => calls.push(["lobby", slot]) });
    try {
      f.page.show(place(f));
      const target = f.panel.querySelector(`#career-result-${button}`);
      target.click(); target.click();
      assert.deepEqual(calls, []);
      assert.equal(target.disabled, true);
      flushed(); await tick();
      assert.deepEqual(calls, [[action, 2]]);
      assert.equal(f.panel.hidden, true);
      assert.equal(hasPendingPlacementResult(f.store.read(2)), false);
      assert.equal(f.store.read(1), null);
    } finally { await f.close(); }
  });
}

test("storage failure keeps the result visible and allows retry before starting a league", async () => {
  let fail = true;
  const errors = [], starts = [];
  const f = await fixture({ flush: async () => { if (fail) throw new Error("offline"); }, showError: (message) => errors.push(message), onStartLeague: async (slot) => starts.push(slot) });
  try {
    f.page.show(place(f));
    const start = f.panel.querySelector("#career-result-start");
    start.click(); await tick();
    assert.deepEqual(errors, ["offline"]);
    assert.deepEqual(starts, []);
    assert.equal(f.panel.hidden, false);
    assert.equal(start.disabled, false);
    fail = false; start.click(); await tick();
    assert.deepEqual(starts, [2]);
  } finally { await f.close(); }
});

for (const [outcome, title, scores, nextTier, total] of [
  ["promoted", "昇級結果", [25000, 35000, 20000, 20000], "C2", "+80.0 pt"],
  ["relegated", "降級結果", [25000, 30000, 35000, 10000], "D1", "-80.0 pt"],
  ["retained", "残留結果", [15000, 70000, 10000, 5000], "C3", "0.0 pt"],
]) {
  test(`${outcome} displays all eight results, the settled grade and the correct period after reload`, async () => {
    const f = await fixture();
    try {
      beginLeague(f);
      for (let index = 0; index < 7; index++) {
        assert.equal(f.page.show(f.finishMatch(`league-${index + 1}`, scores)), false);
        f.store.clearMatch();
      }
      f.finishMatch("league-8", scores);
      const career = parseCareer(JSON.stringify(f.store.read(2)));
      assert.deepEqual(career.period, { number: 2, results: [] });
      assert.equal(career.pendingLeagueResult.outcome, outcome);
      assert.equal(hasPendingLeagueResult(career), true);
      assert.equal(f.page.show(career), true);
      assert.equal(f.panel.querySelector("#career-result-title").textContent, title);
      assert.equal(f.panel.querySelector("#career-result-grade").textContent, nextTier);
      assert.equal(f.panel.querySelectorAll("tbody tr").length, 8);
      assert.match(f.panel.querySelector("tbody tr:last-child").textContent, /^第八场/);
      assert.equal(f.panel.querySelector("#career-result-total").textContent, total);
      assert.equal(f.panel.querySelector("#career-result-start").textContent, "开始下一期›");
      assert.equal(f.panel.querySelector(".career-result-caption").textContent, outcome === "retained" ? "第 1 期 · C3 保级" : `第 1 期 · C3 → ${nextTier}`);
      assert.equal(f.panel.classList.contains("is-league-result"), true);
      assert.doesNotMatch(f.panel.textContent, /决策|一致率|AI|评价|%/);
      // Replaying the last accepted action cannot create another period or lose its snapshot.
      f.finishMatch("league-8", scores);
      assert.deepEqual(f.store.read(2), { ...career, revision: career.revision + 1, updatedAt: f.store.read(2).updatedAt });
    } finally { await f.close(); }
  });
}

for (const [tier, scores] of [["A1", [40000, 20000, 20000, 20000]], ["E1", [10000, 30000, 30000, 30000]]]) {
  test(`${tier} boundary displays retention instead of a nonexistent promotion or relegation`, async () => {
    const f = await fixture();
    try {
      beginLeague(f, tier);
      f.page.show(completePeriod(f, scores));
      assert.equal(f.panel.querySelector("#career-result-title").textContent, "残留結果");
      assert.equal(f.panel.querySelector("#career-result-grade").textContent, tier);
      assert.equal(f.panel.querySelector(".career-result-caption").textContent, `第 1 期 · ${tier} 保级`);
    } finally { await f.close(); }
  });
}

for (const button of ["start", "back"]) {
  test(`league ${button} confirms only the active slot after flushing and does not redisplay the result`, async () => {
    let flushed;
    const calls = [];
    const f = await fixture({ flush: () => new Promise((resolve) => { flushed = resolve; }),
      onStartLeague: async (slot) => calls.push(["start", slot]), onReturnToLobby: async (slot) => calls.push(["back", slot]) });
    try {
      beginLeague(f);
      f.page.show(completePeriod(f, [40000, 20000, 20000, 20000]));
      f.store.clearMatch();
      assert.equal(hasPendingLeagueResult(f.store.read(2)), true);
      const target = f.panel.querySelector(`#career-result-${button}`);
      target.click(); target.click();
      assert.deepEqual(calls, []);
      assert.equal(target.disabled, true);
      flushed(); await tick();
      const career = f.store.read(2);
      assert.deepEqual(calls, [[button, 2]]);
      assert.equal(f.panel.hidden, true);
      assert.equal(career.pendingLeagueResult, null);
      assert.equal(career.history.length, 1);
      assert.equal(career.highestTier, "C2");
      assert.equal(f.page.show(career), false);
      assert.equal(f.store.read(1), null);
      f.finishMatch("next-period-1", [40000, 20000, 20000, 20000]);
      assert.equal(f.store.read(2).period.results.length, 1);
      assert.equal(f.store.read(2).period.number, 2);
    } finally { await f.close(); }
  });
}

test("old slots without a league snapshot still load; malformed snapshots are rejected", async () => {
  const f = await fixture();
  try {
    beginLeague(f);
    const career = completePeriod(f, [40000, 20000, 20000, 20000]);
    const old = structuredClone(career);
    delete old.pendingLeagueResult;
    assert.equal(f.page.show(parseCareer(JSON.stringify(old))), false);
    for (const mutate of [
      (c) => c.pendingLeagueResult.results.pop(),
      (c) => c.pendingLeagueResult.total++,
      (c) => { c.pendingLeagueResult.nextTier = "A1"; },
      (c) => { c.pendingLeagueResult.outcome = "placed"; },
    ]) {
      const bad = structuredClone(career); mutate(bad);
      const raw = JSON.stringify(bad);
      assert.throws(() => parseCareer(raw));
    }
  } finally { await f.close(); }
});
