import { ViewComponent } from "../shared/component.js";
import { asArray, tileFace } from "../../game/rules/game-format.js";
import { traditionalDrawReason } from "../../game/rules/yaku-display.js";
import { mahjongCanonicalSeatForPresentation } from "../../game/rules/seat-order.js";
import { Tile } from "./Tile.jsx";

export class DrawReveal extends ViewComponent {
  state = { game: null, visible: false, viewerSeat: 1 };
  render() {
    const { game, visible, viewerSeat } = this.state;
    const abortive = game?.result?.abortive === true;
    const exhaustive =
      game?.phase === "hand_ended" && game.draw === true && !abortive;
    return (
      <section
        ref={this.bind}
        id="draw-reveal"
        class="draw-reveal"
        aria-live="assertive"
        hidden={
          !visible || (!abortive && !exhaustive && game?.winType !== "nagashi")
        }
      >
        <div class="draw-reveal-card">
          {[
            ["top", 3],
            ["right", 2],
            ["bottom", 1],
            ["left", 4],
          ].map(([position, seat]) => {
            const waits = exhaustive
              ? asArray(
                  asArray(game.result?.tenpaiWaits)[
                    mahjongCanonicalSeatForPresentation(seat, viewerSeat) - 1
                  ],
                ).map(Number)
              : [];
            return (
              <span
                key={position}
                class={`draw-reveal-tenpai draw-reveal-tenpai-${position}`}
                data-draw-tenpai-seat={seat}
                hidden={!waits.length}
                aria-label={
                  waits.length
                    ? `听牌：${waits.map((type) => tileFace(type).label).join("、")}`
                    : undefined
                }
              >
                {waits.map((type, index) => (
                  <Tile
                    key={index}
                    type={type}
                    size="draw-reveal-wait"
                    aria-hidden="true"
                  />
                ))}
              </span>
            );
          })}
          <strong id="draw-reveal-reason">
            {traditionalDrawReason(
              abortive
                ? game.abortiveReason || game.result?.reason || "途中流局"
                : "荒牌流局",
            )}
          </strong>
        </div>
      </section>
    );
  }
}
