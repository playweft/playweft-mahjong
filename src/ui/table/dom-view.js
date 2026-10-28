import { PLAYERS, POSITIONS } from "../../game/rules/constants.js";
import {
  activeSeat,
  asArray,
  eventMessage,
  playerDisplayName,
  roundLabel,
} from "../../game/rules/game-format.js";
import { mahjongPresentationSeat } from "../../game/rules/seat-order.js";
import { collectElements } from "./elements.js";
import { viewFor } from "../shared/component.js";

/** Publishes immutable UI snapshots. Components own all table markup and events. */
export class MahjongDomView {
  constructor({
    onAction,
    onSelectTile,
    onDiscardTile,
    onTenpaiPreviewStart,
    onTenpaiPreviewEnd,
  }) {
    this.elements = collectElements();
    this.scene = viewFor(document.querySelector("#table-scene"));
    this.status = viewFor(document.querySelector("#table-status"));
    this.dock = viewFor(document.querySelector("#player-dock"));
    this.result = viewFor(this.elements.result);
    this.drawReveal = viewFor(this.elements.drawReveal);
    this.countdown = viewFor(this.elements.countdown);
    this.dock.update({
      onAction,
      onSelectTile,
      onDiscardTile,
      onPreviewStart: onTenpaiPreviewStart,
      onPreviewEnd: onTenpaiPreviewEnd,
    });
    this.viewerSeat = 1;
    this.lastEventKey = "";
    this.names = {};
    this.portraits = {};
    this.countdownTimer = 0;
  }

  render(state, events, selectedTileId, playerName, options = {}) {
    const {
      showResult = true,
      showDrawReveal = false,
      preserveResult = false,
      resultPage = 0,
      resultPageReady = false,
      riichiMode = false,
      showGameHints = true,
      hideCountdown = false,
      readOnly = false,
      confirmedTenpai = null,
      tenpaiPreview = null,
      defaultNames = {},
      playerNameIsAuthoritative = false,
      serverTime = 0,
      viewerSeat = 1,
      isSpectator = false,
      actionInFlight = false,
    } = options;
    this.viewerSeat = Number(viewerSeat) || 1;
    this.isSpectator = isSpectator === true;
    this.showGameHints = showGameHints;
    this.readOnly = readOnly;
    this.game = state;
    for (let seat = 1; seat <= 4; seat += 1) {
      const position =
        POSITIONS[mahjongPresentationSeat(seat, this.viewerSeat) - 1];
      const stateName = state.playerNames?.[seat - 1];
      const slot = {
        bottom: "self",
        right: "right",
        top: "opposite",
        left: "left",
      }[position];
      this.names[position] =
        !isSpectator && seat === this.viewerSeat && playerNameIsAuthoritative
          ? playerName
          : stateName && stateName !== PLAYERS[seat - 1].name
            ? stateName
            : defaultNames[slot] ||
              stateName ||
              PLAYERS[seat - 1].name ||
              "玩家";
    }
    const currentRound = roundLabel(state.roundWind, state.handNumber);
    let { heading, message } = this.scene.state;
    if (state.phase !== "hand_ended") {
      const seat = activeSeat(state);
      const name = playerDisplayName(state, seat, {
        playerName,
        defaultNames,
        playerNameIsAuthoritative,
        viewerSeat,
      });
      const viewerTurn = !isSpectator && seat === this.viewerSeat;
      heading =
        state.phase === "claiming"
          ? viewerTurn
            ? "可以鸣牌"
            : seat > 0
              ? `${name} 正在考虑`
              : "等待其他玩家确认"
          : viewerTurn
            ? "轮到你出牌"
            : `${name} 的回合`;
      const event = [...events]
        .reverse()
        .find((item) => item.type !== "claim_passed");
      const key = event ? JSON.stringify(event) : "";
      if (event && key !== this.lastEventKey) {
        this.lastEventKey = key;
        message = eventMessage(state, event, playerName, {
          defaultNames,
          playerNameIsAuthoritative,
          viewerSeat,
        });
      } else if (!event)
        message =
          showGameHints && state.furiten
            ? "振听中：不能荣和，但仍可自摸"
            : "一番缚 · 赤宝牌各一枚";
    }
    this.scene.update({
      game: state,
      events,
      viewerSeat,
      isSpectator,
      round: currentRound,
      heading,
      message,
      names: { ...this.names },
    });
    this.status.update({
      game: state,
      selectedTileId,
      showHints: showGameHints,
    });
    this.dock.update({
      game: state,
      selectedTileId,
      viewerSeat,
      isSpectator,
      riichiMode,
      showHints: showGameHints,
      readOnly,
      confirmedTenpai,
      tenpaiPreview,
      actionInFlight,
    });
    this.drawReveal.update({
      game: state,
      visible: showDrawReveal,
      viewerSeat,
    });
    this.renderCountdown(state, serverTime, { hidden: hideCountdown });
    if (!preserveResult)
      this.renderResult(state, playerName, showResult, resultPage, {
        resultPageReady,
      });
  }

  renderSelection(
    state,
    selectedTileId,
    playerName,
    {
      riichiMode = false,
      showGameHints = true,
      tenpaiPreview = null,
      readOnly = this.readOnly,
    } = {},
  ) {
    this.readOnly = readOnly;
    this.showGameHints = showGameHints;
    this.dock.update({
      selectedTileId,
      riichiMode,
      showHints: showGameHints,
      tenpaiPreview,
      readOnly,
    });
    this.status.update({ selectedTileId, showHints: showGameHints });
    return this.visualUi(playerName, selectedTileId);
  }

  visualUi(playerName, selectedTileId) {
    return {
      selectedTileId,
      playerName,
      roundLabel: this.scene.state.round,
      heading: this.scene.state.heading,
      message: this.scene.state.message,
    };
  }

  renderResult(
    state,
    playerName,
    showResult = true,
    page = 0,
    { resultPageReady = false } = {},
  ) {
    this.result.update({
      game: state,
      showResult,
      page,
      pageReady: resultPageReady,
    });
  }

  setMatchSummary(patch) {
    if (patch.visible !== undefined)
      this.result.update({ summaryVisible: patch.visible });
    const view = viewFor(this.elements.matchSummary);
    if (
      patch.portraitSource !== undefined &&
      patch.portraitSource !== view.state.portraitSource
    )
      patch = { ...patch, portraitLoaded: false };
    view.update(patch);
  }

  commitPlayerPortrait(position, source, builtinCharacterId = "") {
    this.portraits[position] = {
      source: typeof source === "string" ? source : "",
      builtinCharacterId,
    };
    this.scene.update({ portraits: { ...this.portraits } });
  }

  applyPlayerIdentityState({
    portraits = {},
    names = {},
    fallbackPortraits = {},
    builtinCharacters = {},
  } = {}) {
    const request = {};
    this.pendingPlayerIdentityState = request;
    const positions = Object.keys(portraits);
    return Promise.all(
      positions.map((position) =>
        !portraits[position]
          ? true
          : new Promise((resolve) => {
              const preload = new Image();
              preload.onload = () => resolve(true);
              preload.onerror = () => resolve(false);
              preload.src = portraits[position];
            }),
      ),
    ).then((loaded) => {
      if (this.pendingPlayerIdentityState !== request) return false;
      for (const [index, position] of positions.entries()) {
        this.portraits[position] = {
          source: loaded[index]
            ? portraits[position]
            : fallbackPortraits[position] || "",
          builtinCharacterId: builtinCharacters[position] || "",
        };
        if (typeof names[position] === "string" && names[position])
          this.names[position] = names[position];
      }
      this.scene.update({
        portraits: { ...this.portraits },
        names: { ...this.names },
      });
      return true;
    });
  }

  renderCountdown(state, serverTime, { hidden = false } = {}) {
    const deadline = Number(state?.turnDeadlineAt),
      synced = Number(serverTime);
    if (
      !Number.isFinite(deadline) ||
      deadline <= 0 ||
      !Number.isFinite(synced) ||
      synced <= 0 ||
      hidden ||
      state?.phase === "hand_ended"
    ) {
      this.stopCountdown();
      return;
    }
    if (
      this.countdownDeadlineAt !== deadline ||
      this.countdownServerTime !== synced
    ) {
      this.countdownDeadlineAt = deadline;
      this.countdownServerTime = synced;
      this.countdownLocalTime = Date.now();
    }
    this.updateCountdown();
    if (!this.countdownTimer)
      this.countdownTimer = globalThis.setInterval(
        () => this.updateCountdown(),
        250,
      );
  }
  updateCountdown() {
    if (!this.countdownDeadlineAt || !this.countdownServerTime) return;
    const seconds = Math.ceil(
      Math.max(
        0,
        this.countdownDeadlineAt -
          this.countdownServerTime -
          (Date.now() - this.countdownLocalTime),
      ) / 1000,
    );
    this.countdown.update({ seconds, visible: true });
  }
  stopCountdown() {
    if (this.countdownTimer) globalThis.clearInterval(this.countdownTimer);
    this.countdownTimer =
      this.countdownDeadlineAt =
      this.countdownServerTime =
      this.countdownLocalTime =
        0;
    this.countdown.update({ visible: false });
  }
}
