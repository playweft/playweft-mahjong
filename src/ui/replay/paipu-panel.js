import { viewFor } from "../shared/component.js";

export function createMahjongPaipuPanel({
  document,
  window,
  elements,
  getGame,
  getPlayMode,
  listMahjongPaipuSummaries,
  setMahjongPaipuPinned,
  onReplay,
}) {
  const view = viewFor(elements.panel);
  let openingFrame = 0,
    closingTimer = 0,
    open = false,
    returnFocus = null,
    request = 0;
  async function show() {
    if (getGame() || getPlayMode() !== "solo" || open) return;
    if (openingFrame) window.cancelAnimationFrame(openingFrame);
    if (closingTimer) window.clearTimeout(closingTimer);
    openingFrame = closingTimer = 0;
    returnFocus = document.activeElement;
    open = true;
    view.update({ visible: true, open: false });
    await renderList();
    openingFrame = window.requestAnimationFrame(() => {
      openingFrame = 0;
      if (open) {
        view.update({ open: true });
        elements.card?.focus({ preventScroll: true });
      }
    });
  }
  function finishClose(restoreFocus) {
    if (open) return;
    if (closingTimer) window.clearTimeout(closingTimer);
    closingTimer = 0;
    request += 1;
    view.update({ visible: false, summaries: [], loading: false });
    if (restoreFocus) returnFocus?.focus?.({ preventScroll: true });
    returnFocus = null;
  }
  function hide({ animate = true, restoreFocus = true } = {}) {
    if (!open && !view.state.visible) return;
    if (openingFrame) window.cancelAnimationFrame(openingFrame);
    if (closingTimer) window.clearTimeout(closingTimer);
    openingFrame = closingTimer = 0;
    open = false;
    view.update({ open: false });
    if (
      animate &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches !== true
    )
      closingTimer = window.setTimeout(() => finishClose(restoreFocus), 240);
    else finishClose(restoreFocus);
  }
  async function renderList() {
    const current = ++request;
    view.update({ summaries: [], loading: true, error: "" });
    try {
      const summaries = await listMahjongPaipuSummaries();
      if (current === request) view.update({ summaries, loading: false });
    } catch (error) {
      console.error("Unable to read Mahjong paipu list", error);
      if (current === request)
        view.update({ error: "牌谱暂时无法读取", loading: false });
    }
  }
  view.update({
    onReplay: (id) => void onReplay(id),
    async onPin(summary) {
      view.update({ busyId: summary.id });
      try {
        await setMahjongPaipuPinned(summary.id, !summary.pinned);
        await renderList();
      } catch (error) {
        console.error("Unable to update Mahjong paipu favorite", error);
      } finally {
        view.update({ busyId: null });
      }
    },
  });
  return { show, hide, renderList, isOpen: () => open };
}
