import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

for (const base of ["/", "/games/mahjong/"]) {
 test(`service worker follows content versions and scopes metadata at ${base}`, async () => {
  const handlers = new Map();
  const openedCaches = [];
  const cacheEntries = new Map();
  let version = "0123456789abcdef";
  const caches = {
    async open(name) {
      openedCaches.push(name);
      const entries = cacheEntries.get(name) ?? new Map();
      cacheEntries.set(name, entries);
      return {
        async match(request) {
          return entries.get(String(request))?.clone();
        },
        async put(request, response) {
          entries.set(String(request), response.clone());
        },
      };
    },
    async keys() {
      return [...cacheEntries.keys()];
    },
    async delete(name) {
      return cacheEntries.delete(name);
    },
  };
  const self = {
    location: { origin: "https://play.example", href: "https://play.example" + base + "sw.js" },
    clients: {
      async claim() {},
      async get() {
        return null;
      },
    },
    skipWaiting() {},
    addEventListener(type, handler) {
      handlers.set(type, handler);
    },
  };
  const metadataRequests = [];
  const fetch = async (request) => {
    if (typeof request === "string") metadataRequests.push(request);
    if (request === base + "build-version.json") {
      return Response.json({ version });
    }
    return new Response(
      `<!doctype html><head><meta name="playweft-build-version" content="${version}" /></head>`,
    );
  };
  const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  vm.runInNewContext(source, {
    caches,
    console,
    fetch,
    Map,
    Promise,
    Request,
    Response,
    self,
    URL,
  });

  async function navigate() {
    let response;
    const backgroundWork = [];
    handlers.get("fetch")({
      request: {
        method: "GET",
        mode: "navigate",
        url: "https://play.example" + base,
      },
      clientId: "",
      respondWith(value) {
        response = value;
      },
      waitUntil(value) {
        backgroundWork.push(value);
      },
    });
    await response;
    await Promise.all(backgroundWork);
  }

  const work = [];
  handlers.get("message")({ data: { type: "game-offline-settings", gameId: "mahjong", buildVersion: version }, waitUntil(value) { work.push(value); } });
  await Promise.all(work);
  assert.deepEqual(metadataRequests, [base + "build-version.json"]);
  if (base !== "/") {
    handlers.get("fetch")({ request: { method: "GET", url: "https://play.example/outside/game.lua" }, respondWith() { assert.fail("must not intercept outside this base"); } });
  }
  await navigate();
  assert.ok(openedCaches.includes(`playweft-offline:mahjong:${version}`));

  version = "fedcba9876543210";
  await navigate();
  assert.ok(openedCaches.includes(`playweft-offline:mahjong:${version}`));
});
}
