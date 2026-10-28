import { ViewComponent } from "../shared/component.js";
import { Icon } from "../shared/Icon.jsx";
import { Tile, TileBack } from "./Tile.jsx";
import { ClaimGroup } from "./ClaimGroup.jsx";
import { CLAIM_LABELS } from "../../game/rules/constants.js";
import {
  asArray,
  canDiscardHandTile,
  confirmedTenpaiSummary,
  doraTypeCounts,
  isRedFive,
  orderedHand,
  partitionClaimActions,
  tileFace,
  tileType,
} from "../../game/rules/game-format.js";

export class ActionCountdown extends ViewComponent {
  state = { seconds: 0, visible: false };
  render() {
    return (
      <span
        ref={this.bind}
        id="action-countdown"
        class={`action-countdown${this.state.seconds <= 5 ? " is-urgent" : ""}`}
        aria-live="off"
        hidden={!this.state.visible}
      >
        {this.state.seconds}
      </span>
    );
  }
}

export class PlayerDock extends ViewComponent {
  state = {
    game: null,
    selectedTileId: 0,
    viewerSeat: 1,
    isSpectator: false,
    riichiMode: false,
    showHints: true,
    readOnly: false,
    confirmedTenpai: null,
    tenpaiPreview: null,
    actionInFlight: false,
  };
  pointerId = 0;
  startPreview = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    this.pointerId = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    this.state.onPreviewStart?.(event.pointerId);
  };
  endPreview = (event) => {
    if (
      !this.pointerId ||
      (event?.pointerId && event.pointerId !== this.pointerId)
    )
      return;
    this.pointerId = 0;
    this.state.onPreviewEnd?.(event?.pointerId || 0);
  };
  render() {
    const {
      game,
      selectedTileId,
      viewerSeat,
      isSpectator,
      riichiMode,
      showHints,
      readOnly,
      confirmedTenpai,
      tenpaiPreview,
      actionInFlight,
      onAction,
      onSelectTile,
      onDiscardTile,
      onRiichi,
      onCancelRiichi,
    } = this.state;
    const legal = game?.legalActions || {};
    const context = game && {
      ...game,
      viewerSeat,
      viewerPlayerId: isSpectator
        ? ""
        : game.viewerPlayerId || game.players?.[viewerSeat - 1] || "",
    };
    const tenpai = game && confirmedTenpaiSummary(context, confirmedTenpai);
    const preview =
      showHints && tenpaiPreview?.waits && game
        ? confirmedTenpaiSummary(context, tenpaiPreview)
        : null;
    const dora = game ? doraTypeCounts(game) : new Map();
    const available = !!game && !readOnly && !actionInFlight;
    const normal = available && !riichiMode;
    const claims = asArray(legal.claims);
    const grouped = partitionClaimActions(claims);
    const showTenpai = showHints && tenpai?.waits.length > 0;
    const furiten = showTenpai ? tenpai.furiten : game?.furiten;
    const hint = !game
      ? "等待其他玩家"
      : readOnly
        ? ""
        : actionInFlight
          ? "等待其他玩家"
          : riichiMode
            ? "选择一张牌宣言立直"
            : claims.length
              ? "有人打出了你需要的牌"
              : legal.canDiscard
                ? "向上拖动手牌，进入出牌区后松手打出"
                : game.phase === "hand_ended"
                  ? "本局已结束"
                  : "等待其他玩家";
    const riichiTiles = new Set(asArray(legal.riichiTiles).map(Number));
    const forbidden = new Set(asArray(legal.forbiddenDiscardTypes));
    const declared = game?.riichi?.[game.players?.[viewerSeat - 1]] === true;
    const pressedPreview = {
      onPointerDown: this.startPreview,
      onPointerUp: this.endPreview,
      onPointerCancel: this.endPreview,
      onLostPointerCapture: this.endPreview,
    };
    return (
      <section
        ref={this.bind}
        id="player-dock"
        class="player-dock"
        aria-label="你的手牌与操作"
      >
        <aside
          id="tenpai-preview"
          class="tenpai-preview"
          aria-label="打出后听牌"
          aria-live="polite"
          hidden={!preview?.waits.length}
        >
          <div
            id="tenpai-waits"
            class="tenpai-wait-list"
            style={{
              "--tenpai-wait-columns": String(
                Math.min(7, preview?.waits.length || 0),
              ),
            }}
          >
            {preview?.waits.map((wait) => (
              <span
                key={wait.type}
                class="tenpai-wait"
                aria-label={`${tileFace(wait.type).label}，剩余 ${wait.remaining} 张${wait.noYaku ? "，荣和无役" : ""}`}
              >
                {wait.noYaku && (
                  <small class="tenpai-no-yaku" aria-hidden="true">
                    无役
                  </small>
                )}
                <Tile
                  type={wait.type}
                  size="tenpai-wait"
                  dora={dora.has(wait.type)}
                  aria-hidden="true"
                />
                <small
                  class={`tenpai-wait-count${wait.remaining === 0 ? " is-empty" : ""}`}
                >
                  {wait.remaining} 张
                </small>
              </span>
            ))}
          </div>
          <span
            id="tenpai-furiten-badge"
            class="tenpai-furiten-badge"
            aria-hidden="true"
            hidden={!preview?.waits.length || !preview.furiten}
          >
            振听
          </span>
        </aside>
        <div id="action-bar" class="action-bar" aria-live="polite">
          <span id="action-hint">{hint}</span>
          <button
            id="abort-button"
            class="secondary-action"
            type="button"
            hidden={!normal || !legal.canAbortNine}
          >
            流局
          </button>
          <div id="claim-actions" class="claim-actions" hidden={!available}>
            {normal &&
              ["chi", "pon"].map(
                (kind) =>
                  grouped[kind].length > 0 && (
                    <ClaimGroup
                      key={kind}
                      kind={kind}
                      claims={grouped[kind]}
                      onAction={onAction}
                      showHints={showHints}
                      dora={dora}
                    />
                  ),
              )}
            {normal &&
              grouped.immediate.map((claim) => (
                <button
                  key={claim.option}
                  type="button"
                  class={`claim-action claim-${claim.kind}`}
                  onClick={() =>
                    onAction?.({ type: "claim", option: claim.option })
                  }
                >
                  {CLAIM_LABELS[claim.kind] ?? claim.kind}
                </button>
              ))}
            {normal &&
              asArray(legal.selfKans).map((kan, index) => (
                <button
                  key={`kan-${index}`}
                  type="button"
                  class="claim-action claim-kan"
                  onClick={() =>
                    onAction?.({
                      type: "kan",
                      kind: kan.kind,
                      tileType: kan.tileType,
                    })
                  }
                >
                  {CLAIM_LABELS[kan.kind] ?? "杠"}
                </button>
              ))}
          </div>
          <button
            id="riichi-button"
            class="gold-action"
            type="button"
            hidden={!normal || !legal.canRiichi}
            onClick={onRiichi}
          >
            立直
          </button>
          <button
            id="tsumo-button"
            class="win-action"
            type="button"
            hidden={!normal || !legal.canTsumo}
          >
            自摸
          </button>
          <button
            id="pass-button"
            class="secondary-action"
            type="button"
            hidden={!normal || !claims.length}
          >
            跳过
          </button>
          <button
            id="cancel-riichi-button"
            class="riichi-cancel-action"
            type="button"
            aria-label="取消立直"
            title="取消立直"
            hidden={!available || !riichiMode}
            onClick={onCancelRiichi}
          >
            <Icon name="x" />
          </button>
          <button
            id="tenpai-count-badge"
            class="tenpai-status-badge tenpai-count-badge"
            type="button"
            hidden={!normal || !showTenpai || furiten}
            aria-label={`按住查看听牌：${tenpai?.total ?? 0} 张`}
            {...pressedPreview}
          >
            {tenpai?.total ?? 0} 张
          </button>
          <button
            id="furiten-badge"
            class="tenpai-status-badge furiten-badge"
            type="button"
            hidden={!normal || !showHints || !furiten}
            aria-label={
              showTenpai ? "按住查看振听听牌" : "振听：不能荣和，但仍可自摸"
            }
            {...pressedPreview}
          >
            振听
          </button>
        </div>
        <ActionCountdown />
        <div
          id="hand-bottom"
          class="own-hand"
          role="listbox"
          aria-label="你的手牌"
        >
          {isSpectator
            ? Array.from(
                {
                  length:
                    Number(
                      game?.handCounts?.[game.players?.[viewerSeat - 1]],
                    ) || 0,
                },
                (_, index) => <TileBack key={index} />,
              )
            : orderedHand(game?.ownHand, game?.drawnTile).map((tileId) => {
                const discardable =
                  canDiscardHandTile({
                    canDiscard: legal.canDiscard,
                    riichiDeclared: declared,
                    drawnTile: game.drawnTile,
                    tileId,
                  }) &&
                  !forbidden.has(tileType(tileId)) &&
                  (!riichiMode || riichiTiles.has(tileId));
                const classes = [
                  tileId === selectedTileId && "is-selected",
                  showHints &&
                    tileId !== selectedTileId &&
                    selectedTileId > 0 &&
                    tileType(tileId) === tileType(selectedTileId) &&
                    "is-type-match",
                  tileId === Number(game.drawnTile) && "is-drawn",
                  !readOnly &&
                    riichiMode &&
                    (riichiTiles.has(tileId)
                      ? "is-riichi-choice"
                      : "is-riichi-blocked"),
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <Tile
                    key={tileId}
                    type={tileType(tileId)}
                    red={isRedFive(tileId)}
                    size="hand"
                    data-tile-id={tileId}
                    role="option"
                    class={classes}
                    aria-selected={String(tileId === selectedTileId)}
                    aria-disabled={String(!readOnly && !discardable)}
                    onClick={
                      readOnly ? undefined : () => onSelectTile?.(tileId)
                    }
                    onDblClick={
                      discardable && !readOnly
                        ? () => onDiscardTile?.(tileId)
                        : undefined
                    }
                  />
                );
              })}
        </div>
      </section>
    );
  }
}
