import assert from "node:assert/strict";
import test from "node:test";

import createViteConfig from "../vite.config.js";
const viteConfig = createViteConfig({ command: "serve", mode: "test" });
import {
  addBuildVersionMeta,
  emitBuildVersion,
  hashBundle,
} from "../build/vite/plugins/emit-build-version.js";
import { gamePackage } from "../build/vite/plugins/game-package.js";
import { mahjongDefaultAssets } from "../build/vite/plugins/mahjong-default-assets.js";


test("Vite config keeps the configured dev port and composes its build plugins", () => {
  assert.equal(viteConfig.server.port, 9141);
  assert.deepEqual(
    viteConfig.plugins.flat(Infinity).map((plugin) => plugin.name).filter((name) => ["mahjong-default-assets", "game-package", "emit-build-version", "static-site"].includes(name)),
    [
      "mahjong-default-assets",
      "game-package",
      "emit-build-version",
      "static-site",
    ],
  );
});

test("build version hashes output content and is stamped into HTML", () => {
  const createBundle = (code) => ({
    "assets/app.js": { type: "chunk", fileName: "assets/app.js", code },
    "mahjong/index.html": {
      type: "asset",
      fileName: "mahjong/index.html",
      source: "<!doctype html><html><head><title>麻将</title></head></html>",
    },
  });
  const bundle = createBundle("console.log('one')");
  const firstVersion = hashBundle(bundle);
  const secondVersion = hashBundle(createBundle("console.log('two')"));
  const emitted = [];

  emitBuildVersion().generateBundle.call(
    { emitFile: (file) => emitted.push(file) },
    {},
    bundle,
  );

  assert.notEqual(firstVersion, secondVersion);
  assert.ok(
    addBuildVersionMeta(bundle["mahjong/index.html"].source, firstVersion).includes(
      `<meta name="playweft-build-version" content="${firstVersion}" />`,
    ),
  );
  assert.deepEqual(emitted, [{
    type: "asset",
    fileName: "build-version.json",
    source: `${JSON.stringify({ version: firstVersion })}\n`,
  }]);
});

test("Vite keeps initial shared modules in intentional runtime chunks", () => {
  const output = viteConfig.build.rolldownOptions.output;
  const [three, sharedRuntime] = output.codeSplitting.groups;

  assert.equal(three.name, "three-r185.1");
  assert.equal(three.test.test("/project/node_modules/three/build/three.module.js"), true);
  assert.equal(sharedRuntime.name, "shared-runtime");
  assert.equal(
    sharedRuntime.test("/project/node_modules/lucide/dist/esm/icons/play.js"),
    true,
  );
  assert.equal(sharedRuntime.test("\0vite/modulepreload-polyfill.js"), true);
  assert.equal(sharedRuntime.test("/project/src/platform/playweft-client.js"), true);
  assert.equal(sharedRuntime.test("/project/src/render/three-renderer.js"), false);
  assert.equal(
    output.chunkFileNames({ name: "three-r185.1" }),
    "assets/vendor/three-r185.1-[hash].js",
  );
});

test("Mahjong default asset plugin injects the fetched source configuration", async () => {
  const previousUrl = process.env.MAHJONG_DEFAULT_ASSET_CONFIG_URL;
  const previousFetch = globalThis.fetch;
  const sourceConfig = {
    portraits: [
      { id: "remote", url: "https://example.com/portrait.png", label: "远程人物" },
    ],
  };
  process.env.MAHJONG_DEFAULT_ASSET_CONFIG_URL = "https://example.com/assets.json";
  globalThis.fetch = async (url) => {
    assert.equal(url, "https://example.com/assets.json");
    return {
      ok: true,
      async json() {
        return sourceConfig;
      },
    };
  };
  try {
    const result = await mahjongDefaultAssets().config();
    assert.equal(
      result.define.__MAHJONG_DEFAULT_ASSET_CONFIG__,
      JSON.stringify(sourceConfig),
    );
  } finally {
    if (previousUrl === undefined) delete process.env.MAHJONG_DEFAULT_ASSET_CONFIG_URL;
    else process.env.MAHJONG_DEFAULT_ASSET_CONFIG_URL = previousUrl;
    globalThis.fetch = previousFetch;
  }
});

test("game package plugin serves and emits the root Manifest and Lua rules", async () => {
  const plugin = gamePackage();
  const middleware = [];
  await plugin.configureServer({ middlewares: { use(handler) { middleware.push(handler); } } });
  assert.equal(middleware.length, 1);

  const response = {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(body) {
      this.body = body;
    },
  };
  let nextCalls = 0;
  await middleware[0]({ url: "/game-online.lua?watch=1" }, response, () => {
    nextCalls += 1;
  });
  assert.equal(nextCalls, 0);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Content-Type"], "text/plain; charset=utf-8");
  assert.equal(response.headers["Cache-Control"], "no-cache");
  assert.ok(response.body.length > 0);

  const emitted = [];
  await plugin.generateBundle.call({
    emitFile(file) {
      emitted.push(file);
    },
  });
  assert.deepEqual(
    emitted.map(({ fileName }) => fileName),
    [
      "playweft.json",
      "game.lua",
      "game-online.lua",
    ],
  );
  assert.ok(emitted.find(({ fileName }) => fileName.endsWith("game-online.lua")).source.length > 0);
});

test("game package plugin passes non-package URLs through unchanged", async () => {
  const plugin = gamePackage();
  const middleware = [];
  plugin.configureServer({ middlewares: { use(handler) { middleware.push(handler); } } });
  for (const url of [
    "/mahjong/index.html?mode=solo",
    "/mahjong/",
    "/mahjong?mode=solo",
    "/help.html",
    "/mahjong-other/",
  ]) {
    const request = { url };
    let nextCalls = 0;
    await middleware[0](request, {}, () => { nextCalls += 1; });
    assert.equal(request.url, url);
    assert.equal(nextCalls, 1);
  }
});
