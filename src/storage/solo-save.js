import { getGameStorage } from "./game-storage-cache.js";
import { normalizeMahjongSoloSave } from "../game/replay/solo-save.js";
export const MAHJONG_SOLO_SAVE_KEY = "playweft.mahjong.solo-save.v1";
export function readMahjongSoloSave(storage = getGameStorage("mahjong")) {
  if (!storage) return null;
  try {
    return normalizeMahjongSoloSave(JSON.parse(storage.getItem(MAHJONG_SOLO_SAVE_KEY)));
  } catch {
    return null;
  }
}

export function writeMahjongSoloSave(save, storage = getGameStorage("mahjong")) {
  const normalized = normalizeMahjongSoloSave(save);
  if (!storage || !normalized) return false;
  try {
    storage.setItem(
      MAHJONG_SOLO_SAVE_KEY,
      JSON.stringify({
        ...normalized,
        savedAt: Date.now(),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearMahjongSoloSave(storage = getGameStorage("mahjong")) {
  if (!storage) return;
  try {
    storage.removeItem(MAHJONG_SOLO_SAVE_KEY);
  } catch {
    // Private-mode and storage-quota failures should not prevent play.
  }
}
