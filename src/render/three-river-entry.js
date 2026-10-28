import { asArray } from "../game/rules/game-format.js";
import { SEAT_YAW } from "./three-layout.js";

export const RIVER_ENTRY_DURATION_MS = 240;
export const RIVER_CONTACT_TIME_MS = RIVER_ENTRY_DURATION_MS;
const FORWARD_DISTANCE = 1.35;
const DROP_HEIGHT = 1.1;

// Minimum-jerk segment with explicit endpoint velocities and zero endpoint
// accelerations. The animation begins during the hand's existing movement;
// its final approach also keeps a nonzero downward contact velocity.
function heldPosition(time, duration, from, to, initialVelocity, finalVelocity) {
  if (time <= 0) return from;
  if (time >= duration) return to;
  const u = time / duration;
  const distance = to - from;
  const initial = initialVelocity * duration;
  const final = finalVelocity * duration;
  const cubic = 10 * distance - 6 * initial - 4 * final;
  const quartic = -15 * distance + 8 * initial + 7 * final;
  const quintic = 6 * distance - 3 * initial - 3 * final;
  return from + initial * u + u ** 3 * (cubic + u * (quartic + u * quintic));
}

/** The same pose sampler drives rendering, geometry checks, and curve diagrams. */
export function riverEntryPose(elapsedMs) {
  const milliseconds = Math.max(0, Math.min(RIVER_ENTRY_DURATION_MS, elapsedMs));
  const seconds = milliseconds / 1000;
  const contact = RIVER_CONTACT_TIME_MS / 1000;
  const contacted = milliseconds >= RIVER_CONTACT_TIME_MS;
  const outward = contacted ? 0 : FORWARD_DISTANCE - heldPosition(
    seconds, contact, 0, FORWARD_DISTANCE, FORWARD_DISTANCE / contact * 0.45, 0,
  );
  const clearance = contacted ? 0 : DROP_HEIGHT - heldPosition(
    seconds, contact, 0, DROP_HEIGHT, DROP_HEIGHT / contact * 0.25, DROP_HEIGHT / contact * 0.65,
  );
  return {
    outward,
    clearance,
    height: clearance,
    contacted,
  };
}

export function sameRiverContext(previous, current) {
  return Boolean(previous && current &&
    ["roundWind", "handNumber", "honba", "matchId"].every((key) => previous[key] === current[key]) &&
    asArray(previous.players).length === asArray(current.players).length &&
    asArray(previous.players).every((player, index) => player === current.players[index]));
}

/** Only animate a single appended discard, including an optimistic room discard. */
export function newRiverEntryKeys(previous, current) {
  const keys = new Set();
  if (!sameRiverContext(previous, current) || previous.phase === "hand_ended") return keys;
  const moves = (Number(current.moveCount) || 0) - (Number(previous.moveCount) || 0);
  if (moves < 0 || moves > 1) return keys;
  for (const [index, player] of asArray(current.players).entries()) {
    const before = asArray(previous.discards?.[player]);
    const after = asArray(current.discards?.[player]);
    if (after.length < before.length || after.length > before.length + 1) return new Set();
    if (!before.every((tile, i) => tile.type === after[i]?.type && Boolean(tile.red) === Boolean(after[i]?.red)))
      return new Set();
    if (after.length > before.length && !after.at(-1)?.claimed)
      keys.add(`${index + 1}:${after.length - 1}`);
  }
  return keys.size === 1 ? keys : new Set();
}

/** Moves the actual retained river tile, so no static copy appears underneath. */
export class ThreeRiverEntryMotion {
  constructor(animations) {
    this.animations = animations;
    this.active = new Map();
  }

  sync(record, { key, position, animate = false }) {
    let motion = this.active.get(record);
    if (motion) {
      // Reconciliation may update jitter, feedback meshes, or the viewport
      // during flight. Keep its progress and use the latest resting transform.
      motion.target.copy(record.node.position);
      this.apply(motion);
      return;
    }
    if (!animate) return;
    motion = {
      id: `river-entry:${key}`,
      record,
      yaw: SEAT_YAW[position],
      target: record.node.position.clone(),
      contacted: false,
      contactListeners: new Set(),
      progress: 0,
    };
    this.active.set(record, motion);
    this.apply(motion);
    this.animations.play({
      id: motion.id,
      duration: RIVER_ENTRY_DURATION_MS,
      updatesShadow: true,
      update: (progress) => {
        motion.progress = progress;
        this.apply(motion);
        if (!motion.contacted && progress * RIVER_ENTRY_DURATION_MS >= RIVER_CONTACT_TIME_MS) {
          motion.contacted = true;
          for (const listener of motion.contactListeners) listener();
          motion.contactListeners.clear();
        }
      },
      complete: () => this.active.delete(record),
    });
  }

  apply({ record, target, yaw, progress }) {
    const { outward, height } = riverEntryPose(progress * RIVER_ENTRY_DURATION_MS);
    record.node.position.set(
      target.x + Math.sin(yaw) * outward,
      target.y + height,
      target.z + Math.cos(yaw) * outward,
    );
    record.tile.rotation.set(-Math.PI / 2, 0, 0);
  }

  /** Return a cancellation callback, or null if this tile already made contact. */
  onContact(record, callback) {
    const motion = this.active.get(record);
    if (!motion || motion.contacted) return null;
    motion.contactListeners.add(callback);
    return () => motion.contactListeners.delete(callback);
  }

  remove(record) {
    const motion = this.active.get(record);
    if (!motion) return;
    this.animations.cancel(motion.id);
    motion.contactListeners.clear();
    this.active.delete(record);
  }

  finishAll() {
    for (const [record, motion] of this.active) {
      this.animations.cancel(motion.id);
      motion.progress = 1;
      this.apply(motion);
      motion.contactListeners.clear();
      this.active.delete(record);
    }
  }
}
