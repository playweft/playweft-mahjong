import { ViewComponent } from "../shared/component.js";
import { CAREER_RESULT_LABELS } from "./labels.js";

export class CareerResult extends ViewComponent {
  state = { visible: false, busy: false, career: null, leagueResult: false };
  render() {
    const { visible, busy, career, leagueResult, onStart, onBack } = this.state;
    const result = leagueResult ? career?.pendingLeagueResult : null;
    const matches = result?.results || career?.placement || [];
    const labels = CAREER_RESULT_LABELS[result?.outcome || "placed"];
    const caption = result
      ? `第 ${result.number} 期 · ${result.previousTier}${result.previousTier === result.nextTier ? " 保级" : ` → ${result.nextTier}`}`
      : "初始等级";
    const pointsText = (points) =>
      `${points > 0 ? "+" : ""}${points.toFixed(1)}`;
    const total =
      Math.round(matches.reduce((sum, match) => sum + match.points, 0) * 10) /
      10;
    return (
      <section
        ref={this.bind}
        id="career-result"
        class={`career-result${leagueResult ? " is-league-result" : ""}`}
        aria-labelledby="career-result-title"
        hidden={!visible}
      >
        <div class="career-result-frame">
          <div class="career-result-paper">
            <div class="career-result-mode">
              <span data-career-brush="">立志戦</span>
            </div>
            <h2 id="career-result-title" data-career-brush="">
              {labels.title}
            </h2>
            <div class="career-result-rank">
              <strong
                id="career-result-grade"
                aria-label={leagueResult ? "本期结算等级" : "初始等级"}
              >
                {career?.tier}
              </strong>
            </div>
            <p class="career-result-caption">{caption}</p>
            <table
              class="career-result-table"
              aria-label={
                result ? `第 ${result.number} 期八场联赛成绩` : "三场定段赛成绩"
              }
            >
              <thead>
                <tr>
                  <th scope="col">场次</th>
                  <th scope="col">顺位</th>
                  <th scope="col">得点</th>
                  <th scope="col">成绩</th>
                </tr>
              </thead>
              <tbody id="career-result-rows">
                {matches.map((match, index) => (
                  <tr key={match.matchId}>
                    <td>
                      第
                      {["一", "二", "三", "四", "五", "六", "七", "八"][index]}
                      场
                    </td>
                    <td>{match.rank}位</td>
                    <td>{match.score}</td>
                    <td>{pointsText(match.points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p class="career-result-sum">
              合计{" "}
              <strong id="career-result-total">{pointsText(total)} pt</strong>
            </p>
            <div class="career-result-actions">
              <button
                id="career-result-back"
                type="button"
                disabled={busy}
                onClick={onBack}
              >
                <span data-career-brush="">返回大厅</span>
              </button>
              <button
                id="career-result-start"
                class="career-result-primary"
                type="button"
                disabled={busy}
                onClick={onStart}
              >
                <span data-career-brush="">{labels.action}</span>
                <span aria-hidden="true">›</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }
}
