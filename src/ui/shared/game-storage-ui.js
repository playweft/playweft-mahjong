import { h, render } from "preact";
import { StorageFailure } from "./StorageFailure.jsx";
import { createGameStorage } from "../../storage/game-storage.js";
import { loadGameStorageCache } from "../../storage/game-storage-cache.js";

/** Block startup on failed reads; retain the latest in-memory writes for retry. */
export async function initializeGameStorage(
  bridge,
  { gameId, keys, legacyKeys = keys, validate },
) {
  const backend = createGameStorage(bridge, {
    legacyKeys,
    migrationKey: `playweft:${gameId}:storage-migrated:v1`,
  });
  let overlay;
  let previousFocus;
  let blockedElements = [];
  function close() {
    if (!overlay) return;
    render(null, overlay);
    overlay.remove();
    overlay = undefined;
    for (const node of blockedElements) node.inert = false;
    blockedElements = [];
    if (previousFocus?.isConnected) previousFocus.focus();
  }
  function show(error, retry, saving) {
    if (!overlay) {
      previousFocus = document.activeElement;
      blockedElements = [...document.body.children].filter(
        (node) => !node.inert && node.tagName !== "SCRIPT",
      );
      for (const node of blockedElements) node.inert = true;
      overlay = document.createElement("div");
      overlay.className = "game-storage-overlay";
      document.body.append(overlay);
    }
    render(h(StorageFailure, { error, retry, saving }), overlay);
    overlay.querySelector("button").focus();
  }
  while (true) {
    try {
      const cache = await loadGameStorageCache({
        gameId,
        keys,
        backend,
        validate,
        onError(error, retry) {
          show(error, () => retry().catch(() => {}), true);
        },
        onSaved: close,
      });
      close();
      return cache;
    } catch (error) {
      await new Promise((resolve) => show(error, resolve, false));
    }
  }
}
