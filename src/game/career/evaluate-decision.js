import { assessDecisionEvidence } from "./decision-evidence.js";

const tileKey = (id) => `${Math.floor((id - 1) / 4) + 1}:${[17, 53, 89].includes(id) ? "red" : "plain"}`;
const DECISIONS = ["discard", "riichi", "kan", "claim", "pass"];

function decisionKey(state, actorId, action) {
  if (action.type === "pass") return "pass";
  if (action.type === "kan") return `kan:${action.kind}:${action.tileType}`;
  if (action.type === "claim") {
    const claimants = Array.isArray(state.claimants) ? state.claimants : Object.values(state.claimants ?? {});
    const option = claimants.find((claimant) => claimant.playerId === actorId)?.options?.[action.option - 1];
    if (!option) return null;
    return `${option.kind}:${(option.tileIds ?? []).map(tileKey).sort().join(",")}`;
  }
  return `${action.type}:${tileKey(action.tileId)}`;
}

// Review the pre-action snapshot in a worker. The policy reads only the
// player's own hand and public evidence, not future wall tiles.
export function evaluateCareerDecision(game, action, actorId, snapshot) {
  if (!DECISIONS.includes(action.type)) return null;
  try {
    const state = snapshot ?? game.checkpoint().state;
    if (!["playing", "claiming"].includes(state.phase) ||
        (state.phase === "playing" && state.players[state.turnIndex - 1] !== actorId)) return null;
    const review = game.aiActionReview?.(state, actorId, action);
    if (!review || review.decisionCount <= 1) return null;
    const recommendation = review.bestAction;
    if (!DECISIONS.includes(recommendation?.type)) return { unavailable: true };
    const selectedKey = decisionKey(state, actorId, action);
    const recommendedKey = decisionKey(state, actorId, recommendation);
    if (!selectedKey || !recommendedKey) return { unavailable: true };
    const evidence = assessDecisionEvidence(review);
    if (!evidence) return { unavailable: true };
    const entries = Object.values(evidence.dimensions);
    const weight = entries.reduce((total, entry) => total + entry.confidence, 0);
    const quality = weight ? Math.round(100 - entries.reduce((total, entry) => total + entry.loss * entry.confidence, 0) / weight) : 80;
    return { eligible: true, agreed: selectedKey === recommendedKey,
      review: { ...review, quality, major: entries.some((entry) => entry.major), evidence } };
  } catch {
    return { unavailable: true };
  }
}
