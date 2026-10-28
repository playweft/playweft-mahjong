import { ViewComponent } from "../shared/component.js";
import { Tile, TileBack } from "./Tile.jsx";
import { DrawReveal } from "./DrawReveal.jsx";
import {
  CLAIM_LABELS,
  PLAYERS,
  POSITIONS,
} from "../../game/rules/constants.js";
import {
  activeSeat,
  asArray,
  pendingClaimDiscard,
  riverDisplayEntries,
} from "../../game/rules/game-format.js";
import { mahjongPresentationSeat } from "../../game/rules/seat-order.js";
import { getMahjongBuiltinCharacterPosition } from "../settings/theme/builtin-characters.js";

export class TableScene extends ViewComponent {
  state = {
    game: null,
    events: [],
    viewerSeat: 1,
    isSpectator: false,
    names: {},
    portraits: {},
    round: "东一局",
    heading: "正在载入规则",
    message: "正在准备牌桌…",
  };
  render() {
    const {
      game,
      events,
      viewerSeat,
      isSpectator,
      names,
      portraits,
      round,
      heading,
      message,
    } = this.state;
    const players = game?.players || PLAYERS.map((player) => player.id);
    const seats = players.map((playerId, index) => ({
      playerId,
      seat: index + 1,
      position: POSITIONS[mahjongPresentationSeat(index + 1, viewerSeat) - 1],
    }));
    const pending = game && pendingClaimDiscard(game);
    const latest = [...events]
      .reverse()
      .find((event) => event.type === "discarded");
    const active = (seat) =>
      game && activeSeat(game) === seat && game.phase !== "hand_ended";
    return (
      <section
        ref={this.bind}
        id="table-scene"
        class="table-shell"
        aria-label="四人麻将牌桌"
      >
        <div class="table-rim" aria-hidden="true" />
        <div class="table-surface">
          {/* Three.js owns the contents of this stable host. */}
          <div id="mahjong-stage" class="mahjong-stage" />
          <DrawReveal />
          {seats
            .filter(({ seat }) => seat !== viewerSeat || isSpectator)
            .map(
              ({ position, playerId }) =>
                position !== "bottom" && (
                  <div
                    key={position}
                    id={`hand-${position}`}
                    class={`opponent-hand hand-${position}`}
                    aria-label={
                      { top: "上家手牌", right: "右家手牌", left: "左家手牌" }[
                        position
                      ]
                    }
                  >
                    {Array.from(
                      { length: Number(game?.handCounts?.[playerId]) || 0 },
                      (_, index) => (
                        <TileBack key={index} />
                      ),
                    )}
                  </div>
                ),
            )}
          {seats.map(({ position, playerId }) => (
            <div
              key={position}
              id={`meld-${position}`}
              class={`meld-area meld-${position}`}
            >
              {asArray(game?.melds?.[playerId]).map((meld, index) => (
                <div
                  key={index}
                  class={`meld-group meld-${meld.kind}`}
                  title={CLAIM_LABELS[meld.kind] ?? meld.kind}
                >
                  {asArray(meld.tiles).map((type, index) => (
                    <Tile key={index} type={type} size="meld" />
                  ))}
                </div>
              ))}
            </div>
          ))}
          {seats.map(({ seat, position, playerId }) => {
            const river = asArray(game?.discards?.[playerId]);
            return (
              <div
                key={position}
                id={`river-${position}`}
                class={`discard-river river-${position}`}
                aria-label={
                  {
                    top: "上家牌河",
                    right: "右家牌河",
                    left: "左家牌河",
                    bottom: "你的牌河",
                  }[position]
                }
              >
                {riverDisplayEntries(river).map(({ discard, sourceIndex }) => (
                  <Tile
                    key={sourceIndex}
                    type={discard.type}
                    size="river"
                    data-riichi={String(discard.riichi === true)}
                    class={`${latest?.playerIndex === seat && sourceIndex === river.length - 1 ? "is-latest " : ""}${pending?.playerIndex === seat && pending.discardIndex === sourceIndex + 1 ? "is-pending-claim" : ""}`.trim()}
                  />
                ))}
              </div>
            );
          })}
          {seats.map(({ seat, position, playerId }) => {
            const portrait = portraits[position] || {};
            const builtinPosition = getMahjongBuiltinCharacterPosition(
              portrait.builtinCharacterId,
            );
            return (
              <article
                key={position}
                id={`player-${position}`}
                class={`player-station player-${position}${active(seat) ? " is-active" : ""}${asArray(game?.winners).includes(playerId) ? " is-winner" : ""}`}
              >
                <div
                  class={`player-avatar${portrait.source ? "" : " is-default-portrait"}`}
                  data-player-avatar=""
                  aria-hidden="true"
                  data-source={portrait.source || undefined}
                  data-builtin-character={
                    !portrait.source && builtinPosition
                      ? portrait.builtinCharacterId
                      : undefined
                  }
                  style={
                    portrait.source
                      ? {
                          backgroundImage: `url(${JSON.stringify(portrait.source)})`,
                        }
                      : {
                          "--mahjong-default-portrait-position":
                            builtinPosition || undefined,
                        }
                  }
                />
                <span class="player-name" data-name="">
                  {names[position] ||
                    {
                      bottom: "你",
                      top: "雀士2",
                      right: "雀士1",
                      left: "雀士3",
                    }[position]}
                </span>
              </article>
            );
          })}
          <section class="table-console" aria-live="polite">
            {seats.map(({ seat, position }) => (
              <span
                key={position}
                class={`console-score score-${position}${active(seat) ? " is-active" : ""}`}
                data-console-score={
                  mahjongPresentationSeat(seat, viewerSeat) - 1
                }
              >
                {Number(game?.scores?.[seat - 1] ?? 25000)}
              </span>
            ))}
            <div class="console-core">
              <strong id="console-round">{round}</strong>
              <b id="wall-count">余牌 {game?.wallCount ?? 69}</b>
            </div>
            <div class="console-status">
              <strong id="turn-heading">{heading}</strong>
              <span id="table-message">{message}</span>
            </div>
          </section>
        </div>
      </section>
    );
  }
}
