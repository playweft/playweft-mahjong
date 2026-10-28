import assert from "node:assert/strict";
import { mkdtemp, readFile, access, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "vite";
import createViteConfig from "../vite.config.js";
import { normalizeBasePath } from "../build/vite/base-path.js";
import { siteBasePath, siteResourcePath, gameBasePath } from "../src/runtime/package-paths.js";
import { gameOfflineResourceUrls, registerGameOfflineServiceWorker } from "../src/offline/game-offline-cache.js";
import { installOfflineCache } from "./helpers/offline-cache.js";

const root = fileURLToPath(new URL("../", import.meta.url));

test("BASE_PATH accepts root and nested paths and rejects ambiguous paths", () => {
  for (const value of [undefined, "", "/", "  /"]) assert.equal(normalizeBasePath(value), "/");
  for (const value of ["mahjong", "/mahjong", "/mahjong/"]) assert.equal(normalizeBasePath(value), "/mahjong/");
  assert.equal(normalizeBasePath("/games/table-mahjong/"), "/games/table-mahjong/");
  for (const value of ["https://game.example/", "//game.example/", "../mahjong", "/games/../mahjong/", "/a//b/", "/a?b", "/a#b", "/_headers/", "/_redirects/", "/a%2fb/"])
    assert.throws(() => normalizeBasePath(value), /BASE_PATH/);
});

test("development ignores the build-only prefix and uses the root entry", () => {
  const saved = process.env.BASE_PATH;
  process.env.BASE_PATH = "/games/mahjong/";
  try {
    const config = createViteConfig({ command: "serve", mode: "test" });
    assert.equal(config.base, "/");
    assert.equal(JSON.parse(config.define.__MAHJONG_SITE_BASE__), "/");
    assert.equal(JSON.parse(config.define.__MAHJONG_PACKAGE_BASE__), "/");
  } finally {
    if (saved === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = saved;
  }
});

test("offline resource discovery and service-worker registration respect the selected base", async (t) => {
  const { setGlobal } = installOfflineCache(t);
  const base = "/games/mahjong/";
  setGlobal("__MAHJONG_SITE_BASE__", base);
  setGlobal("__MAHJONG_PACKAGE_BASE__", base);
  setGlobal("location", { href: "https://game.example" + base, origin: "https://game.example" });
  setGlobal("performance", { getEntriesByType: () => [
    { name: "https://game.example" + base + "assets/app.js" },
    { name: "https://game.example/another-game/assets/app.js" },
    { name: "https://game.example" + base + "sw.js" },
  ] });
  const registrations = [];
  setGlobal("navigator", { serviceWorker: { register: async (...args) => { registrations.push(args); return "registered"; } } });
  assert.equal(siteBasePath(), base);
  assert.equal(siteResourcePath("build-version.json"), base + "build-version.json");
  assert.equal(gameBasePath(), base);
  assert.deepEqual(gameOfflineResourceUrls(), [base, base + "index.html", base + "build-version.json", "https://game.example" + base + "assets/app.js"]);
  assert.equal(await registerGameOfflineServiceWorker(), "registered");
  assert.deepEqual(registrations, [[base + "sw.js", { scope: base }]]);
});

test("root and nested builds emit a complete game package and remove the preceding build", async () => {
  const temp = await mkdtemp(join(tmpdir(), "playweft-mahjong-base-"));
  const outDir = join(temp, "dist");
  const saved = process.env.BASE_PATH;
  let previous;
  try {
    for (const value of [undefined, "/mahjong/", "/games/mahjong/", ""]) {
      if (value === undefined) delete process.env.BASE_PATH;
      else process.env.BASE_PATH = value;
      await build({ root, logLevel: "silent", build: { outDir, emptyOutDir: true } });
      const base = normalizeBasePath(value);
      const dir = join(outDir, base);
      if (previous) await assert.rejects(access(join(outDir, previous, "index.html")));
      previous = base;
      const manifest = JSON.parse(await readFile(join(dir, "playweft.json"), "utf8"));
      assert.equal(manifest.id, base);
      const origin = "https://game.example";
      const manifestUrl = origin + base + "playweft.json";
      for (const path of [manifest.start_url, manifest.help_url, manifest.icons[0].src, manifest.modes.room.server.entry, "game.lua", "sw.js", "build-version.json"]) {
        const url = new URL(path, manifestUrl);
        assert.ok(url.pathname.startsWith(base));
        await access(join(outDir, url.pathname + (url.pathname.endsWith("/") ? "index.html" : "")));
      }
      const index = await readFile(join(dir, "index.html"), "utf8");
      assert.ok(index.includes('id="app-root"'), "root entry must be the game rather than a redirect to a fixed /mahjong/");
      assert.match(index, /name="playweft-build-version" content="[a-f0-9]{16}"/);
      for (const page of ["index.html", "help.html"]) {
        const html = await readFile(join(dir, page), "utf8");
        for (const [, path] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
          if (/^(?:data:|https?:|#)/.test(path)) continue;
          const url = new URL(path, origin + base + page);
          assert.ok(url.pathname.startsWith(base), `${path} escapes ${base}`);
          await access(join(outDir, url.pathname));
        }
      }
      const assets = await readdir(join(dir, "assets"));
      assert.ok(assets.some((name) => name.startsWith("local-game-worker-") && name.endsWith(".js")));
      assert.deepEqual(JSON.parse(await readFile(join(dir, "featured-games.json"), "utf8")), [{ manifestUrl: "./playweft.json" }]);
      const headers = await readFile(join(outDir, "_headers"), "utf8");
      assert.ok(headers.includes(base + "playweft.json"));
      assert.ok(headers.includes(base + "assets/vendor/*"));
      if (base !== "/") await assert.rejects(access(join(dir, "_headers")));
    }
  } finally {
    if (saved === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = saved;
    await rm(temp, { recursive: true, force: true });
  }
});
