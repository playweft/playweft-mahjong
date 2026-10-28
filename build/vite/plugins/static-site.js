import { resolve } from "node:path";
import { nestStaticSite, normalizeBasePath } from "../base-path.js";

/** Keep the upload root fixed at dist/ while supporting subpath deployments. */
export function staticSite() {
  let outDir;
  let base;
  return {
    name: "static-site",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      base = normalizeBasePath(config.base);
    },
    async closeBundle() {
      await nestStaticSite(outDir, base);
    },
  };
}
