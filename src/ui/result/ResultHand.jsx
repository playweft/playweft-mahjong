import { Tile } from "../table/Tile.jsx";
import { asArray } from "../../game/rules/game-format.js";
import {
  meldDisplayLayout,
  TILE_SIZE,
  MELD_SCALE,
  MELD_SIDEWAYS_BOTTOM_INSET,
} from "../../render/three-layout.js";

export function ResultMeld({ meld, winnerIndex, dora }) {
  const display = meldDisplayLayout(meld, winnerIndex);
  const extent = TILE_SIZE.width * MELD_SCALE;
  const scale = 33 / extent;
  const height = display.entries.reduce(
    (max, tile) =>
      Math.max(
        max,
        (tile.inward - (tile.sideways ? MELD_SIDEWAYS_BOTTOM_INSET : 0)) *
          scale +
          (tile.sideways ? 33 : 47),
      ),
    47,
  );
  return (
    <span
      class="result-meld"
      style={{
        "--result-meld-width": `${display.span * scale + 3}px`,
        "--result-meld-height": `${height}px`,
      }}
    >
      {display.entries.map((tile, index) => (
        <Tile
          key={index}
          type={tile.type}
          red={tile.red}
          size="result"
          dora={!tile.faceDown && dora?.has(tile.type)}
          class={[
            tile.sideways && "is-sideways",
            tile.faceDown && "is-face-down",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label={tile.faceDown ? "暗杠牌背" : undefined}
          style={{
            "--result-meld-x": `${(display.span - tile.along - extent / 2) * scale + 1.5}px`,
            "--result-meld-inward": `${(tile.inward - (tile.sideways ? MELD_SIDEWAYS_BOTTOM_INSET : 0)) * scale}px`,
          }}
        />
      ))}
    </span>
  );
}
export function ResultHand({ game, winnerIndex, dora }) {
  const playerId = game.players?.[winnerIndex - 1];
  return (
    <section class="result-hand">
      <div class="result-hand-tiles">
        {asArray(game.revealedHands?.[playerId]).map((value, index) => {
          const tile =
            value && typeof value === "object"
              ? value
              : { type: Number(value) };
          return (
            <Tile
              key={index}
              type={Number(tile.type)}
              red={tile.red === true}
              size="result"
              dora={dora?.has(Number(tile.type))}
            />
          );
        })}
        {Number(game.winningTile) > 0 && (
          <Tile
            type={Number(game.winningTile)}
            red={game.winningTileRed === true}
            size="result"
            dora={dora?.has(Number(game.winningTile))}
            class="is-winning-tile"
          />
        )}
        {asArray(game.melds?.[playerId])
          .slice()
          .reverse()
          .map((meld, index) => (
            <ResultMeld
              key={index}
              meld={meld}
              winnerIndex={winnerIndex}
              dora={dora}
            />
          ))}
      </div>
    </section>
  );
}
