import assert from "node:assert/strict";
import test from "node:test";
import { Group, Vector3 } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ThreeAnimationController } from "../src/render/three-animation-controller.js";
import { ThreeKeyedSceneLayer } from "../src/render/three-keyed-scene-layer.js";
import { riverTransform, SEAT_YAW, TILE_SIZE } from "../src/render/three-layout.js";
import { TILE_EDGE_RADIUS, TILE_EDGE_SEGMENTS } from "../src/render/three-tile-factory.js";
import {
  newRiverEntryKeys,
  RIVER_ENTRY_DURATION_MS,
  RIVER_CONTACT_TIME_MS,
  riverEntryPose,
  sameRiverContext,
  ThreeRiverEntryMotion,
} from "../src/render/three-river-entry.js";
import { mahjongPresentationSeat } from "../src/game/rules/seat-order.js";
import { applyMahjongPendingDiscard, createMahjongPendingDiscard } from "../src/ui/table/pending-discard.js";

const players = ["east", "south", "west", "north"];
function state(overrides = {}) {
  return {
    players, roundWind: 1, handNumber: 1, honba: 0, moveCount: 5,
    phase: "playing", discards: Object.fromEntries(players.map((id) => [id, []])),
    ...overrides,
  };
}

function motionFixture() {
  let now = 0, frame = null, nextFrame = 0;
  const shadows = [];
  const animations = new ThreeAnimationController((updatesShadow) => shadows.push(updatesShadow), {
    now: () => now,
    requestFrame(callback) { frame = callback; return ++nextFrame; },
    cancelFrame() { frame = null; },
  });
  return {
    animations, shadows,
    motion: new ThreeRiverEntryMotion(animations),
    advance(time) {
      now = time;
      const callback = frame;
      frame = null;
      assert.ok(callback, "an animation frame should be scheduled");
      callback(time);
    },
    hasFrame: () => Boolean(frame),
  };
}

function recordAt(position, { riichi = false, index = 4 } = {}) {
  const target = riverTransform(position, index, riichi);
  const node = new Group();
  node.position.set(target.x, target.y, target.z);
  node.rotation.y = target.yaw;
  const tile = new Group();
  tile.rotation.x = -Math.PI / 2;
  node.add(tile);
  return { node, tile };
}

test("only a single new discard animates; loading, duplicate snapshots, new hands and replay jumps stay static", () => {
  const previous = state();
  const current = state({ moveCount: 6, discards: { ...previous.discards, south: [{ type: 3 }] } });
  assert.deepEqual([...newRiverEntryKeys(previous, current)], ["2:0"]);
  assert.equal(newRiverEntryKeys(null, current).size, 0);
  assert.equal(newRiverEntryKeys(current, current).size, 0);
  assert.equal(newRiverEntryKeys(previous, { ...current, handNumber: 2 }).size, 0);
  assert.equal(newRiverEntryKeys(previous, { ...current, honba: 1 }).size, 0);
  assert.equal(newRiverEntryKeys(previous, { ...current, moveCount: 20 }).size, 0);
  assert.equal(newRiverEntryKeys(current, previous).size, 0);
  assert.equal(newRiverEntryKeys(previous, { ...current, discards: { south: [{ type: 3 }, { type: 4 }] } }).size, 0);
  assert.equal(newRiverEntryKeys(previous, { ...current, discards: { south: [{ type: 3, claimed: true }] } }).size, 0);
  assert.equal(sameRiverContext(previous, { ...current, players: [...players].reverse() }), false);
  const changedHistory = state({ discards: { east: [{ type: 7 }] } });
  assert.equal(newRiverEntryKeys(changedHistory, state({ discards: { east: [{ type: 8 }, { type: 9 }] } })).size, 0);
});

test("optimistic room discards animate once and confirmation does not add a second flight", () => {
  const previous = state({ viewerSeat: 3, ownHand: [11, 21], drawnTile: 17, legalActions: { canDiscard: true } });
  const pending = createMahjongPendingDiscard(previous, { type: "riichi", tileId: 11 });
  const optimistic = applyMahjongPendingDiscard(previous, pending);
  assert.deepEqual([...newRiverEntryKeys(previous, optimistic)], ["3:0"]);
  const confirmed = { ...optimistic, moveCount: previous.moveCount + 1 };
  assert.equal(newRiverEntryKeys(optimistic, confirmed).size, 0);
  assert.equal(newRiverEntryKeys(optimistic, previous).size, 0, "a rejected discard rolls back without another flight");
});

test("every seat places forward and down, including sideways riichi tiles and rotated viewers", () => {
  for (let viewer = 1; viewer <= 4; viewer++) {
    for (let seat = 1; seat <= 4; seat++) {
      const position = ["bottom", "right", "top", "left"][mahjongPresentationSeat(seat, viewer) - 1];
      const f = motionFixture();
      const record = recordAt(position, { riichi: true });
      const resting = record.node.position.clone();
      const yaw = record.node.rotation.y;
      const outward = new Vector3(Math.sin(SEAT_YAW[position]), 0, Math.cos(SEAT_YAW[position]));
      f.motion.sync(record, { key: `${seat}:0`, position, animate: true });
      const start = record.node.position.clone();
      assert.ok(start.clone().sub(resting).dot(outward) > 1);
      assert.ok(start.y > resting.y + 1);
      assert.equal(record.node.rotation.y, yaw, "riichi orientation stays sideways");
      assert.equal(record.node.children.length, 1, "there is no duplicate static tile");
      f.advance(RIVER_ENTRY_DURATION_MS / 2);
      const middle = record.node.position.clone();
      assert.ok(middle.clone().sub(start).dot(outward) < 0, "the tile moves toward the player's front");
      assert.ok(middle.y < start.y && middle.y > resting.y);
      f.advance(RIVER_ENTRY_DURATION_MS);
      assert.ok(record.node.position.distanceTo(resting) < 1e-12);
      assert.ok(Math.abs(record.tile.rotation.x + Math.PI / 2) < 1e-12);
      assert.deepEqual(f.shadows, [true, true]);
      assert.equal(f.motion.active.size, 0);
      assert.equal(f.hasFrame(), false);
    }
  }
});

test("the held tile slows its descent but preserves nonzero speed until contact", () => {
  const samples = Array.from({ length: RIVER_ENTRY_DURATION_MS + 1 }, (_, ms) => riverEntryPose(ms));
  const drops = samples.slice(1).map((pose, i) => samples[i].clearance - pose.clearance);
  assert.ok(drops[0] > 0, "the cropped movement can already be underway");
  const peak = Math.max(...drops);
  const peakTime = drops.indexOf(peak);
  assert.ok(peakTime > 60 && peakTime < 180);
  assert.ok(drops[RIVER_CONTACT_TIME_MS - 1] > peak * 0.3, "the approaching edge still has downward velocity at impact");
  assert.ok(drops[RIVER_CONTACT_TIME_MS - 1] < peak * 0.6, "the hand brakes the descent after its peak");
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i].clearance >= 0);
    assert.ok(samples[i].clearance <= samples[i - 1].clearance);
    assert.ok(samples[i].outward >= 0 && samples[i].outward <= samples[i - 1].outward);
  }
  const contact = samples[RIVER_CONTACT_TIME_MS];
  assert.equal(contact.clearance, 0);
  assert.equal(contact.height, 0);
  for (const pose of samples.slice(RIVER_CONTACT_TIME_MS)) assert.equal(pose.clearance, 0);
  assert.deepEqual(samples.at(-1), { outward: 0, clearance: 0, height: 0, contacted: true });
});

test("the tile stays flat and above the felt, including sideways riichi tiles", () => {
  const geometry = new RoundedBoxGeometry(TILE_SIZE.width, TILE_SIZE.height, TILE_SIZE.depth, TILE_EDGE_SEGMENTS, TILE_EDGE_RADIUS);
  const points = geometry.attributes.position;
  for (const position of ["bottom", "right", "top", "left"]) {
    for (const riichi of [false, true]) {
      const f = motionFixture();
      const record = recordAt(position, { riichi });
      record.node.rotation.y += 0.025;
      const table = record.node.position.y - TILE_SIZE.depth / 2;
      f.motion.sync(record, { key: `${position}:${riichi}`, position, animate: true });
      for (const ms of [0, 60, 120, 199, 200, 220, 240]) {
        if (ms) f.advance(ms);
        let lowest = Infinity;
        for (let i = 0; i < points.count; i++) {
          const point = new Vector3().fromBufferAttribute(points, i).applyQuaternion(record.tile.quaternion);
          lowest = Math.min(lowest, point.y + record.node.position.y);
        }
        assert.ok(lowest >= table - 1e-6, "the rounded body never penetrates the felt");
        if (ms >= RIVER_CONTACT_TIME_MS) assert.ok(lowest < table + 0.002, "the face-down surface reaches the felt at contact");
        const normal = new Vector3(0, 0, 1).applyQuaternion(record.tile.quaternion).applyQuaternion(record.node.quaternion);
        assert.ok(normal.distanceTo(new Vector3(0, 1, 0)) < 1e-12, "the printed face stays fully readable throughout the movement");
      }
    }
  }
  geometry.dispose();
});

test("contact listeners fire once on first contact, including skipped frames, and are cancelled on removal or seek", () => {
  for (const firstFrame of [RIVER_CONTACT_TIME_MS, RIVER_ENTRY_DURATION_MS + 80]) {
    const f = motionFixture();
    const record = recordAt("bottom");
    let calls = 0;
    f.motion.sync(record, { key: "1:4", position: "bottom", animate: true });
    f.motion.onContact(record, () => calls++);
    const cancel = f.motion.onContact(record, () => { throw new Error("cancelled listener"); });
    cancel();
    f.advance(RIVER_CONTACT_TIME_MS - 1);
    assert.equal(calls, 0, "no contact sound may play before the tile reaches the felt");
    f.advance(firstFrame);
    assert.equal(calls, 1);
    assert.equal(f.motion.onContact(record, () => calls++), null);
    if (firstFrame < RIVER_ENTRY_DURATION_MS) f.advance(RIVER_ENTRY_DURATION_MS);
    assert.equal(calls, 1);
  }
  for (const operation of ["remove", "finishAll"]) {
    const f = motionFixture();
    const record = recordAt("bottom");
    f.motion.sync(record, { key: "1:4", position: "bottom", animate: true });
    f.motion.onContact(record, () => { throw new Error("stale contact callback"); });
    f.motion[operation](record);
    assert.equal(f.hasFrame(), false);
  }
});

test("snapshot reconciliation preserves a flight through mesh feedback changes and claimed tile removal cancels it", () => {
  const f = motionFixture();
  const layer = new ThreeKeyedSceneLayer(new Group());
  const resting = recordAt("bottom").node.position.clone();
  const reconcile = (entries) => layer.reconcile(entries, {
    keyOf: (entry) => entry.key,
    create: () => recordAt("bottom"),
    update(record, entry, { created }) {
      record.node.position.copy(resting);
      if (entry.replaceTile) {
        record.node.remove(record.tile);
        record.tile = new Group();
        record.node.add(record.tile);
      }
      f.motion.sync(record, { ...entry, position: "bottom", animate: created });
    },
    remove: (record) => f.motion.remove(record),
  });
  reconcile([{ key: "1:4" }]);
  const record = layer.records.get("1:4");
  f.advance(RIVER_ENTRY_DURATION_MS / 2);
  const midFlight = record.node.position.clone();
  reconcile([{ key: "1:4", replaceTile: true }]);
  assert.ok(record.node.position.distanceTo(midFlight) < 1e-12);
  assert.equal(record.tile.rotation.x, -Math.PI / 2);
  assert.equal(f.animations.tracks.size, 1);
  reconcile([]);
  assert.equal(f.motion.active.size, 0);
  assert.equal(f.animations.tracks.size, 0);
  assert.equal(f.hasFrame(), false);
  assert.equal(record.node.parent, null);
});

test("a replay seek or renderer reset can settle every in-flight tile immediately", () => {
  const f = motionFixture();
  const record = recordAt("left");
  const resting = record.node.position.clone();
  f.motion.sync(record, { key: "4:3", position: "left", animate: true });
  f.motion.finishAll();
  assert.ok(record.node.position.distanceTo(resting) < 1e-12);
  assert.equal(f.motion.active.size, 0);
  assert.equal(f.animations.tracks.size, 0);
  assert.equal(f.hasFrame(), false);
});
