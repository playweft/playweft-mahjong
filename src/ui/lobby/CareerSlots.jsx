import { careerSummary } from "../../game/career/career.js";

export function CareerSlots({ careers = [], pending = false, onStart }) {
  return [1, 2, 3].map((slot) => {
    const career = careers[slot - 1];
    const summary = careerSummary(career);
    const last = career?.lastSettlement;
    const verdict =
      last &&
      {
        placed: `定段 ${last.nextTier}`,
        promoted: `升级至 ${last.nextTier}`,
        relegated: `降级至 ${last.nextTier}`,
        retained: `${last.nextTier} 保级`,
      }[last.outcome];
    return (
      <button
        key={slot}
        type="button"
        class={`career-slot${career ? "" : " is-empty"}`}
        data-career-slot={slot}
        disabled={pending}
        aria-label={`存档 ${slot}，${career ? summary.action : "新游戏"}`}
        onClick={() => onStart?.(slot)}
      >
        <span class="career-slot-number" aria-hidden="true">
          {slot}
        </span>
        <span class="career-slot-info">
          <strong>{career ? summary.heading : "新游戏"}</strong>
          {career && (
            <span class="career-slot-progress">
              {summary.progress}
              {summary.action === "继续对局" ? " · 继续对局" : ""}
            </span>
          )}
          {verdict && <span class="career-slot-detail">{verdict}</span>}
        </span>
        <span class="career-slot-arrow" aria-hidden="true">
          ›
        </span>
      </button>
    );
  });
}
