import { viewFor } from "../shared/component.js";

// Coordinates navigation and persistence; the Lobby component owns its DOM.
export function createMahjongLobbyMenu({
  document,
  window,
  careerStore,
  startCareer,
  showError,
}) {
  const setup = document.querySelector("#setup-panel");
  const view = viewFor(setup);
  let page = "home",
    transitioning = false,
    pending = false,
    destroyed = false;
  const pause = (duration) =>
    new Promise((resolve) =>
      window.setTimeout(
        resolve,
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? 0
          : duration,
      ),
    );
  async function navigate(next, { animate = true, focus = true } = {}) {
    if (transitioning || destroyed) return;
    transitioning = true;
    view.update({ transitioning: true, fading: true });
    try {
      if (animate) await pause(160);
      if (destroyed) return;
      page = next;
      refresh();
      void setup.querySelector(".setup-menu-paper").offsetWidth;
      view.update({ fading: false });
      if (animate) await pause(160);
      if (focus)
        setup
          .querySelector(`[data-lobby-page="${next}"] button`)
          ?.focus({ preventScroll: true });
    } finally {
      transitioning = false;
      if (!destroyed) view.update({ transitioning: false, fading: false });
    }
  }
  function refresh() {
    if (!destroyed)
      view.update({
        page,
        pending,
        careers: [1, 2, 3].map((slot) => careerStore.read(slot)),
        room: setup.dataset.room === "true",
      });
  }
  async function start(slot) {
    if (pending || transitioning || destroyed) return;
    pending = true;
    refresh();
    try {
      await startCareer(slot);
    } catch (error) {
      showError(error.message || "生涯对局准备失败，请重试");
    } finally {
      pending = false;
      refresh();
    }
  }
  view.update({
    onNavigate: navigate,
    onStart: start,
    onKeyDown(event) {
      if (event.key === "Escape" && page !== "home" && !pending) {
        event.preventDefault();
        void navigate("home");
      }
    },
  });
  const observer = new window.MutationObserver(() => {
    if (!setup.hidden) refresh();
  });
  observer.observe(setup, {
    attributes: true,
    attributeFilter: ["hidden", "data-room"],
  });
  refresh();
  return {
    refresh,
    showCareer: () => navigate("career", { animate: false, focus: false }),
    destroy() {
      destroyed = true;
      observer.disconnect();
      view.update({
        onNavigate: undefined,
        onStart: undefined,
        onKeyDown: undefined,
      });
    },
  };
}
