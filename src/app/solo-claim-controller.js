import { createMahjongClaimPacing } from "../game/rules/claim-pacing.js";

function windowKey(state) {
  return JSON.stringify([
    state?.players, state?.roundWind, state?.handNumber, state?.honba,
    state?.moveCount, state?.pendingDiscard, state?.lastDiscard,
  ]);
}

/** One discard window: decisions share a snapshot; recognition and thinking overlap. */
export function createMahjongSoloClaimController({
  humanId, getGame, getState, isActive, persistAcceptedAction, refreshProjection,
  onHumanAccepted, onError, onSettled, afterDiscardContact,
  random = Math.random,
  setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimer = (timer) => globalThis.clearTimeout(timer),
} = {}) {
  let current = null;
  const owns = (round) => current === round && isActive() && getGame() === round.game;

  function cancel() {
    const round = current;
    current = null;
    if (!round) return;
    round.pacing.cancel();
    round.intent?.resolve(false);
    round.intent = null;
  }

  function ensure() {
    const state = getState();
    const game = getGame();
    if (!isActive() || state?.phase !== "claiming" || !game?.aiClaimDecisions || !game?.claimResponse) {
      cancel();
      return null;
    }
    const key = windowKey(state);
    if (current?.game === game && current.key === key) return current;
    cancel();
    const round = current = {
      key, game, state, ready: false, pendingAi: null, version: null,
      intent: null, committing: false, failed: false,
    };
    // Start all AI work before waiting for the visible tile to land.
    void Promise.resolve().then(() => game.aiClaimDecisions(humanId)).then((plan) => {
      if (!owns(round)) return;
      if (plan?.status !== "claiming" || !Number.isSafeInteger(plan.version))
        throw new Error("Invalid Mahjong claim decisions");
      round.version = plan.version;
      round.human = plan.human;
      round.pendingAi = Array.isArray(plan.decisions) ? plan.decisions : Object.values(plan.decisions ?? {});
      flush(round);
    }).catch((error) => fail(round, error));
    round.pacing = createMahjongClaimPacing({ state, afterDiscardContact, random, setTimer, clearTimer });
    void round.pacing.ready.then(() => {
      if (!owns(round)) return;
      round.ready = true;
      flush(round);
    });
    return round;
  }

  function respond(action, actionOptions) {
    const round = ensure();
    if (!round || round.failed || round.intent || round.committing) return Promise.resolve(false);
    const claims = getState()?.legalActions?.claims;
    const options = Array.isArray(claims) ? claims : [];
    const selected = action.type === "claim" ? options.find((option) => option.option === action.option) : null;
    if (!options.length || (action.type !== "pass" && !selected)) return Promise.resolve(false);
    return new Promise((resolve) => {
      round.intent = {
        actorId: humanId, action, actionOptions, resolve,
      };
      flush(round);
    });
  }

  function flush(round) {
    if (!owns(round) || round.failed || round.committing || round.pendingAi === null) return;
    if (getState()?.phase !== "claiming" || windowKey(getState()) !== round.key) {
      cancel();
      return;
    }
    const hasAiClaim = round.pendingAi.some((decision) => decision.action?.type === "claim");
    if (hasAiClaim && !round.ready) return;
    if (!round.pendingAi.length && !round.intent) return;
    void commit(round);
  }

  async function commit(round) {
    round.committing = true;
    const intent = round.intent;
    if (intent) {
      const options = Array.isArray(round.human?.options) ? round.human.options : Object.values(round.human?.options ?? {});
      intent.priority = intent.action.type === "pass" ? 0 : options.find((option) => option.option === intent.action.option)?.priority ?? 0;
      intent.distance = round.human?.distance ?? 0;
    }
    const responses = [...round.pendingAi, ...(intent ? [intent] : [])].sort(
      (left, right) => right.priority - left.priority || left.distance - right.distance,
    );
    round.pendingAi = [];
    let projection;
    let presentedProjection;
    let humanAccepted = false;
    try {
      for (const response of responses) {
        if (!owns(round)) break;
        const outcome = await round.game.claimResponse(response.action, response.actorId, round.version, humanId,
          response === intent ? intent.actionOptions : undefined);
        if (getGame() !== round.game) return;
        if (!outcome?.result?.accepted && !outcome?.result?.skipped)
          throw new Error(`Mahjong claim response rejected: ${outcome?.result?.error?.code ?? "unknown"}`);
        round.version = outcome.result.version;
        projection = outcome.projection;
        if (!outcome.result.accepted) continue;
        let feedbackError;
        if (response === intent && typeof outcome.careerAnalysis?.then === "function" && projection?.state?.matchEnded) {
          try {
            onHumanAccepted?.(intent.action, projection);
            await refreshProjection?.(projection);
            presentedProjection = projection;
          } catch (error) {
            feedbackError = error;
          }
        }
        await persistAcceptedAction?.(response.action, response.actorId, projection, round.game, outcome.careerAnalysis);
        if (feedbackError) throw feedbackError;
        if (response === intent) humanAccepted = true;
      }
      if (intent && round.intent === intent) round.intent = null;
      if (humanAccepted && projection !== presentedProjection) onHumanAccepted?.(intent.action, projection);
      if (projection && projection !== presentedProjection && getGame() === round.game) await refreshProjection?.(projection);
      intent?.resolve(owns(round));
    } catch (error) {
      intent?.resolve(false);
      fail(round, error);
    } finally {
      round.committing = false;
      if (owns(round) && !round.failed) onSettled?.();
    }
  }

  function fail(round, error) {
    if (!owns(round)) return;
    round.failed = true;
    round.intent?.resolve(false);
    round.intent = null;
    round.pacing.cancel();
    onError?.(error);
  }

  return {
    ensure, respond, cancel,
    isBusy: () => Boolean(current?.committing || current?.intent),
  };
}
