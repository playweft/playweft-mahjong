import { getGameStorage } from "./game-storage-cache.js";

export const MAHJONG_THEME_PREFERENCES_KEY = "playweft.mahjong.theme-preferences.v1";
export const DEFAULT_THEME_ID = "__default__";

export function parseMahjongThemePreferences(raw) {
  if (raw === null) {
    return { version: 1, selectedPackId: DEFAULT_THEME_ID, appearances: {} };
  }
  const value = JSON.parse(raw);
  if (
    value?.version !== 1 ||
    typeof value.selectedPackId !== "string" || !value.selectedPackId ||
    !value.appearances || typeof value.appearances !== "object" ||
    Array.isArray(value.appearances)
  ) {
    throw new Error("Invalid Mahjong theme preferences");
  }
  return value;
}

export function readMahjongThemePreferences() {
  return parseMahjongThemePreferences(
    getGameStorage("mahjong")?.getItem(MAHJONG_THEME_PREFERENCES_KEY) ?? null,
  );
}

export function getMahjongThemeAppearance(id) {
  const { appearances } = readMahjongThemePreferences();
  return Object.hasOwn(appearances, id) ? appearances[id] : undefined;
}

export function selectMahjongTheme(id) {
  return updatePreferences((current) => ({ ...current, selectedPackId: id }));
}

export function saveMahjongThemeAppearance(id, appearance, { select = false } = {}) {
  return updatePreferences((current) => ({
    ...current,
    selectedPackId: select ? id : current.selectedPackId,
    appearances: { ...current.appearances, [id]: appearance },
  }));
}

export function removeMahjongThemePreferences(id) {
  return updatePreferences((current) => {
    const appearances = { ...current.appearances };
    delete appearances[id];
    return {
      ...current,
      selectedPackId: current.selectedPackId === id ? DEFAULT_THEME_ID : current.selectedPackId,
      appearances,
    };
  });
}

async function updatePreferences(update) {
  const storage = getGameStorage("mahjong");
  if (!storage) throw new Error("Mahjong storage is not initialized");
  const next = update(readMahjongThemePreferences());
  storage.setItem(MAHJONG_THEME_PREFERENCES_KEY, JSON.stringify(next));
  await storage.flush();
}
