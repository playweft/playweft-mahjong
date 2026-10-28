import { MatchSummary } from "./MatchSummary.jsx";
import { ViewComponent } from "../shared/component.js";
import { ResultHand } from "./ResultHand.jsx";
import {
  asArray,
  doraTypeCounts,
  resultDetailPageCount,
} from "../../game/rules/game-format.js";
import { traditionalYakuName } from "../../game/rules/yaku-display.js";

export class HandResult extends ViewComponent {
  state = {
    game: null,
    showResult: false,
    page: 0,
    pageReady: false,
    summaryVisible: false,
  };
  render() {
    const { game, showResult, page, pageReady } = this.state;
    const ended = game?.phase === "hand_ended";
    const detailCount = game ? resultDetailPageCount(game) : 0;
    const safePage = Math.max(0, Math.min(detailCount, Number(page) || 0));
    const scores = safePage >= detailCount;
    const results = asArray(game?.results).length
      ? asArray(game.results)
      : [game?.result || {}];
    const result = results[safePage] || {};
    const winnerIndex =
      Number(result.winnerIndex) ||
      (game?.players?.indexOf(game.winners?.[safePage]) ?? -1) + 1 ||
      Number(game?.winnerIndex) ||
      1;
    const label = pageReady ? "等待中" : "继续";
    return (
      <section
        ref={this.bind}
        id="result-panel"
        class={`result-panel${ended && !showResult ? " is-warming" : ""}${ended && showResult ? " is-entering" : ""}${this.state.summaryVisible ? " is-match-summary" : ""}`}
        aria-live="assertive"
        hidden={!ended}
        inert={!ended || !showResult}
        aria-hidden={String(!ended || !showResult)}
      >
        <div class="result-page-stage">
          <div class="result-page-track">
            <div
              id="result-detail-content"
              class="result-content result-detail-content"
              hidden={scores}
            >
              <div id="result-hands" class="result-hands" aria-label="胡牌牌型">
                {ended && !scores && (
                  <ResultHand
                    game={game}
                    winnerIndex={winnerIndex}
                    dora={doraTypeCounts(game)}
                  />
                )}
              </div>
              <div id="result-yaku" class="result-yaku">
                {ended &&
                  !scores &&
                  asArray(result.yaku).map((yaku, index) => (
                    <span key={index}>
                      <i>{traditionalYakuName(yaku.name)}</i>
                      <b>
                        {game.winType === "nagashi"
                          ? "滿貫"
                          : yaku.han >= 13
                            ? "役满"
                            : `${yaku.han}番`}
                      </b>
                    </span>
                  ))}
              </div>
            </div>
            <div
              id="result-score-content"
              class="result-content result-score-content"
              aria-label="记分纸"
              hidden={!scores}
            ></div>
            <div class="result-footer">
              <button
                id="rematch-button"
                class="result-start-control"
                type="button"
                aria-label={label}
                disabled={pageReady}
              >
                <span
                  class="result-start-control-cap"
                  aria-hidden="true"
                ></span>
                <span
                  id="rematch-button-label"
                  class="result-start-control-label"
                >
                  {label}
                </span>
              </button>
            </div>
          </div>
        </div>
        <MatchSummary />
      </section>
    );
  }
}
