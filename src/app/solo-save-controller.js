import { appendMahjongSoloAction, MAHJONG_SOLO_CHECKPOINT_VERSION, MAHJONG_SOLO_ENGINE_CHECKPOINT_VERSION, setMahjongSoloCheckpoint } from "../game/replay/solo-save.js";
import { clearMahjongSoloSave, writeMahjongSoloSave } from "../storage/solo-save.js";

/** Keeps local-match persistence separate from the action and UI lifecycles. */
export function createMahjongSoloSaveController({
  initialSave,
  writeSave = writeMahjongSoloSave,
  clearSave = clearMahjongSoloSave,
  humanId,
  getThemeController,
  saveCompletedPaipu,
}) {
  let save = initialSave;
  let saveGeneration = 0;
  const pendingEvaluations = new Map();

  function get() {
    return save;
  }

  function set(next) {
    if (save?.matchId !== next?.matchId) saveGeneration += 1;
    save = next;
  }

  function write(next = save, state, evaluation) {
    set(next);
    if (next) return writeSave(next, state, evaluation);
  }

  function clear() {
    saveGeneration += 1;
    clearSave();
    save = null;
  }

  function deferEvaluation(evaluation, matchId, generation) {
    const task = Promise.resolve(evaluation)
      .catch(() => ({ unavailable: true }))
      .then((result) => {
        if (!result || saveGeneration !== generation || save?.matchId !== matchId) return;
        // Use the latest journal, never the older snapshot whose move was reviewed.
        return writeSave(save, undefined, result);
      })
      .catch((error) => console.warn("Mahjong decision evaluation could not be saved", error))
      .finally(() => pendingEvaluations.delete(task));
    pendingEvaluations.set(task, generation);
  }

  async function flushEvaluations() {
    const generation = saveGeneration;
    let pending;
    do {
      pending = [...pendingEvaluations].filter(([, owner]) => owner === generation).map(([task]) => task);
      await Promise.all(pending);
    } while (pending.length);
  }

  async function persistAcceptedAction(action, actorId, projection, game, evaluation) {
    let checkpointState;
    if (!save) return;
    let next = appendMahjongSoloAction(save, action, actorId);
    if (!next) return;
    const generation = saveGeneration;
    const deferredEvaluation = typeof evaluation?.then === "function" ? evaluation : null;
    if (deferredEvaluation) evaluation = null;
    if (projection?.state?.phase === "hand_ended" && game) {
      try {
        const snapshot = await game.checkpoint();
        checkpointState = snapshot.state;
        next =
          setMahjongSoloCheckpoint(next, {
            formatVersion: MAHJONG_SOLO_CHECKPOINT_VERSION,
            actionIndex: next.actions.length,
            state: snapshot.state,
            events: snapshot.events,
            engineVersion: MAHJONG_SOLO_ENGINE_CHECKPOINT_VERSION,
            stateVersion: snapshot.version,
          }) || next;
      } catch (error) {
        console.warn(
          "Mahjong save checkpoint failed; keeping the action log",
          error,
        );
      }
    }
    if (projection?.state?.matchEnded) {
      await flushEvaluations();
      if (deferredEvaluation) evaluation = await deferredEvaluation.catch(() => ({ unavailable: true }));
    }
    if (generation !== saveGeneration || save?.matchId !== next.matchId) return;
    await write(next, checkpointState, evaluation);
    if (deferredEvaluation && !projection?.state?.matchEnded)
      deferEvaluation(deferredEvaluation, next.matchId, generation);
    if (!projection?.state?.matchEnded || !game?.exportPaipu) return;
    try {
      const paipu = {
        ...(await game.exportPaipu()),
        viewerPlayerId: game.playerId || humanId,
      };
      const themeController = getThemeController?.();
      paipu.playerPresentations =
        save?.playerPresentations ||
        themeController?.getPaipuPlayerPresentations?.(
          paipu.players,
          paipu.viewerPlayerId,
        ) ||
        {};
      if (paipu.status === "completed") await saveCompletedPaipu?.(paipu);
    } catch (error) {
      console.warn("Mahjong paipu save failed", error);
    }
  }

  return { clear, get, persistAcceptedAction, flushEvaluations, set, write };
}
