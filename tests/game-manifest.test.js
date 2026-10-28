import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const CATALOGUE_TECHNICAL_COPY = /Lua|WebGL|Canvas|Three\.js|浏览器|规则引擎|协议|同步|简单 AI/i;

test("Mahjong has a strict root Playweft Manifest v1 for bridge v1", async () => {
  const manifest = JSON.parse(await readFile("playweft.json", "utf8"));
  assert.deepEqual(Object.keys(manifest).sort(), [
    "$schema", "background_color", "categories", "description",
    "description_localized", "help_url", "id", "icons", "launch_mode",
    "manifest_version", "modes", "name", "name_localized", "orientation",
    "protocol", "start_url", "theme_color", "version",
  ].sort());
  assert.equal(manifest.manifest_version, 1);
  assert.equal(manifest.id, "/");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(manifest.protocol, { min: 1, max: 1 });
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.launch_mode, "solo");
  assert.equal(typeof manifest.name, "string");
  assert.equal(typeof manifest.name_localized["zh-CN"], "string");
  assert.equal(typeof manifest.description, "string");
  assert.equal(typeof manifest.description_localized["zh-CN"], "string");
  assert.ok(manifest.description.length <= 100);
  assert.ok(manifest.description_localized["zh-CN"].length <= 32);
  assert.doesNotMatch(manifest.description_localized["zh-CN"], CATALOGUE_TECHNICAL_COPY);
  assert.ok(manifest.categories.length > 0);
  assert.equal(manifest.help_url, "./help.html");
  assert.equal(manifest.orientation, "landscape");
  assert.equal("permissions" in manifest, false);
  assert.deepEqual(manifest.icons, [{
    src: "./mahjong.svg", sizes: "any", type: "image/svg+xml", purpose: "any",
  }]);
  assert.ok((await readFile("public/mahjong.svg")).byteLength > 0);
  assert.deepEqual(manifest.modes, {
    room: {
      players: { min: 2, max: 4 },
      server: { runtime: "lua", entry: "./game-online.lua", persistence: "durable" },
    },
    solo: {},
  });
});

test("Featured list points to the root Manifest", async () => {
  const featured = JSON.parse(await readFile("public/featured-games.json", "utf8"));
  assert.deepEqual(featured, [{ manifestUrl: "./playweft.json" }]);
});

test("Cloudflare limits static CORS to browser-fetched JSON", async () => {
  const headers = await readFile("public/_headers", "utf8");
  assert.match(headers, /^\/featured-games\.json\s*$/m);
  assert.match(headers, /^\/playweft\.json\s*$/m);
  assert.equal(headers.match(/^\s+Access-Control-Allow-Origin: \*$/gm)?.length, 2);
  assert.doesNotMatch(headers, /^\/\*\s*$/m);
  assert.doesNotMatch(headers, /game\.lua/);
});
