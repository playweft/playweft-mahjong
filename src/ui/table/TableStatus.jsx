import { ViewComponent } from "../shared/component.js";
import {
  doraIndicatorSlots,
  tileFace,
  tileType,
} from "../../game/rules/game-format.js";
import { Tile, TileBack } from "./Tile.jsx";

export class TableStatus extends ViewComponent {
  state = { game: null, selectedTileId: 0, showHints: true };
  render() {
    const { game, selectedTileId, showHints } = this.state;
    return (
      <div
        ref={this.bind}
        id="table-status"
        class="table-status-stack"
        aria-live="polite"
      >
        <div class="table-status-semantic">
          <div id="dora-list" class="dora-list" aria-label="宝牌指示牌">
            {game &&
              doraIndicatorSlots(game).map((indicator, index) =>
                indicator ? (
                  <Tile
                    key={index}
                    type={indicator.type}
                    red={indicator.red}
                    size="dora"
                    data-slot={index + 1}
                    class={`dora-slot is-revealed${showHints && tileType(selectedTileId) === indicator.type ? " is-type-match" : ""}`}
                    aria-label={`第 ${index + 1} 张宝牌指示牌：${tileFace(indicator.type).label}`}
                  />
                ) : (
                  <TileBack
                    key={index}
                    class="mahjong-tile tile-back dora-slot is-concealed"
                    data-slot={index + 1}
                    aria-hidden={null}
                    aria-label={`第 ${index + 1} 张宝牌指示牌尚未翻开`}
                  />
                ),
              )}
          </div>
          <div id="match-counter" class="match-counter">
            <span>
              本场 <b id="honba-count">{Number(game?.honba) || 0}</b>
            </span>
            <span>
              供托{" "}
              <b id="riichi-stick-count">{Number(game?.riichiSticks) || 0}</b>
            </span>
          </div>
        </div>
        <span class="match-type-label">
          {game?.matchType === "hanchan" ? "四人南" : "四人東"}
        </span>
      </div>
    );
  }
}
