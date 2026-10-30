// Conservative diagnostics, not calibrated probabilities or expected match pt.
// Confidence is a rule strength (1 or 2), not a statistical confidence level.
export const REVIEW_DIMENSIONS = ["efficiency", "defense", "value", "placement"];
const clamp = (n, low = 0, high = 100) => Math.max(low, Math.min(high, n));

export function assessDecisionEvidence(review) {
  const context = review.context;
  const candidates = review.evidenceCandidates;
  if (!context || !Array.isArray(candidates)) return null;
  const selected = candidates.find((candidate) => candidate.selected);
  if (!selected) return null;
  const dimensions = {};
  function add(name, loss, confidence, reason, major = false) {
    const entry = { loss: Math.round(clamp(loss)), confidence, reason, major };
    if (!dimensions[name] || entry.loss > dimensions[name].loss ||
        (entry.loss === dimensions[name].loss && confidence > dimensions[name].confidence)) dimensions[name] = entry;
  }
  const discards = candidates.filter((c) => c.action.type === "discard");
  const quiet = context.pressure < 0.72;
  const minimum = Math.min(...discards.map((c) => c.shanten));
  const efficient = discards.filter((c) => c.shanten === minimum);

  if (selected.action.type === "discard" || selected.action.type === "riichi") {
    for (const alternative of efficient) {
      const noValueGain = selected.value <= alternative.value + 0.5;
      const noSafetyGain = selected.risk >= alternative.risk - 0.05;
      const noShapeGain = selected.shape <= alternative.shape + 1;
      const noFutureGain = (selected.reserve ?? 0) <= (alternative.reserve ?? 0) + 0.5 &&
        (selected.special ?? 8) >= (alternative.special ?? 8) &&
        (selected.waitQuality ?? 0) <= (alternative.waitQuality ?? 0) + 0.5;
      if (quiet && noValueGain && noSafetyGain && noShapeGain && noFutureGain && selected.shanten > alternative.shanten) {
        add("efficiency", 65 * (selected.shanten - alternative.shanten), 2, "uncompensated_shanten", true);
      }
      if (quiet && selected.shanten === alternative.shanten && noValueGain && noShapeGain && noSafetyGain && noFutureGain) {
        const gap = alternative.ukeire - selected.ukeire;
        if (gap >= 4 && gap / Math.max(1, alternative.ukeire) > 0.15) {
          const loss = 100 * (gap / alternative.ukeire - 0.15) / 0.65;
          add("efficiency", loss, 2, "lost_acceptance", selected.shanten === 0 && selected.ukeire === 0 && loss >= 60);
        }
      }
    }
    // Correctly choosing between genuinely different live shapes is evidence;
    // merely avoiding a discard that breaks a completed block is not.
    const comparable = efficient.filter((c) => Math.abs(c.value - selected.value) <= 0.5 &&
      Math.abs(c.risk - selected.risk) <= 0.05 && Math.abs(c.shape - selected.shape) <= 1);
    if (quiet && selected.shanten === minimum && comparable.length >= 2 &&
        Math.max(...comparable.map((c) => c.ukeire)) - Math.min(...comparable.map((c) => c.ukeire)) >= 4 &&
        !dimensions.efficiency) add("efficiency", 0, 2, "live_shape_choice");

    const safe = discards.filter((c) => c.safe);
    const dangerous = discards.some((c) => !c.safe && c.risk >= 0.3);
    const weakHand = minimum >= 2 && Math.max(...efficient.map((c) => c.value)) < 3 && context.objective !== "chase";
    if (context.confirmedThreat && !quiet && safe.length && dangerous && weakHand) {
      if (selected.safe) add("defense", 0, 2, "safe_retreat");
      else if (selected.risk >= 0.3) {
        // A genbutsu alternative supplies evidence independent of the AI's
        // weighted danger ordering. A strong hand/chasing objective exempts it.
        const loss = clamp(40 + (selected.risk - 0.3) * 80);
        add("defense", loss, 2, "unnecessary_danger", loss >= 60);
      }
    }
    if (!quiet && !dimensions.defense && review.scoreLoss > 14) {
      const safer = discards.find((c) => c.risk + 0.3 < selected.risk && c.shanten <= selected.shanten && c.value >= selected.value - 0.5);
      if (safer) add("defense", Math.min(25, (selected.risk - safer.risk) * 20), 1, "uncertain_push_fold");
    }
    const equivalent = discards.filter((c) => c.shanten === selected.shanten &&
      Math.abs(c.ukeire - selected.ukeire) <= 1 && Math.abs(c.shape - selected.shape) <= 1 && Math.abs(c.risk - selected.risk) <= 0.05);
    const richer = equivalent.filter((c) => c.value >= selected.value + 0.75);
    if (richer.length) add("value", Math.min(60, (Math.max(...richer.map((c) => c.value)) - selected.value) * 30), 1, "lost_hand_value");
    else if (equivalent.some((c) => c.value <= selected.value - 0.75)) add("value", 0, 1, "preserved_hand_value");
  }

  if (context.claiming) {
    const useful = candidates.filter((c) => c.action.type === "claim" && !c.uncertain && c.yaku &&
      c.shanten < context.shanten && !context.preserveClosed && quiet);
    if (selected.action.type === "pass") {
      // Passing a call with no concrete speed/yaku benefit is intentionally
      // absent: repeatedly making that easy choice must not dilute errors.
      if (useful.length) add("efficiency", 20, 1, "declined_useful_call");
    } else if (!selected.uncertain) {
      if (useful.includes(selected)) add("efficiency", 0, 1, "useful_call");
      if (quiet && selected.shanten > context.shanten && selected.value <= context.value + 0.5) {
        add("efficiency", 65 * (selected.shanten - context.shanten), 2, "call_shanten_regression", true);
      }
      // Absence of a guaranteed yakuhai is not proof of no possible yaku.
      // Complex open routes therefore receive only a modest uncertain loss.
      if (!selected.yaku && selected.shanten >= context.shanten) add("value", 25, 1, "uncertain_open_route");
      else if (context.preserveClosed && selected.shanten >= context.shanten) add("value", 25, 1, "lost_closed_route");
      if (!quiet && selected.shanten >= 2 && selected.value < 3 && context.objective !== "chase") {
        add("defense", 20, 1, "uncertain_call_under_threat");
      }
    }
  }

  if (selected.action.type === "kan" || selected.uncertain) {
    if (selected.shanten > context.shanten || context.pressure >= 0.9) {
      add("value", 25, 1, "uncertain_kan_commitment");
    }
    // No positive evidence for speculative rinshan/dora benefits, and no
    // penalty for declining a kan merely preferred by the playing policy.
  }
  if (review.riichiAvailable && selected.action.type !== "kan") {
    const sameTile = candidates.filter((c) => c.tileKey === selected.tileKey && c.action.type !== "kan");
    const preferred = sameTile.reduce((best, c) => !best || c.score > best.score ? c : best, null);
    const gap = preferred ? Math.max(0, preferred.score - selected.score) : 0;
    const reason = review.riichiReason;
    const dimension = ["chase", "protect"].includes(reason) ? "placement" : "value";
    if (gap > 14) add(dimension, Math.min(25, gap / (context.modeScale || 1) / 6), 1, `riichi_${reason}`);
    else if (Math.abs(review.riichiPreference || 0) / (context.modeScale || 1) >= 60) add(dimension, 0, 1, `riichi_${reason}`);
  }
  // Explicitly retain uncertainty about final-hand objectives: heuristic
  // chase/protect labels alone never establish a major placement error.
  if (context.objective === "protect" && dimensions.defense) {
    add("placement", Math.min(25, dimensions.defense.loss / 3), 1, "protect_position");
  }
  return { hand: context.hand, dimensions };
}
