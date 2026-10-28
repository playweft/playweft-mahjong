import { ViewComponent } from "../shared/component.js";

export class MatchSummary extends ViewComponent {
  state = {
    visible: false,
    room: false,
    rows: [],
    portraitSource: "",
    portraitPosition: "0% 0%",
    portraitLoaded: false,
  };
  render() {
    const {
      visible,
      room,
      rows,
      portraitSource,
      portraitPosition,
      portraitLoaded,
    } = this.state;
    return (
      <section
        ref={this.bind}
        id="match-summary"
        class="match-summary"
        aria-label="最终排名"
        hidden={!visible}
      >
        <div class="match-summary-layout">
          <div class="match-summary-photo" aria-hidden="true">
            <div
              id="match-summary-photo-crop"
              class={`match-summary-photo-crop${portraitLoaded && portraitSource ? " is-custom" : ""}`}
              style={{ "--match-summary-portrait-position": portraitPosition }}
            >
              <img
                id="match-summary-photo-image"
                alt=""
                src={portraitSource || undefined}
                data-source={portraitSource || undefined}
                hidden={!portraitLoaded || !portraitSource}
                onLoad={() => {
                  if (this.state.portraitSource === portraitSource)
                    this.update({ portraitLoaded: true });
                }}
                onError={() => {
                  if (this.state.portraitSource === portraitSource)
                    this.update({ portraitSource: "", portraitLoaded: false });
                }}
              />
            </div>
          </div>
          <table class="match-summary-table" aria-label="最终分数">
            <tbody id="match-summary-rows">
              {rows.map((entry) => (
                <tr key={entry.seat}>
                  <td>{entry.rank}位</td>
                  <td>{entry.name}</td>
                  <td>{entry.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div class="match-summary-actions">
            <button id="match-summary-rematch" type="button">
              再来一局
            </button>
            <button id="match-summary-setup" type="button" hidden={room}>
              返回大厅
            </button>
          </div>
        </div>
      </section>
    );
  }
}
