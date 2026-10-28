import { readFile } from "node:fs/promises";
import { buildMahjongOnlineSource } from "../../lua/room-paipu-online-source.js";

const manifestUrl = new URL("../../../playweft.json", import.meta.url);
const rulesUrl = new URL("../../../src/game/rules/game.lua", import.meta.url);

async function packageFiles(base) {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  manifest.id = base;
  const rules = await readFile(rulesUrl, "utf8");
  return {
    "playweft.json": JSON.stringify(manifest, null, 2) + "\n",
    "game.lua": rules,
    "game-online.lua": buildMahjongOnlineSource(rules),
  };
}

export function gamePackage({ base = "/" } = {}) {
  return {
    name: "game-package",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split("?", 1)[0];
        if (!["/playweft.json", "/game.lua", "/game-online.lua"].includes(path)) {
          next();
          return;
        }
        try {
          const files = await packageFiles(base);
          response.statusCode = 200;
          response.setHeader("Content-Type", path.endsWith(".json") ? "application/json; charset=utf-8" : "text/plain; charset=utf-8");
          response.setHeader("Cache-Control", "no-cache");
          response.end(files[path.slice(1)]);
        } catch (error) {
          next(error);
        }
      });
    },
    async generateBundle() {
      for (const [fileName, source] of Object.entries(await packageFiles(base))) {
        this.emitFile({ type: "asset", fileName, source });
      }
    },
  };
}
