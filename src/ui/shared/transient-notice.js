import { viewFor } from "./component.js";
/** Shows short, non-blocking Mahjong status notices over any screen. */
export function createMahjongTransientNotice({
  element,
  window = globalThis.window,
  duration = 4600,
  transitionDuration = 180,
} = {}) {
  const view = element ? viewFor(element) : null;
  let hideTimer = 0;
  let concealTimer = 0;

  function clearTimers() {
    window?.clearTimeout(hideTimer);
    window?.clearTimeout(concealTimer);
    hideTimer = 0;
    concealTimer = 0;
  }

  function show(message) {
    if (!element || typeof message !== "string" || !message) return;
    clearTimers();
    view.update({ message, visible: true });
    void element.offsetWidth;
    view.update({ shown: true });
    hideTimer = window?.setTimeout(() => {
      view.update({ shown: false });
      concealTimer = window?.setTimeout(() => {
        if (!view.state.shown) view.update({ visible: false });
      }, transitionDuration);
    }, duration);
  }

  return { show, clear: clearTimers };
}
