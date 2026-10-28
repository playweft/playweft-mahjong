import { initializeGameStorage } from "../ui/shared/game-storage-ui.js";
import {
  MAHJONG_SOLO_SAVE_KEY,
  readMahjongSoloSave,
} from "./solo-save.js";

import { CAREER_KEYS, parseCareer } from "../game/career/career.js";
import { MAHJONG_THEME_PREFERENCES_KEY, parseMahjongThemePreferences } from "./theme-preferences.js";

export const MAHJONG_STORAGE_KEYS = [
  ...CAREER_KEYS,
  MAHJONG_SOLO_SAVE_KEY,
  "playweft.mahjong.double-click-tsumogiri",
  "playweft.mahjong.double-click-pass",
  "playweft.mahjong.game-hints",
  "playweft.mahjong.auto-win-after-riichi",
  "playweft.mahjong.discard-volume",
  "playweft.mahjong.music-volume",
  "playweft.mahjong.master-volume",
  "playweft.mahjong.voice-volume",
  "playweft.mahjong.avatar-source-preference",
  "playweft.mahjong.default-character.v1",
  MAHJONG_THEME_PREFERENCES_KEY,
  "playweft.mahjong.offline-cache-mode",
  "playweft.mahjong.offline-cache-policy",
  "playweft.mahjong.offline-cache-version",
];

export function initializeMahjongStorage(bridge) {
  return initializeGameStorage(bridge, {
    gameId: "mahjong",
    keys: MAHJONG_STORAGE_KEYS,
    legacyKeys: MAHJONG_STORAGE_KEYS.filter((key) => key !== MAHJONG_THEME_PREFERENCES_KEY),
    validate(key, raw) {
      if (key === MAHJONG_THEME_PREFERENCES_KEY) { parseMahjongThemePreferences(raw); return; }
      if (CAREER_KEYS.includes(key)) { parseCareer(raw); return; }
      if (key !== MAHJONG_SOLO_SAVE_KEY || raw === null) return;
      if (!readMahjongSoloSave({ getItem: () => raw }))
        throw Object.assign(
          new Error(
            "The saved Mahjong match is malformed or uses an unsupported format. The original data has been preserved.",
          ),
          { code: "INVALID_MAHJONG_SAVE" },
        );
    },
  });
}
