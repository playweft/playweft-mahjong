import { getGameStorage } from "./game-storage-cache.js";
import {
  CAREER_KEYS, CAREER_AI_VERSION, createCareer, parseCareer,
  hasPendingPlacementResult, hasPendingLeagueResult, settleCareer,
} from "../game/career/career.js";

export function createCareerStore(storage = getGameStorage("mahjong")) {
  let activeSlot = null;
  function key(slot) {
    if (!Number.isInteger(slot) || slot < 1 || slot > 3) throw new RangeError("Invalid career slot");
    return CAREER_KEYS[slot - 1];
  }
  function read(slot) { return parseCareer(storage.getItem(key(slot))); }
  function write(slot, career) {
    const next = { ...career, revision: career.revision + 1, updatedAt: Date.now() };
    storage.setItem(key(slot), JSON.stringify(next));
    return next;
  }
  return {
    read, write,
    get activeSlot() { return activeSlot; },
    activate(slot) {
      key(slot);
      let career = read(slot);
      if (!career) career = write(slot, createCareer());
      activeSlot = slot;
      return career;
    },
    deactivate() { activeSlot = null; },
    acknowledgePlacementResult() {
      if (!activeSlot) throw new Error("No active career");
      const career = read(activeSlot);
      if (hasPendingPlacementResult(career)) write(activeSlot, { ...career, placementResultSeen: true });
    },
    acknowledgeLeagueResult() {
      if (!activeSlot) throw new Error("No active career");
      const career = read(activeSlot);
      if (hasPendingLeagueResult(career)) write(activeSlot, { ...career, pendingLeagueResult: null });
    },
    persistMatch(save, state, evaluation) {
      if (!activeSlot) throw new Error("No active career");
      let career = read(activeSlot);
      if (career.currentMatch && career.currentMatch.matchId !== save.matchId)
        throw new Error("生涯对局与存档不匹配");
      if (career.analysis.matchId !== save.matchId) {
        career.analysis = { matchId: save.matchId, eligible: 0, agreed: 0, unavailable: 0, reviewed: 0, qualityTotal: 0, majorMistakes: 0, version: CAREER_AI_VERSION };
      }
      career.currentMatch = save;
      if (evaluation?.eligible) {
        career.analysis.eligible += 1;
        career.analysis.agreed += evaluation.agreed ? 1 : 0;
        if (evaluation.review) {
          career.analysis.reviewed += 1;
          career.analysis.qualityTotal += evaluation.review.quality;
          career.analysis.majorMistakes += evaluation.review.major ? 1 : 0;
        }
      } else if (evaluation?.unavailable) career.analysis.unavailable += 1;
      career = settleCareer(career, state);
      write(activeSlot, career);
      return true;
    },
    clearMatch() {
      if (!activeSlot) return;
      const career = read(activeSlot);
      write(activeSlot, { ...career, currentMatch: null });
    },
  };
}
