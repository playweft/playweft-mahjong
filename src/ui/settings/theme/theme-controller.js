import { viewFor } from "../../shared/component.js";
import {
  activateMahjongAssetPack,
  configureMahjongAssetPackAppearance,
  configureMahjongDefaultPackAppearance,
  clearMahjongMatchPortraitRequest,
  createMahjongAssetPack,
  deactivateMahjongAssetPacks,
  deleteMahjongAssetPack,
  getMahjongAssetFallbackColor,
  getMahjongAssetUrl,
  getMahjongDefaultAssetUrl,
  getMahjongActivePortraits,
  getMahjongConfiguredAssetPacks,
  getMahjongDefaultNames,
  getMahjongDefaultPack,
  getMahjongMatchMusicCopyright,
  getMahjongMatchMusicUrl,
  getMahjongOnlineAiPortraitAssignments,
  getMahjongOnlinePortraitContext,
  getMahjongRiichiMusicUrl,
  initializeMahjongAssetPacks,
  applyMahjongMatchPortraits,
  listMahjongAssetPacks,
  rerollMahjongAssetPackPortraits,
  resolveMahjongOnlineCharacterVoice,
  resolveMahjongOnlinePortrait,
} from "../../../storage/asset-packs.js";
import {
  renderThemePacks as renderPackOptions,
  renderAppearanceCards,
  renderSoundOptions,
  unmountThemeControls,
} from "./ThemeControls.jsx";
import { getOrCreateMahjongDefaultCharacter } from "./default-character.js";
import {
  getMahjongBuiltinCharacterForKey,
  getMahjongBuiltinCharacterForPortraitSlot,
  getMahjongBuiltinCharacterName,
} from "./builtin-characters.js";
import { chooseMahjongPortraitSource } from "../../table/player-presentation-resolver.js";
import { mahjongPlayerPortraitSlots } from "../../../game/rules/seat-order.js";

const DEFAULT_VISUAL_PACK_ID = "__default__";

/**
 * Owns asset-pack persistence, settings UI, and applying visual assets to the
 * renderers. It deliberately does not own a Mahjong game or its projection.
 */
export function createMahjongThemeController({
  document = window.document,
  window: browserWindow = window,
  isStandalone,
  confirm,
  themeElements,
  appearanceElements,
  soundElements = {
    controls: {
      addEventListener() {},
      removeEventListener() {},
      replaceChildren() {},
    },
  },
  copyrightElement,
  waitForRenderers,
  setRendererAppearance,
  setPlayerIdentityState,
  getAvatarSourcePreference,
  initialMatchPortraitRequest,
  onAssetsChanged,
  isRoomActive,
} = {}) {
  let visualPacks = [];
  let platformAvatarSource = "";
  let roomPlayerIdentity = "anonymous";
  let playerPortraitSlotsById = new Map();
  let playerPresentationBindings = new Map();
  let defaultCharacter;
  const playerPresentationSubscribers = new Set();
  const assetPacksReady = initializeMahjongAssetPacks(
    initialMatchPortraitRequest,
  ).catch(() => new Map());

  const importThemeArchive = async (archive) => {
    if (!archive) return;
    try {
      visualPacks = await createMahjongAssetPack(archive);
      renderThemePacks();
    } catch (error) {
      console.error("Mahjong theme import failed", error);
    }
  };

  const onUploadChange = () => {
    const archive = themeElements.upload.files?.[0];
    themeElements.upload.value = "";
    void importThemeArchive(archive);
  };

  const onUploadDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    themeElements.uploadZone?.classList.add("is-drag-over");
  };

  const onUploadDragLeave = (event) => {
    if (!themeElements.uploadZone?.contains(event.relatedTarget)) {
      themeElements.uploadZone?.classList.remove("is-drag-over");
    }
  };

  const onUploadDrop = (event) => {
    event.preventDefault();
    themeElements.uploadZone?.classList.remove("is-drag-over");
    void importThemeArchive(event.dataTransfer.files?.[0]);
  };

  const onThemeListClick = async (event) => {
    const button = event.target.closest("button");
    const item = event.target.closest("li[data-pack-id]");
    const id = button?.dataset.packId || item?.dataset.packId;
    const action = button?.dataset.packAction || (item ? "activate" : "");
    const packUrl = button?.dataset.packUrl;
    if (!action) return;
    if (action === "download") {
      if (!packUrl) return;
      const configuredPack = getMahjongConfiguredAssetPacks().find(
        (pack) => pack.url === packUrl,
      );
      if (!configuredPack) return;
      try {
        const response = await fetch(configuredPack.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const archive = {
          name: `${configuredPack.name}.zip`,
          size: blob.size,
          arrayBuffer: () => blob.arrayBuffer(),
        };
        visualPacks = await createMahjongAssetPack(archive, {
          sourceUrl: configuredPack.url,
        });
        renderThemePacks();
      } catch (error) {
        console.error("Mahjong theme download failed", error);
      }
      return;
    }
    if (!id) return;
    if (action === "delete") {
      const message = "删除这个麻将主题包？此操作无法恢复。";
      const confirmed = isStandalone
        ? browserWindow.confirm(message)
        : await confirm?.(message);
      if (!confirmed) return;
    }
    try {
      visualPacks =
        action === "delete"
          ? await deleteMahjongAssetPack(id)
          : id === DEFAULT_VISUAL_PACK_ID
            ? await deactivateMahjongAssetPacks()
            : await activateMahjongAssetPack(id);
      renderThemePacks();
    } catch (error) {
      console.error("Mahjong theme action failed", error);
    }
  };

  const onThemeListKeydown = (event) => {
    if (event.target.closest("button")) return;
    const item = event.target.closest("li[data-pack-id]");
    if (!item || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    void onThemeListClick({ target: item });
  };

  const onAppearanceChange = async (event) => {
    const select = event.target.closest("select[data-appearance-key]");
    const activePack = getActiveVisualPack();
    if (!select || !activePack) return;
    const appearance = structuredClone(activePack.appearance);
    const key = select.dataset.appearanceKey;
    if (key === "portrait:self") {
      appearance.portraits.self = select.value;
    } else if (key === "voice") {
      appearance.voice = select.value === "on";
    } else {
      appearance[key] = select.value;
    }
    try {
      if (activePack.isDefault) {
        configureMahjongDefaultPackAppearance(appearance);
      } else {
        visualPacks = await configureMahjongAssetPackAppearance(
          activePack.id,
          appearance,
        );
      }
      renderThemePacks();
    } catch (error) {
      console.error("Mahjong appearance configuration failed", error);
    }
  };

  const onAssetPackChanged = () => {
    void (async () => {
      await applyVisualPack();
      syncDefaultMusicCopyright();
      await applyPackAvatars();
      onAssetsChanged?.();
    })();
  };

  themeElements.upload.addEventListener("change", onUploadChange);
  themeElements.uploadZone?.addEventListener("dragover", onUploadDragOver);
  themeElements.uploadZone?.addEventListener("dragleave", onUploadDragLeave);
  themeElements.uploadZone?.addEventListener("drop", onUploadDrop);
  themeElements.list.addEventListener("click", onThemeListClick);
  themeElements.list.addEventListener("keydown", onThemeListKeydown);
  appearanceElements.controls.addEventListener("change", onAppearanceChange);
  soundElements.controls.addEventListener("change", onAppearanceChange);
  browserWindow.addEventListener(
    "mahjong:asset-pack-changed",
    onAssetPackChanged,
  );
  void assetPacksReady.then(() => {
    ensureDefaultCharacter();
    void applyPackAvatars();
    onAssetsChanged?.();
  });

  async function refreshThemePacks() {
    try {
      await assetPacksReady;
      visualPacks = await listMahjongAssetPacks();
    } catch {
      visualPacks = [];
    }
    renderThemePacks();
  }

  async function applyVisualPack() {
    await waitForRenderers?.();
    await setRendererAppearance?.({
      tablecloth: getMahjongAssetUrl("tablecloth"),
      tableclothFallbackColor: getMahjongAssetFallbackColor("tablecloth"),
      tileBack: getMahjongAssetUrl("tile-back"),
    });
  }

  async function rerollPortraits(randomSeed) {
    return rerollMahjongAssetPackPortraits(randomSeed);
  }

  async function applyMatchPortraits(savedPortraits, randomSeed) {
    return applyMahjongMatchPortraits(savedPortraits, randomSeed);
  }

  async function clearMatchPortraits() {
    return clearMahjongMatchPortraitRequest();
  }

  function setPlatformAvatar(source) {
    platformAvatarSource = typeof source === "string" ? source : "";
    return applyPackAvatars();
  }

  function avatarSourcePreference() {
    return getAvatarSourcePreference?.() === "theme" ? "theme" : "auto";
  }

  function platformAvatarAllowed() {
    return avatarSourcePreference() === "auto" && Boolean(platformAvatarSource);
  }

  function setRoomPlayerIdentity(identity) {
    roomPlayerIdentity = String(identity || "anonymous");
    return ensureDefaultCharacter();
  }

  function ensureDefaultCharacter() {
    if (defaultCharacter) return { ...defaultCharacter };
    defaultCharacter = getOrCreateMahjongDefaultCharacter();
    return defaultCharacter ? { ...defaultCharacter } : null;
  }

  function getRoomPlayerPresentation() {
    const builtin = ensureDefaultCharacter();
    const activePortraits = getMahjongActivePortraits();
    const theme = getMahjongOnlinePortraitContext();
    const characterId = String(activePortraits.self || "");
    const hasThemeCharacter =
      characterId && theme.catalog.some((entry) => entry.id === characterId);
    return {
      avatarPreference: avatarSourcePreference(),
      portraitMode: platformAvatarAllowed() ? "platform" : "character",
      ...(hasThemeCharacter
        ? {
            themeCharacter: {
              packId: theme.packId,
              characterId,
            },
          }
        : {}),
      ...(builtin?.characterId
        ? { builtinCharacterId: builtin.characterId }
        : {}),
    };
  }

  function getDefaultCharacter() {
    return ensureDefaultCharacter();
  }

  function getOnlineAiCharacterAssignments(playerIds, randomSeed = "") {
    const portraits = getMahjongOnlineAiPortraitAssignments(
      playerIds,
      randomSeed,
    );
    return Object.fromEntries(
      (Array.isArray(playerIds) ? playerIds : []).map((playerId) => {
        const portrait = portraits[playerId];
        const builtinCharacterId = getMahjongBuiltinCharacterForKey(
          `${randomSeed}:${playerId}`,
        );
        const themeCharacter = portrait?.portraitId
          ? activePortraitCatalog.find(
              (entry) => entry.id === portrait.portraitId,
            )
          : undefined;
        return [
          playerId,
          {
            ...(portrait?.packId && portrait?.portraitId
              ? {
                  themeCharacter: {
                    packId: portrait.packId,
                    characterId: portrait.portraitId,
                  },
                }
              : {}),
            builtinCharacterId,
            displayName:
              themeCharacter?.label ||
              getMahjongBuiltinCharacterName(builtinCharacterId) ||
              String(playerId),
          },
        ];
      }),
    );
  }

  function resolveCharacterPortrait(reference) {
    return resolveMahjongOnlinePortrait({
      packId: reference?.packId,
      portraitId: reference?.characterId,
    });
  }

  function resolveCharacterVoice(reference, cue) {
    return resolveMahjongOnlineCharacterVoice(reference, cue);
  }

  function applyPackAvatars() {
    if (isRoomActive?.()) return false;
    const portraitSlotByPosition = {
      bottom: "self",
      right: "right",
      top: "opposite",
      left: "left",
    };
    const defaultNames = getMahjongDefaultNames();
    const portraits = {};
    const fallbackPortraits = {};
    const builtinCharacters = {};
    const names = {};
    for (const [position, portraitSlot] of Object.entries(
      portraitSlotByPosition,
    )) {
      const selected = chooseMahjongPortraitSource({
        themeSource: getMahjongAssetUrl(`portrait-${portraitSlot}`),
        platformSource:
          position === "bottom" && platformAvatarAllowed()
            ? platformAvatarSource
            : "",
        avatarPreference: avatarSourcePreference(),
      });
      portraits[position] = selected.source;
      fallbackPortraits[position] = selected.fallbackSource;
      builtinCharacters[position] =
        getMahjongBuiltinCharacterForPortraitSlot(portraitSlot);
      if (position !== "bottom")
        names[position] = defaultNames[portraitSlot] || "";
    }
    const applied = setPlayerIdentityState?.({
      portraits,
      fallbackPortraits,
      builtinCharacters,
      names,
    });
    refreshPlayerPresentationBindings();
    for (const listener of playerPresentationSubscribers) listener();
    return applied;
  }

  function getPlayerPresentation({ playerId } = {}) {
    const value = playerPresentationBindings.get(String(playerId || ""));
    return value ? { ...value } : undefined;
  }

  function getPaipuPlayerPresentations(players = [], viewerPlayerId = "") {
    const ids = Array.isArray(players) ? players : [];
    const portraits = getMahjongActivePortraits();
    const context = getMahjongOnlinePortraitContext();
    playerPortraitSlotsById = mahjongPlayerPortraitSlots(ids, viewerPlayerId);
    refreshPlayerPresentationBindings();
    return Object.fromEntries(
      ids
        .map((player, index) => {
          const playerId = String(
            typeof player === "object" ? player?.id || "" : player || "",
          );
          const portraitSlot = playerPortraitSlotsById.get(playerId) || "";
          const characterId = String(portraits[portraitSlot] || "");
          const selected = chooseMahjongPortraitSource({
            themeSource: getMahjongAssetUrl(`portrait-${portraitSlot}`),
            platformSource:
              portraitSlot === "self" && platformAvatarAllowed()
                ? platformAvatarSource
                : "",
            avatarPreference: avatarSourcePreference(),
          });
          return [
            playerId,
            {
              source: selected.source,
              ...(selected.fallbackSource
                ? { fallbackSource: selected.fallbackSource }
                : {}),
              ...(characterId
                ? { themeCharacter: { packId: context.packId, characterId } }
                : {}),
              builtinCharacterId:
                getMahjongBuiltinCharacterForPortraitSlot(portraitSlot),
              avatarPreference: avatarSourcePreference(),
            },
          ];
        })
        .filter(([playerId]) => playerId),
    );
  }

  function refreshPlayerPresentationBindings() {
    if (!playerPortraitSlotsById.size) return;
    playerPresentationBindings = new Map(
      [...playerPortraitSlotsById.entries()].map(([playerId, portraitSlot]) => {
        const selected = chooseMahjongPortraitSource({
          themeSource: getMahjongAssetUrl(`portrait-${portraitSlot}`),
          platformSource:
            portraitSlot === "self" && platformAvatarAllowed()
              ? platformAvatarSource
              : "",
          avatarPreference: avatarSourcePreference(),
        });
        return [
          playerId,
          {
            ...selected,
            builtinCharacterId:
              getMahjongBuiltinCharacterForPortraitSlot(portraitSlot),
          },
        ];
      }),
    );
  }

  function subscribePlayerPresentations(listener) {
    if (typeof listener !== "function") return () => {};
    playerPresentationSubscribers.add(listener);
    return () => playerPresentationSubscribers.delete(listener);
  }

  function syncDefaultMusicCopyright() {
    if (!copyrightElement) return;
    const copyright = getMahjongMatchMusicCopyright();
    viewFor(copyrightElement.closest("#settings-dialog")).update({ copyright });
  }

  function renderThemePacks() {
    const defaultPack = getMahjongDefaultPack();
    defaultPack.active = !visualPacks.some((pack) => pack.active);
    const packs = [defaultPack, ...visualPacks];
    const downloadedUrls = new Set(
      visualPacks.map((pack) => pack.sourceUrl).filter(Boolean),
    );
    const remote = getMahjongConfiguredAssetPacks().filter(
      (pack) => !downloadedUrls.has(pack.url),
    );
    renderPackOptions(themeElements.list, packs, remote);
    renderAppearanceSettings();
    renderSoundSettings();
  }

  function renderAppearanceSettings() {
    const pack = getActiveVisualPack();
    const catalog = pack?.catalog;
    if (!pack || !catalog) {
      renderAppearanceCards(appearanceElements.controls, []);
      appearanceElements.controls.hidden = true;
      return;
    }
    const portraitLabels = {
      self: "自己",
    };
    const controls = [];
    const portraitRows = [];
    for (const [position, label] of Object.entries(portraitLabels)) {
      portraitRows.push(
        createAppearanceSelect(
          label,
          `portrait:${position}`,
          catalog.portraits,
          pack.appearance.portraits[position],
        ),
      );
    }
    if (catalog.portraits.length)
      controls.push(createAppearanceCard("角色", portraitRows));

    const surfaceRows = [];
    for (const [label, key, options, selected] of [
      ["桌布", "tablecloth", catalog.tablecloths, pack.appearance.tablecloth],
      [
        "背景",
        "tableBackground",
        catalog.tableBackgrounds,
        pack.appearance.tableBackground,
      ],
      ["牌背", "tileBack", catalog.tileBacks, pack.appearance.tileBack],
    ]) {
      if (options.length)
        surfaceRows.push(createAppearanceSelect(label, key, options, selected));
    }
    if (surfaceRows.length)
      controls.push(createAppearanceCard("牌桌画面", surfaceRows));
    if (catalog.lobbyBackgrounds.length) {
      controls.push(
        createAppearanceCard("大厅", [
          createAppearanceSelect(
            "大厅背景",
            "lobbyBackground",
            catalog.lobbyBackgrounds,
            pack.appearance.lobbyBackground,
          ),
        ]),
      );
    }
    const hasControls = controls.length > 0;
    renderAppearanceCards(appearanceElements.controls, controls);
    appearanceElements.controls.hidden = !hasControls;
  }

  function renderSoundSettings() {
    const pack = getActiveVisualPack();
    const catalog = pack?.catalog ?? {};
    const appearance = pack?.appearance ?? {};
    const rows = [
      createAppearanceSelect(
        "对局音乐",
        "matchBgm",
        catalog.matchBgm ?? [],
        appearance.matchBgm,
        catalog.matchBgm?.length ? "不播放" : "不可用",
        !catalog.matchBgm?.length,
      ),
      createAppearanceSelect(
        "立直音乐",
        "riichiBgm",
        catalog.riichiBgm ?? [],
        appearance.riichiBgm,
        catalog.riichiBgm?.length ? "不切换" : "不可用",
        !catalog.riichiBgm?.length,
      ),
    ];
    renderSoundOptions(soundElements.controls, rows);
    soundElements.controls.hidden = false;
  }

  function getActiveVisualPack() {
    return (
      visualPacks.find((candidate) => candidate.active) ||
      getMahjongDefaultPack()
    );
  }

  function createAppearanceCard(title, rows) {
    return { title, rows };
  }
  function createAppearanceSelect(
    label,
    key,
    options,
    selected,
    emptyLabel = "",
    disabled = false,
  ) {
    return { label, key, options, selected, emptyLabel, disabled };
  }

  return {
    ready: assetPacksReady,
    refreshThemePacks,
    applyVisualPack,
    applyPackAvatars,
    syncDefaultMusicCopyright,
    rerollPortraits,
    applyMatchPortraits,
    clearMatchPortraits,
    setPlatformAvatar,
    getPlatformAvatarSource: () => platformAvatarSource,
    setRoomPlayerIdentity,
    getOnlineAiCharacterAssignments,
    getOnlinePortraitContext: getMahjongOnlinePortraitContext,
    resolveCharacterPortrait,
    resolveCharacterVoice,
    getPortraits: getMahjongActivePortraits,
    getAssetUrl: getMahjongAssetUrl,
    getDefaultAssetUrl: getMahjongDefaultAssetUrl,
    getRoomPlayerPresentation,
    getPlayerPresentation,
    getPaipuPlayerPresentations,
    subscribePlayerPresentations,
    getDefaultCharacter,
    getDefaultNames: getMahjongDefaultNames,
    getMatchMusicUrl: getMahjongMatchMusicUrl,
    getRiichiMusicUrl: getMahjongRiichiMusicUrl,
    destroy() {
      unmountThemeControls(
        themeElements.list,
        appearanceElements.controls,
        soundElements.controls,
      );
      themeElements.upload.removeEventListener("change", onUploadChange);
      themeElements.uploadZone?.removeEventListener(
        "dragover",
        onUploadDragOver,
      );
      themeElements.uploadZone?.removeEventListener(
        "dragleave",
        onUploadDragLeave,
      );
      themeElements.uploadZone?.removeEventListener("drop", onUploadDrop);
      themeElements.list.removeEventListener("click", onThemeListClick);
      themeElements.list.removeEventListener("keydown", onThemeListKeydown);
      appearanceElements.controls.removeEventListener(
        "change",
        onAppearanceChange,
      );
      soundElements.controls.removeEventListener("change", onAppearanceChange);
      browserWindow.removeEventListener(
        "mahjong:asset-pack-changed",
        onAssetPackChanged,
      );
    },
  };
}
