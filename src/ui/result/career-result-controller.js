import { hasPendingLeagueResult, hasPendingPlacementResult } from "../../game/career/career.js";

export const CAREER_RESULT_LABELS = Object.freeze({
  placed: { title: "定段結果", action: "开始联赛" },
  promoted: { title: "昇級結果", action: "开始下一期" },
  relegated: { title: "降級結果", action: "开始下一期" },
  retained: { title: "残留結果", action: "开始下一期" },
});

const pointsText = (points) => `${points > 0 ? "+" : ""}${points.toFixed(1)}`;

/** A grade reveal backed by the settled slot; no game action or evaluation is rendered here. */
export function createMahjongCareerResult({ document, careerStore, flush, onStartLeague, onReturnToLobby, showError }) {
  const panel = document.querySelector("#career-result");
  const grade = panel.querySelector("#career-result-grade");
  const title = panel.querySelector("#career-result-title");
  const caption = panel.querySelector(".career-result-caption");
  const table = panel.querySelector(".career-result-table");
  const rows = panel.querySelector("#career-result-rows");
  const total = panel.querySelector("#career-result-total");
  const start = panel.querySelector("#career-result-start");
  const back = panel.querySelector("#career-result-back");
  let busy = false;
  let slot = null;
  let previousFocus;
  let leagueResult = false;

  function show(career) {
    const placement = hasPendingPlacementResult(career);
    if (!placement && !hasPendingLeagueResult(career)) return false;
    leagueResult = !placement;
    const result = leagueResult ? career.pendingLeagueResult : null;
    const matches = result ? result.results : career.placement;
    const labels = CAREER_RESULT_LABELS[result?.outcome || "placed"];
    slot = careerStore.activeSlot;
    previousFocus = document.activeElement;
    panel.classList.toggle("is-league-result", leagueResult);
    title.textContent = labels.title;
    start.querySelector("[data-career-brush]").textContent = labels.action;
    grade.textContent = career.tier;
    grade.setAttribute("aria-label", placement ? "初始等级" : "本期结算等级");
    caption.textContent = placement ? "初始等级" : `第 ${result.number} 期 · ${result.previousTier}${result.previousTier === result.nextTier ? " 保级" : ` → ${result.nextTier}`}`;
    table.setAttribute("aria-label", placement ? "三场定段赛成绩" : `第 ${result.number} 期八场联赛成绩`);
    rows.replaceChildren(...matches.map((result, index) => {
      const row = document.createElement("tr");
      for (const value of [`第${["一", "二", "三", "四", "五", "六", "七", "八"][index]}场`, `${result.rank}位`, String(result.score), pointsText(result.points)]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      return row;
    }));
    total.textContent = `${pointsText(Math.round(matches.reduce((sum, result) => sum + result.points, 0) * 10) / 10)} pt`;
    panel.hidden = false;
    start.focus({ preventScroll: true });
    return true;
  }

  function hide() {
    panel.hidden = true;
    if (previousFocus?.isConnected && !previousFocus.closest("[hidden]")) previousFocus.focus({ preventScroll: true });
  }

  async function finish(callback) {
    if (busy || panel.hidden || !slot) return;
    busy = true;
    start.disabled = back.disabled = true;
    try {
      // Keep the reveal recoverable until a deliberate exit, even across a reload.
      if (leagueResult) careerStore.acknowledgeLeagueResult();
      else careerStore.acknowledgePlacementResult();
      await flush();
      await callback(slot);
      hide();
    } catch (error) {
      showError(error?.message || "生涯结果保存失败，请重试");
    } finally {
      busy = false;
      start.disabled = back.disabled = false;
    }
  }
  const startClick = () => void finish(onStartLeague);
  const backClick = () => void finish(onReturnToLobby);
  start.addEventListener("click", startClick);
  back.addEventListener("click", backClick);
  return { show, hide, destroy() {
    start.removeEventListener("click", startClick);
    back.removeEventListener("click", backClick);
    hide();
  } };
}
