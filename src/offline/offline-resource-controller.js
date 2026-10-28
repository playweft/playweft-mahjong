import {
  cacheGameOfflineResources,
  clearGameOfflineCache,
  gameOfflineResourceUrls,
  hasGameOfflineResources,
  notifyGameOfflineSettings,
  readBuildContentVersion,
  readGameOfflineSettings,
  writeGameOfflineSettings,
} from "./game-offline-cache.js";
import { viewFor } from "../ui/shared/component.js";

export function createMahjongOfflineResourceController({
  button,
  feedback,
  policyRow,
  confirm,
  extraUrls = [],
  gameId = "mahjong",
} = {}) {
  const view = viewFor(button.closest("#offline-resources"));
  const buildVersion = readBuildContentVersion();
  let state = "idle";
  let checking = true;
  let abortController = null;
  let operationId = 0;

  function render({ animate = true } = {}) {
    if (!button) return;
    if (
      policyRow &&
      state !== "complete" &&
      policyRow.contains(policyRow.ownerDocument.activeElement)
    )
      button.focus({ preventScroll: true });
    view.update({ status: state, checking, animate });
  }

  async function download() {
    await ready;
    const currentOperation = ++operationId;
    abortController = new AbortController();
    state = "downloading";
    render();
    if (feedback) view.update({ feedback: "正在下载麻将离线资源…" });
    try {
      const results = await cacheGameOfflineResources(
        gameId,
        gameOfflineResourceUrls(gameId, extraUrls),
        { buildVersion, signal: abortController.signal },
      );
      if (currentOperation !== operationId) return;
      const failed = results.filter((result) => !result.ok).length;
      if (failed) {
        state = "idle";
        if (feedback)
          view.update({
            feedback: `已缓存 ${results.length - failed} 项，${failed} 项暂时无法下载。`,
          });
      } else {
        state = "complete";
        if (feedback)
          view.update({
            feedback: `已缓存 ${results.length} 项麻将离线资源。`,
          });
        const settings = writeGameOfflineSettings(gameId, {
          ...readGameOfflineSettings(gameId),
          mode: "download",
          version: buildVersion,
        });
        await notifyGameOfflineSettings(gameId, settings);
      }
    } catch (error) {
      if (currentOperation !== operationId) return;
      state = "idle";
      if (error?.name === "AbortError") {
        await clearGameOfflineCache(gameId);
        if (feedback) view.update({ feedback: "已取消下载。" });
      } else if (feedback) {
        view.update({ feedback: "下载失败，请稍后重试。" });
      }
    } finally {
      if (currentOperation === operationId) {
        abortController = null;
        render();
      }
    }
  }

  async function clear() {
    await ready;
    ++operationId;
    abortController?.abort();
    abortController = null;
    await clearGameOfflineCache(gameId);
    state = "idle";
    const settings = writeGameOfflineSettings(gameId, {
      ...readGameOfflineSettings(gameId),
      mode: "none",
    });
    await notifyGameOfflineSettings(gameId, settings);
    if (feedback) view.update({ feedback: "已删除麻将离线缓存。" });
    render();
  }

  async function handleAction() {
    await ready;
    if (state === "downloading") abortController?.abort();
    else if (state === "complete") {
      const confirmed = await confirm?.(
        "删除离线资源？删除后需要重新下载才能离线使用。",
      );
      if (confirmed) await clear();
    } else await download();
  }

  async function refresh() {
    if (abortController) return;
    const currentOperation = operationId;
    const settings = readGameOfflineSettings(gameId);
    const available = await hasGameOfflineResources(gameId, {
      settings,
      buildVersion,
    });
    if (currentOperation !== operationId) return;
    state = available ? "complete" : "idle";
    checking = false;
    if (!available && settings.mode === "download") {
      const next = writeGameOfflineSettings(gameId, {
        ...settings,
        mode: "none",
      });
      await notifyGameOfflineSettings(gameId, next);
    }
    render({ animate: false });
  }

  render({ animate: false });
  const ready = refresh();
  return {
    ready,
    refresh,
    get state() {
      return state;
    },
    handleAction,
    download,
    clear,
    render,
  };
}
