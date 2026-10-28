import preact from "@preact/preset-vite";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import { normalizeBasePath } from "./build/vite/base-path.js";
import { gamePackage } from "./build/vite/plugins/game-package.js";
import { emitBuildVersion } from "./build/vite/plugins/emit-build-version.js";
import { mahjongDefaultAssets } from "./build/vite/plugins/mahjong-default-assets.js";
import { staticSite } from "./build/vite/plugins/static-site.js";

const THREE_VENDOR_CHUNK = "three-r185.1";
const SHARED_RUNTIME_CHUNK = "shared-runtime";

function isSharedRuntimeModule(id) {
  return (
    id.includes("vite/modulepreload-polyfill") ||
    id.includes("/node_modules/lucide/") ||
    id.endsWith("/src/offline/game-offline-cache.js") ||
    id.endsWith("/src/platform/playweft-client.js") ||
    id.endsWith("/src/platform/playweft-solo-client.js") ||
    id.endsWith("/src/platform/playweft-rpc.js")
  );
}

export default defineConfig(({ mode, command }) => {
  const base = command === "build"
    ? normalizeBasePath(loadEnv(mode, import.meta.dirname, "BASE_PATH").BASE_PATH)
    : "/";
  return {
    appType: "mpa",
    base,
    define: {
      __MAHJONG_SITE_BASE__: JSON.stringify(base),
      __MAHJONG_PACKAGE_BASE__: JSON.stringify(base),
    },
    plugins: [
      preact(),
      mahjongDefaultAssets(),
      gamePackage({ base }),
      emitBuildVersion(),
      staticSite(),
    ],
    server: { port: 9141 },
    build: {
      rolldownOptions: {
        input: {
          index: resolve(import.meta.dirname, "index.html"),
          help: resolve(import.meta.dirname, "help.html"),
        },
        output: {
          codeSplitting: {
            groups: [
              {
                name: THREE_VENDOR_CHUNK,
                test: /node_modules[\\/]three[\\/]/,
                priority: 20,
              },
              {
                name: SHARED_RUNTIME_CHUNK,
                test: isSharedRuntimeModule,
                priority: 10,
              },
            ],
          },
          chunkFileNames(chunk) {
            return chunk.name === THREE_VENDOR_CHUNK
              ? `assets/vendor/${THREE_VENDOR_CHUNK}-[hash].js`
              : "assets/[name]-[hash].js";
          },
        },
      },
    },
  };
});
