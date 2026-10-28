import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { Window } from "happy-dom";
import { strToU8, zipSync } from "fflate";
import { initializeMahjongStorage } from "../src/storage/initialize.js";
import { createGameStorage, createStandaloneStorage } from "../src/storage/game-storage.js";
import { loadGameStorageCache } from "../src/storage/game-storage-cache.js";
import {
  DEFAULT_THEME_ID,
  MAHJONG_THEME_PREFERENCES_KEY as KEY,
  readMahjongThemePreferences,
  saveMahjongThemeAppearance,
  selectMahjongTheme,
} from "../src/storage/theme-preferences.js";

const DB_NAME = "playweft-mahjong-asset-packs-v2";
let moduleId = 0;

function fixture(t, { transient = false } = {}) {
  const dom = new Window();
  const factory = new IDBFactory();
  const legacyCalls = [];
  const globals = {
    window: { parent: {}, dispatchEvent: dom.dispatchEvent.bind(dom) },
    document: dom.document,
    CustomEvent: dom.CustomEvent,
    localStorage: {
      getItem(key) {
        legacyCalls.push(["get", key]);
        return key === "playweft.mahjong.default-asset-appearance"
          ? JSON.stringify({ tileBack: "second" }) : null;
      },
      removeItem: (key) => legacyCalls.push(["remove", key]),
    },
    __MAHJONG_DEFAULT_ASSET_CONFIG__: {
      tileBacks: [
        { id: "first", url: "https://assets.example/first.png" },
        { id: "second", url: "https://assets.example/second.png" },
      ],
    },
    indexedDB: factory,
  };
  for (const [key, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    if (key === "indexedDB" && transient) delete globalThis[key];
    else Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else delete globalThis[key];
    });
  }
  t.after(() => dom.happyDOM.close());
  const platform = new Map();
  const writes = [];
  let fail = false;
  const bridge = {
    ready: async () => ({ capabilities: ["getItem", "setItem", "removeItem"].map((method) => `localStorage.${method}`) }),
    localStorage: {
      getItem: async (key) => platform.get(key) ?? null,
      async setItem(key, value) {
        if (fail) throw new Error("Platform write failed");
        writes.push([key, value]);
        platform.set(key, value);
      },
      removeItem: async (key) => platform.delete(key),
    },
  };
  const hydrate = () => loadGameStorageCache({
    gameId: "mahjong", keys: [KEY],
    backend: createGameStorage(bridge, { embedded: true }),
  });
  return {
    factory, platform, writes, bridge, legacyCalls, hydrate,
    failWrites: (value) => { fail = value; },
    nextAssetChange: () => new Promise((resolve) => dom.addEventListener("mahjong:asset-pack-changed", resolve, { once: true })),
    freshAssets: () => import(`../src/storage/asset-packs.js?theme-storage=${++moduleId}`),
  };
}

function archive(name = "Test theme") {
  const data = zipSync({
    "theme.json": strToU8(JSON.stringify({
      schemaVersion: 1, name,
      assets: {
        tileBacks: [
          { id: "first", file: "first.png", label: "First" },
          { id: "second", file: "second.png", label: "Second" },
        ],
        matchBgm: [{ id: "music", file: "music.ogg", label: "Music" }],
      },
      defaults: { tileBack: "second", matchBgm: "music" },
    })),
    "first.png": new Uint8Array([137, 80, 78, 71]),
    "second.png": new Uint8Array([137, 80, 78, 71, 1]),
    "music.ogg": strToU8("OggS"),
  });
  return new File([data], "theme.zip", { type: "application/zip" });
}

async function assetDatabase(factory) {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("packs", { keyPath: "id" });
      request.result.createObjectStore("assets", { keyPath: ["packId", "slot"] });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction(db, mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["packs", "assets"], mode);
    const request = action(tx.objectStore("packs"), tx.objectStore("assets"));
    tx.oncomplete = () => resolve(request?.result);
    tx.onabort = () => reject(tx.error);
  });
}

test("theme selection and appearances persist through the platform; local files stay unchanged", async (t) => {
  const f = fixture(t);
  await initializeMahjongStorage(f.bridge);
  assert.equal(f.legacyCalls.some(([, key]) => key.includes("theme-preferences") || key.includes("asset-appearance")), false);
  assert.equal(f.platform.has("playweft.mahjong.default-asset-appearance"), false);
  let api = await f.freshAssets();
  await api.initializeMahjongAssetPacks();
  assert.equal(api.getMahjongDefaultPack().appearance.tileBack, "first");
  await api.configureMahjongDefaultPackAppearance({ tileBack: "second" });
  let packs = await api.createMahjongAssetPack(archive());
  const id = packs[0].id;
  assert.equal(packs[0].appearance.tileBack, "second", "manifest defaults apply on import");
  const db = await assetDatabase(f.factory);
  t.after(() => db.close());
  const original = await transaction(db, "readonly", (packs) => packs.get(id));
  assert.equal(Object.hasOwn(original, "active"), false);
  assert.equal(Object.hasOwn(original, "appearance"), false);
  const storedAssets = await transaction(db, "readonly", (_, assets) => assets.getAll());
  assert.equal(storedAssets.length, 3);
  assert.ok(storedAssets.every((record) => record.blob instanceof Blob));
  packs = await api.configureMahjongAssetPackAppearance(id, { ...packs[0].appearance, tileBack: "first", matchBgm: "", voice: false });
  assert.equal(packs[0].appearance.matchBgm, "");
  assert.equal(api.getMahjongAssetUrl("music"), "");
  assert.deepEqual(await transaction(db, "readonly", (packs) => packs.get(id)), original);
  assert.equal(JSON.parse(f.platform.get(KEY)).appearances[id].voice, false);
  assert.ok(f.writes.filter(([key]) => key === KEY).length >= 3);

  await f.hydrate();
  api = await f.freshAssets();
  await api.initializeMahjongAssetPacks();
  assert.equal(api.getMahjongOnlinePortraitContext().packId, id);
  packs = await api.listMahjongAssetPacks();
  assert.equal(packs[0].active, true);
  assert.equal(packs[0].appearance.tileBack, "first");
  assert.equal(packs[0].appearance.voice, false);
  assert.equal(packs[0].appearance.matchBgm, "");
  await api.deactivateMahjongAssetPacks();
  assert.equal(api.getMahjongDefaultPack().appearance.tileBack, "second");
  await api.activateMahjongAssetPack(id);
  const second = (await api.createMahjongAssetPack(archive("Other theme"))).find((pack) => pack.id !== id).id;
  await api.deleteMahjongAssetPack(id);
  assert.equal(readMahjongThemePreferences().selectedPackId, second);
  assert.equal(Object.hasOwn(readMahjongThemePreferences().appearances, id), false);
  assert.equal((await api.listMahjongAssetPacks())[0].active, true);
  await api.deleteMahjongAssetPack(second);
  assert.equal(readMahjongThemePreferences().selectedPackId, DEFAULT_THEME_ID);
  assert.equal(api.getMahjongOnlinePortraitContext().packId, DEFAULT_THEME_ID);
  assert.equal((await transaction(db, "readonly", (_, assets) => assets.getAll())).length, 0);
});

test("old theme settings are ignored; a missing local pack falls back without erasing preferences", async (t) => {
  const f = fixture(t);
  await f.hydrate();
  const api = await f.freshAssets();
  const [pack] = await api.createMahjongAssetPack(archive());
  const db = await assetDatabase(f.factory);
  t.after(() => db.close());
  const raw = await transaction(db, "readonly", (packs) => packs.get(pack.id));
  delete raw.defaults;
  await transaction(db, "readwrite", (packs) => packs.put({ ...raw, active: true, appearance: { tileBack: "second", voice: false } }));
  f.platform.delete(KEY);
  await f.hydrate();
  await api.initializeMahjongAssetPacks();
  assert.equal(api.getMahjongOnlinePortraitContext().packId, DEFAULT_THEME_ID);
  assert.equal(f.platform.has(KEY), false, "startup does not migrate local theme state");
  const [oldPack] = await api.listMahjongAssetPacks();
  assert.equal(oldPack.active, false);
  assert.equal(oldPack.appearance.tileBack, "first");
  assert.equal(oldPack.appearance.voice, true);
  await api.activateMahjongAssetPack(pack.id);
  await api.configureMahjongAssetPackAppearance(pack.id, { tileBack: "second" });
  const saved = f.platform.get(KEY);
  await transaction(db, "readwrite", (packs) => packs.delete(pack.id));
  await api.initializeMahjongAssetPacks();
  assert.equal(api.getMahjongOnlinePortraitContext().packId, DEFAULT_THEME_ID);
  assert.equal(f.platform.get(KEY), saved);
  await transaction(db, "readwrite", (packs) => packs.put(raw));
  await api.initializeMahjongAssetPacks();
  assert.equal(api.getMahjongOnlinePortraitContext().packId, pack.id);
  assert.equal((await api.listMahjongAssetPacks())[0].appearance.tileBack, "second");
});

test("failed platform writes surface an error and retain the latest preference for retry", async (t) => {
  const f = fixture(t);
  const cache = await f.hydrate();
  const api = await f.freshAssets();
  const [pack] = await api.createMahjongAssetPack(archive());
  const before = f.platform.get(KEY);
  f.failWrites(true);
  await assert.rejects(api.configureMahjongAssetPackAppearance(pack.id, { tileBack: "first" }), /Platform write failed/);
  assert.equal(f.platform.get(KEY), before);
  assert.equal(readMahjongThemePreferences().appearances[pack.id].tileBack, "first");
  const applied = f.nextAssetChange();
  await assert.rejects(api.deleteMahjongAssetPack(pack.id), /Platform write failed/);
  // Applying the cached preference completes even if the commit failed first.
  await applied;
  assert.equal(api.getMahjongOnlinePortraitContext().packId, DEFAULT_THEME_ID);
  assert.equal((await api.listMahjongAssetPacks()).length, 1, "failed preference commit must not delete files");
  f.failWrites(false);
  await cache.retry();
  await f.hydrate();
  await api.initializeMahjongAssetPacks();
  assert.equal(api.getMahjongOnlinePortraitContext().packId, DEFAULT_THEME_ID);
  assert.equal(Object.hasOwn(readMahjongThemePreferences().appearances, pack.id), false);
});

test("transient theme files still use platform preferences and respect the selected default", async (t) => {
  const f = fixture(t, { transient: true });
  await f.hydrate();
  const api = await f.freshAssets();
  await api.initializeMahjongAssetPacks();
  const [pack] = await api.createMahjongAssetPack(archive());
  assert.equal(JSON.parse(f.platform.get(KEY)).selectedPackId, pack.id);
  await api.configureMahjongAssetPackAppearance(pack.id, { tileBack: "first", voice: false });
  assert.equal((await api.listMahjongAssetPacks())[0].appearance.voice, false);
  await api.deactivateMahjongAssetPacks();
  await api.applyMahjongMatchPortraits({}, "test");
  assert.equal(api.getMahjongOnlinePortraitContext().packId, DEFAULT_THEME_ID);
  await api.activateMahjongAssetPack(pack.id);
  assert.equal(api.getMahjongOnlinePortraitContext().packId, pack.id);
  await api.deleteMahjongAssetPack(pack.id);
  assert.deepEqual(await api.listMahjongAssetPacks(), []);
  assert.equal(readMahjongThemePreferences().selectedPackId, DEFAULT_THEME_ID);
});

test("standalone theme preferences reopen from first-party IndexedDB", async (t) => {
  fixture(t);
  const factory = new IDBFactory();
  let disk = createStandaloneStorage({ factory });
  const hydrate = () => loadGameStorageCache({
    gameId: "mahjong", keys: [KEY],
    backend: createGameStorage(null, { embedded: false, standalone: disk }),
  });
  await hydrate();
  await saveMahjongThemeAppearance("local-pack", { tileBack: "second" });
  await selectMahjongTheme("local-pack");
  await disk.close();
  disk = createStandaloneStorage({ factory });
  await hydrate();
  assert.equal(readMahjongThemePreferences().selectedPackId, "local-pack");
  assert.equal(readMahjongThemePreferences().appearances["local-pack"].tileBack, "second");
  await disk.close();
});
