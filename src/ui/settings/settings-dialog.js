import { viewFor } from "../shared/component.js";
import { getGameStorage } from "../../storage/game-storage-cache.js";
const DOUBLE_CLICK_TSUMOGIRI_KEY = "playweft.mahjong.double-click-tsumogiri";
const DOUBLE_CLICK_PASS_KEY = "playweft.mahjong.double-click-pass";
const GAME_HINTS_KEY = "playweft.mahjong.game-hints";
const AUTO_WIN_AFTER_RIICHI_KEY = "playweft.mahjong.auto-win-after-riichi";
const DISCARD_VOLUME_KEY = "playweft.mahjong.discard-volume";
const MUSIC_VOLUME_KEY = "playweft.mahjong.music-volume";
const MASTER_VOLUME_KEY = "playweft.mahjong.master-volume";
const VOICE_VOLUME_KEY = "playweft.mahjong.voice-volume";
const AVATAR_SOURCE_PREFERENCE_KEY =
  "playweft.mahjong.avatar-source-preference";
const DEFAULT_DISCARD_VOLUME = 100;
const DEFAULT_MUSIC_VOLUME = 32;
const DEFAULT_MASTER_VOLUME = 100;
const DEFAULT_VOICE_VOLUME = 100;
const DEFAULT_AVATAR_SOURCE_PREFERENCE = "auto";
const DIALOG_TRANSITION_FALLBACK_MS = 240;

export function createMahjongSettingsDialog({
  trigger,
  root,
  surface,
  tabButtons,
  getAdditionalFocusable = () => [],
  onMusicVolumeChange,
  onMasterVolumeChange,
  onVoiceVolumeChange,
  onGameHintsChange,
  onAvatarSourcePreferenceChange,
  onOfflinePolicyChange,
  onOfflineAction,
  onEndMatch,
  onOpenChange,
  onTabChange,
}) {
  const view = viewFor(root);
  const nav = viewFor(trigger.closest("nav"));
  const document = root.ownerDocument,
    window = document.defaultView;
  let returnFocus = null,
    open = false,
    openingFrame = 0,
    closingTimer = 0,
    restoreFocusAfterClose = true;
  const reduced = () =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  const values = {
    gameHints: readBooleanSetting(GAME_HINTS_KEY, true),
    autoWin: readBooleanSetting(AUTO_WIN_AFTER_RIICHI_KEY, false),
    tsumogiri: readBooleanSetting(DOUBLE_CLICK_TSUMOGIRI_KEY, false),
    pass: readBooleanSetting(DOUBLE_CLICK_PASS_KEY, false),
    master: readVolumeSetting(MASTER_VOLUME_KEY, 100),
    music: readVolumeSetting(MUSIC_VOLUME_KEY, 32),
    voice: readVolumeSetting(VOICE_VOLUME_KEY, 100),
    discard: readVolumeSetting(DISCARD_VOLUME_KEY, 100),
    avatar: readAvatarSourcePreference(),
    offline: readOfflinePolicy(),
  };
  function setTab(tab) {
    view.update({ tab });
    onTabChange?.(tab);
  }
  function clearMotionTimers() {
    if (openingFrame) window.cancelAnimationFrame(openingFrame);
    if (closingTimer) window.clearTimeout(closingTimer);
    openingFrame = closingTimer = 0;
  }
  function finishClose() {
    if (open) return;
    clearMotionTimers();
    view.update({ visible: false, open: false });
    if (restoreFocusAfterClose) returnFocus?.focus?.({ preventScroll: true });
    returnFocus = null;
  }
  function setOpen(next, { restoreFocus = true, animate = true } = {}) {
    if (next) {
      if (open) return;
      const wasHidden = !view.state.visible;
      open = true;
      clearMotionTimers();
      if (wasHidden) returnFocus = document.activeElement;
      view.update({ visible: true, open: false });
      nav.update({ settingsOpen: true });
      setTab("operation");
      onOpenChange?.(true);
      const reveal = () => {
        openingFrame = 0;
        if (open) {
          view.update({ open: true });
          surface.focus({ preventScroll: true });
        }
      };
      if (animate && !reduced() && wasHidden)
        openingFrame = window.requestAnimationFrame(reveal);
      else reveal();
    } else {
      if (!open && !view.state.visible) return;
      const wasVisible = view.state.open;
      open = false;
      onOpenChange?.(false);
      clearMotionTimers();
      restoreFocusAfterClose = restoreFocus;
      view.update({ open: false });
      nav.update({ settingsOpen: false });
      if (!animate || reduced() || !wasVisible) finishClose();
      else
        closingTimer = window.setTimeout(
          finishClose,
          DIALOG_TRANSITION_FALLBACK_MS,
        );
    }
  }
  function onKeyDown(event) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...surface.querySelectorAll(
        'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), iframe',
      ),
      ...getAdditionalFocusable(),
    ].filter((element) => !element.closest("[hidden], [inert]"));
    const first = focusable[0],
      last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  function onTabKeyDown(event) {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const current = tabButtons.indexOf(event.currentTarget);
    const next =
      tabButtons[
        (current + (event.key === "ArrowRight" ? 1 : -1) + tabButtons.length) %
          tabButtons.length
      ];
    setTab(next.dataset.settingsTab);
    next.focus();
  }
  const booleans = {
    gameHints: GAME_HINTS_KEY,
    autoWin: AUTO_WIN_AFTER_RIICHI_KEY,
    tsumogiri: DOUBLE_CLICK_TSUMOGIRI_KEY,
    pass: DOUBLE_CLICK_PASS_KEY,
  };
  const volumes = {
    master: MASTER_VOLUME_KEY,
    music: MUSIC_VOLUME_KEY,
    voice: VOICE_VOLUME_KEY,
    discard: DISCARD_VOLUME_KEY,
  };
  function onValue(key, raw) {
    let value = raw;
    if (key in booleans) {
      value = raw === true;
      writeBooleanSetting(booleans[key], value);
    } else if (key in volumes) {
      value = normalizeVolume(raw, key === "music" ? 32 : 100);
      writeVolumeSetting(volumes[key], value);
    } else if (key === "avatar") {
      value = normalizeAvatarSourcePreference(raw);
      writeAvatarSourcePreference(value);
    } else if (key === "offline") {
      value = raw === "local-first" ? "local-first" : "network-first";
      try {
        getGameStorage("mahjong").setItem(
          "playweft.mahjong.offline-cache-policy",
          value,
        );
      } catch {}
    }
    view.update({ values: { ...view.state.values, [key]: value } });
    ({
      gameHints: onGameHintsChange,
      music: onMusicVolumeChange,
      master: onMasterVolumeChange,
      voice: onVoiceVolumeChange,
      avatar: onAvatarSourcePreferenceChange,
      offline: onOfflinePolicyChange,
    })[key]?.(value);
  }
  view.update({
    values,
    onClose: () => setOpen(false),
    onTab: setTab,
    onTabKeyDown,
    onValue,
    onEndMatch,
    onOfflineAction,
  });
  nav.update({ onSettings: () => setOpen(true) });
  const transitionEnd = (event) => {
    if (!open && event.target === surface && event.propertyName === "transform")
      finishClose();
  };
  surface.addEventListener("transitionend", transitionEnd);
  document.addEventListener("keydown", onKeyDown);
  return {
    get gameHintsEnabled() {
      return view.state.values.gameHints;
    },
    get autoWinAfterRiichiEnabled() {
      return view.state.values.autoWin;
    },
    get doubleClickTsumogiriEnabled() {
      return view.state.values.tsumogiri;
    },
    get doubleClickPassEnabled() {
      return view.state.values.pass;
    },
    get discardVolumeScale() {
      return view.state.values.discard / 100;
    },
    get musicVolumeScale() {
      return view.state.values.music / 100;
    },
    get masterVolumeScale() {
      return view.state.values.master / 100;
    },
    get voiceVolumeScale() {
      return view.state.values.voice / 100;
    },
    get avatarSourcePreference() {
      return view.state.values.avatar;
    },
    setSoloMatchActive(soloActive) {
      view.update({ soloActive });
    },
    setEndMatchLabel(endLabel) {
      view.update({ endLabel });
    },
    setOpen,
    destroy() {
      open = false;
      restoreFocusAfterClose = false;
      finishClose();
      nav.update({ settingsOpen: false, onSettings: undefined });
      view.update({
        onClose: undefined,
        onTab: undefined,
        onValue: undefined,
        onEndMatch: undefined,
        onOfflineAction: undefined,
      });
      surface.removeEventListener("transitionend", transitionEnd);
      document.removeEventListener("keydown", onKeyDown);
    },
  };
}

export function normalizeAvatarSourcePreference(value) {
  return value === "theme" ? "theme" : DEFAULT_AVATAR_SOURCE_PREFERENCE;
}

function readAvatarSourcePreference() {
  try {
    return normalizeAvatarSourcePreference(
      getGameStorage("mahjong").getItem(AVATAR_SOURCE_PREFERENCE_KEY),
    );
  } catch {
    return DEFAULT_AVATAR_SOURCE_PREFERENCE;
  }
}

function readOfflinePolicy() {
  try {
    return getGameStorage("mahjong").getItem(
      "playweft.mahjong.offline-cache-policy",
    ) === "local-first"
      ? "local-first"
      : "network-first";
  } catch {
    return "network-first";
  }
}

function writeAvatarSourcePreference(value) {
  try {
    getGameStorage("mahjong").setItem(AVATAR_SOURCE_PREFERENCE_KEY, value);
  } catch {
    // Storage can be unavailable; the current select value remains active.
  }
}

export function normalizeDiscardVolume(
  value,
  fallback = DEFAULT_DISCARD_VOLUME,
) {
  return normalizeVolume(value, fallback);
}

export function normalizeMusicVolume(value, fallback = DEFAULT_MUSIC_VOLUME) {
  return normalizeVolume(value, fallback);
}

function normalizeVolume(value, fallback = DEFAULT_DISCARD_VOLUME) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function readBooleanSetting(key, fallback) {
  try {
    const value = getGameStorage("mahjong").getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

function writeBooleanSetting(key, value) {
  try {
    getGameStorage("mahjong").setItem(key, String(value));
  } catch {
    // Storage can be unavailable in sandboxed game hosts; the session value remains active.
  }
}

function readVolumeSetting(key, fallback) {
  try {
    const value = getGameStorage("mahjong").getItem(key);
    return value === null ? fallback : normalizeDiscardVolume(value, fallback);
  } catch {
    return fallback;
  }
}

function writeVolumeSetting(key, value) {
  try {
    getGameStorage("mahjong").setItem(key, String(value));
  } catch {
    // Storage can be unavailable in sandboxed game hosts; the session value remains active.
  }
}
