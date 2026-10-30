import assert from "node:assert/strict";
import test from "node:test";
import { assessDecisionEvidence } from "../src/game/career/decision-evidence.js";
import { accumulateReview, summarizeReviews, validReviewEvidence } from "../src/game/career/review-statistics.js";
import { createCareer, parseCareer, placementTier } from "../src/game/career/career.js";
import { createCareerStore } from "../src/storage/career-store.js";
import { createMahjongSoloSave } from "../src/game/replay/solo-save.js";

const candidate = (overrides = {}) => ({ action: { type: "discard", tileId: 1 }, tileKey: "1:plain",
  shanten: 1, ukeire: 12, shape: 10, value: 2, risk: 0, safe: false, score: 0, ...overrides });
function assess(selected, alternatives, context = {}, extras = {}) {
  return assessDecisionEvidence({ context: { hand: "1:1:0:1", pressure: 0, objective: "normal", ...context },
    scoreLoss: 300, evidenceCandidates: [{ ...selected, selected: true }, ...alternatives], ...extras });
}
const entry = (loss = 0, major = false, confidence = 2) => ({ loss, confidence, major, reason: "fixture" });
function record(analysis, hand, dimensions) {
  analysis.eligible++;
  const entries = Object.values(dimensions);
  accumulateReview(analysis, { quality: entries.length ? Math.round(100 - entries.reduce((sum, e) => sum + e.loss, 0) / entries.length) : 80,
    major: entries.some((e) => e.major), evidence: { hand, dimensions } });
}

test("near-equivalent shapes and obvious call passes supply no positive skill evidence", () => {
  assert.deepEqual(assess(candidate(), [candidate({ ukeire: 11 })]).dimensions, {});
  const pass = { action: { type: "pass" }, score: 0 };
  const poorCall = { action: { type: "claim", option: 1 }, shanten: 2, value: 1, yaku: false };
  assert.deepEqual(assess(pass, [poorCall], { claiming: true, shanten: 2 }).dimensions, {});
  const analysis = createCareer().analysis;
  record(analysis, "1:1:0:1", { defense: entry(80, true) });
  const before = summarizeReviews([analysis]);
  for (let i = 0; i < 100; i++) record(analysis, "1:1:0:1", {});
  assert.deepEqual(summarizeReviews([analysis]), before);
  assert.equal(analysis.reviewed, 1);
});

test("clear shanten regression is distinguished from deliberate value, shape and safety trades", () => {
  const alternative = candidate();
  const selected = candidate({ shanten: 2 });
  const evidence = assess(selected, [alternative]).dimensions.efficiency;
  assert.equal(evidence.loss, 65);
  assert.equal(evidence.major, true);
  for (const compensation of [{ value: 3 }, { shape: 12 }, { risk: 0 }]) {
    const other = compensation.risk === 0 ? candidate({ risk: 0.2 }) : alternative;
    assert.equal(assess({ ...selected, ...compensation }, [other]).dimensions.efficiency, undefined);
  }
  assert.equal(assess(selected, [alternative], { pressure: 1 }).dimensions.efficiency, undefined);
});

test("acceptance comparison has a tolerance and recognizes choosing a dead wait", () => {
  assert.equal(assess(candidate({ ukeire: 11 }), [candidate({ ukeire: 12 })]).dimensions.efficiency, undefined);
  const bad = assess(candidate({ shanten: 0, ukeire: 0 }), [candidate({ shanten: 0, ukeire: 8 })]).dimensions.efficiency;
  assert.equal(bad.loss, 100);
  assert.equal(bad.major, true);
  const good = assess(candidate({ ukeire: 12 }), [candidate({ ukeire: 6 })]).dimensions.efficiency;
  assert.equal(good.loss, 0);
});

test("major defense errors require a confirmed threat, a safe tile and weak attack", () => {
  const risky = candidate({ shanten: 2, value: 1, risk: 0.8 });
  const safe = candidate({ shanten: 3, value: 1, safe: true });
  const context = { pressure: 1.2, confirmedThreat: true };
  assert.equal(assess(risky, [safe], context).dimensions.defense.major, true);
  assert.equal(assess(safe, [risky], context).dimensions.defense.loss, 0);
  for (const overrides of [{ confirmedThreat: false }, { objective: "chase" }]) {
    assert.notEqual(assess(risky, [safe], { ...context, ...overrides }).dimensions.defense?.major, true);
  }
  assert.notEqual(assess({ ...risky, shanten: 0, value: 4 }, [safe], context).dimensions.defense?.major, true);
  assert.equal(assess(safe, [{ ...risky, shanten: 0, value: 4 }], context).dimensions.defense, undefined,
    "discarding a strong attack does not earn defensive credit merely because the selected hand becomes weak");
  assert.notEqual(assess(risky, [{ ...safe, safe: false }], context).dimensions.defense?.major, true);
});

test("call mistakes require concrete evidence and speculative kans never become major errors", () => {
  const call = { action: { type: "claim", option: 1 }, shanten: 2, value: 1, yaku: false };
  const uncertain = assess(call, [{ action: { type: "pass" } }], { claiming: true, shanten: 2, value: 1 }).dimensions.value;
  assert.equal(uncertain.major, false, "no guaranteed yaku alone cannot prove a major error");
  const bad = assess(call, [{ action: { type: "pass" } }], { claiming: true, shanten: 1, value: 1 }).dimensions.efficiency;
  assert.equal(bad.major, true);
  const kan = { ...call, uncertain: true, action: { type: "kan", kind: "ankan", tileType: 1 } };
  const evidence = assess(kan, [candidate()], { shanten: 1, pressure: 1 }).dimensions.value;
  assert.equal(evidence.loss, 25);
  assert.equal(evidence.confidence, 1);
  assert.equal(evidence.major, false);
  assert.deepEqual(assess(candidate(), [kan]).dimensions, {}, "declining a speculative kan earns no penalty or bonus");
});

test("riichi/dama disagreement is a modest uncertain loss even when policy score gap is huge", () => {
  const selected = candidate({ shanten: 0 });
  const evidence = assess(selected, [candidate({ shanten: 0, score: 1000, action: { type: "riichi", tileId: 1 } })], {},
    { riichiAvailable: true, riichiReason: "protect" }).dimensions.placement;
  assert.equal(evidence.loss, 25);
  assert.equal(evidence.confidence, 1);
  assert.equal(evidence.major, false);
});

test("fixed ability shares and neutral missing abilities prevent cross-category dilution", () => {
  const analysis = createCareer().analysis;
  for (let i = 1; i <= 4; i++) record(analysis, `1:${i}:0:1`, { defense: entry(80, true) });
  const before = summarizeReviews([analysis]);
  for (let i = 1; i <= 40; i++) record(analysis, `2:${i}:0:1`, { efficiency: entry() });
  const after = summarizeReviews([analysis]);
  assert.equal(after.dimensions.defense.quality, before.dimensions.defense.quality);
  assert.equal(after.majorRate, 1, "successful attacks cannot dilute defensive major errors");
  assert.equal(after.dimensions.value.quality, 80);
  assert.equal(after.dimensions.placement.quality, 80);
  assert.ok(after.quality < 80);
});

test("one hand cannot satisfy the sample minimum and late errors survive the evidence cap", () => {
  const analysis = createCareer().analysis;
  for (let i = 0; i < 100; i++) record(analysis, "1:1:0:1", { efficiency: entry() });
  const before = summarizeReviews([analysis]);
  assert.equal(before.reviewed, 6);
  record(analysis, "1:1:0:1", { efficiency: entry(100, true) });
  const after = summarizeReviews([analysis]);
  assert.equal(after.reviewed, 6);
  assert.ok(after.quality < before.quality);
  assert.ok(after.majorRate > 0);
});

test("new placement evidence keeps raw C2 route and bounded hidden quality correction", () => {
  const analysis = createCareer().analysis;
  for (let i = 1; i <= 12; i++) for (let j = 0; j < 5; j++) record(analysis, `1:${i}:0:1`, { efficiency: entry() });
  const results = [{ points: 90, analysis }];
  assert.equal(placementTier(results), "C2");
  for (let i = 1; i <= 4; i++) record(analysis, `2:${i}:0:1`, { defense: entry(80, true) });
  assert.equal(placementTier(results), "D1", "the defense shortfall also reduces the hidden quality correction");
  results[0].points = 120;
  assert.equal(placementTier(results), "C2");
  results[0].points = 0;
  assert.ok(["D2", "D3"].includes(placementTier(results)));
});

test("career evidence persists across reloads and rejects malformed new metrics", () => {
  const career = createCareer();
  record(career.analysis, "1:1:0:1", { defense: entry(80, true) });
  assert.deepEqual(parseCareer(JSON.stringify(career)), career);
  const original = createCareer();
  assert.deepEqual(parseCareer(JSON.stringify(original)), original, "legacy saves need no rewrite");
  for (const mutation of [
    (e) => { e.version = 2; },
    (e) => { e.hands["1:1:0:1"].dimensions.defense.majorWeight = 3; },
    (e) => { e.hands["1:1:0:1"].dimensions.defense.lossTotal = NaN; },
    (e) => { e.hands["1:1:0:1"].dimensions.invalid = { weight: 1, lossTotal: 0, majorWeight: 0 }; },
  ]) {
    const broken = structuredClone(career);
    mutation(broken.analysis.evidence);
    assert.equal(validReviewEvidence(broken.analysis.evidence), false);
    assert.throws(() => parseCareer(JSON.stringify(broken)));
  }
});

test("resuming a match preserves legacy counters while new evidence affects settlement", () => {
  const entries = new Map();
  const store = createCareerStore({ getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) });
  store.activate(1);
  const save = createMahjongSoloSave({ randomSeed: "0123456789abcdef0123456789abcdef", matchId: "evidence", matchType: "hanchan", rules: {} });
  store.persistMatch(save, null, { eligible: true, agreed: true, review: { quality: 90, major: false } });
  store.persistMatch(save, null, { eligible: true, agreed: false, review: {
    quality: 20, major: true, evidence: { hand: "1:1:0:1", dimensions: { defense: entry(80, true) } },
  } });
  const resumed = store.read(1);
  assert.equal(resumed.analysis.reviewed, 2);
  assert.equal(resumed.analysis.evidence.legacy.reviewed, 1);
  assert.equal(summarizeReviews([resumed.analysis]).majorRate, 1);
  store.persistMatch(save, { matchEnded: true, players: ["mahjong-player", "a", "b", "c"], scores: [40000, 20000, 20000, 20000] });
  assert.deepEqual(store.read(1).placement[0].analysis.evidence, resumed.analysis.evidence);
});
