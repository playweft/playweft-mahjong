import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));

test("the root dev entry serves the game package and former entry URLs return 404", async () => {
  const server = await createServer({ root, logLevel: "silent", server: { port: 0, host: "127.0.0.1" } });
  try {
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    {
      const prefix = "/";
      const response = await fetch(origin + prefix);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /id="mahjong-app"/);
      const main = html.match(/src="([^" ]*src\/main\.js)"/);
      assert.ok(main, "HTML must load the standalone entry");
      assert.equal((await fetch(new URL(main[1], origin + prefix))).status, 200);
      const manifestResponse = await fetch(origin + prefix + "playweft.json");
      assert.equal(manifestResponse.status, 200);
      const manifest = await manifestResponse.json();
      assert.equal(manifest.id, "/");
      for (const path of [manifest.help_url, manifest.icons[0].src, manifest.modes.room.server.entry, "game.lua"]) {
        const resource = await fetch(new URL(path, origin + prefix + "playweft.json"));
        assert.equal(resource.status, 200, path);
        const content = await resource.text();
        assert.ok(content.length > 0, path);
        if (path.endsWith(".lua")) {
          assert.match(resource.headers.get("content-type"), /text\/plain/);
          assert.match(content, /function setup\(/);
        }
      }
    }
    for (const path of ["/mahjong", "/mahjong/", "/mahjong/index.html", "/mahjong/help.html", "/mahjong/playweft.json", "/mahjong/game.lua", "/mahjong/game-online.lua"]) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 404, path);
    }
    for (const path of ["/src/main.js", "/src/app/application.js", "/src/runtime/workers/local-game-worker.js", "/src/styles/main.css"]) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 200, path);
      assert.doesNotMatch(await response.text(), /games\/mahjong\//);
    }
  } finally {
    await server.close();
  }
});
