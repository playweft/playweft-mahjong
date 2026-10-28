import {
  hasPendingLeagueResult,
  hasPendingPlacementResult,
} from "../../game/career/career.js";

export { CAREER_RESULT_LABELS } from "./labels.js";
import { viewFor } from "../shared/component.js";

export function createMahjongCareerResult({
  document,
  careerStore,
  flush,
  onStartLeague,
  onReturnToLobby,
  showError,
}) {
  const panel = document.querySelector("#career-result");
  const view = viewFor(panel);
  let busy = false,
    slot = null,
    previousFocus,
    leagueResult = false;
  function show(career) {
    const placement = hasPendingPlacementResult(career);
    if (!placement && !hasPendingLeagueResult(career)) return false;
    leagueResult = !placement;
    slot = careerStore.activeSlot;
    previousFocus = document.activeElement;
    view.update({ career, leagueResult, visible: true });
    panel.querySelector("#career-result-start").focus({ preventScroll: true });
    return true;
  }
  function hide() {
    view.update({ visible: false });
    if (previousFocus?.isConnected && !previousFocus.closest("[hidden]"))
      previousFocus.focus({ preventScroll: true });
  }
  async function finish(callback) {
    if (busy || !view.state.visible || !slot) return;
    busy = true;
    view.update({ busy });
    try {
      if (leagueResult) careerStore.acknowledgeLeagueResult();
      else careerStore.acknowledgePlacementResult();
      await flush();
      await callback(slot);
      hide();
    } catch (error) {
      showError(error?.message || "生涯结果保存失败，请重试");
    } finally {
      busy = false;
      view.update({ busy });
    }
  }
  view.update({
    onStart: () => void finish(onStartLeague),
    onBack: () => void finish(onReturnToLobby),
  });
  return {
    show,
    hide,
    destroy() {
      hide();
      view.update({ onStart: undefined, onBack: undefined });
    },
  };
}
