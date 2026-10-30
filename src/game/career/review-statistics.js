import { REVIEW_DIMENSIONS } from "./decision-evidence.js";

const counters = (a) => ({ reviewed: a.reviewed, qualityTotal: a.qualityTotal, majorMistakes: a.majorMistakes });
export function accumulateReview(analysis, review) {
  const evidence = review.evidence;
  if (evidence) {
    analysis.evidence ??= { version: 1, legacy: counters(analysis), hands: {} };
    const entries = Object.entries(evidence.dimensions);
    if (!entries.length) return;
    const hand = analysis.evidence.hands[evidence.hand] ??= { weight: 0, dimensions: {} };
    hand.weight += Math.max(...entries.map(([, entry]) => entry.confidence));
    for (const [dimension, entry] of entries) {
      const total = hand.dimensions[dimension] ??= { weight: 0, lossTotal: 0, majorWeight: 0 };
      total.weight += entry.confidence;
      total.lossTotal += entry.loss * entry.confidence;
      total.majorWeight += entry.major ? entry.confidence : 0;
    }
  }
  analysis.reviewed += 1;
  analysis.qualityTotal += review.quality;
  analysis.majorMistakes += review.major ? 1 : 0;
}

export function summarizeReviews(analyses) {
  const dimensions = Object.fromEntries(REVIEW_DIMENSIONS.map((name) => [name, { weight: 0, lossTotal: 0, majorWeight: 0 }]));
  let effectiveReviews = 0, legacyCount = 0, legacyQuality = 0, legacyMajor = 0, hasEvidence = false;
  for (const analysis of analyses) {
    const evidence = analysis.evidence;
    const legacy = evidence?.legacy ?? analysis;
    legacyCount += legacy.reviewed;
    legacyQuality += legacy.qualityTotal;
    legacyMajor += legacy.majorMistakes;
    if (!evidence) continue;
    hasEvidence = true;
    for (const hand of Object.values(evidence.hands)) {
      // Multiple related decisions in one hand cannot masquerade as an
      // unlimited number of independent observations. Late errors still enter.
      effectiveReviews += Math.min(12, hand.weight) / 2;
      for (const name of REVIEW_DIMENSIONS) {
        const source = hand.dimensions[name];
        if (!source?.weight) continue;
        const weight = Math.min(6, source.weight);
        dimensions[name].weight += weight;
        dimensions[name].lossTotal += source.lossTotal / source.weight * weight;
        dimensions[name].majorWeight += source.majorWeight / source.weight * weight;
      }
    }
  }
  if (!hasEvidence) return { reviewed: legacyCount, quality: legacyCount ? legacyQuality / legacyCount : 80,
    majorRate: legacyCount ? legacyMajor / legacyCount : 0, dimensions: null };
  let quality = 0, majorRate = 0;
  for (const value of Object.values(dimensions)) {
    value.quality = value.weight ? 100 - value.lossTotal / value.weight : 80;
    const reliability = Math.min(1, value.weight / 12);
    // Unobserved abilities stay neutral, and a handful of successes cannot
    // certify an entire ability. Four fixed shares prevent category dilution.
    quality += (80 + (value.quality - 80) * reliability) / REVIEW_DIMENSIONS.length;
    if (value.weight) majorRate = Math.max(majorRate, value.majorWeight / value.weight);
  }
  const reviewed = effectiveReviews + legacyCount;
  return { reviewed, quality: reviewed ? (quality * effectiveReviews + legacyQuality) / reviewed : 80,
    majorRate: Math.max(majorRate, legacyCount ? legacyMajor / legacyCount : 0), dimensions };
}

export function validReviewEvidence(evidence) {
  if (evidence === undefined) return true; // Existing career records remain readable.
  const nonnegative = (n) => Number.isSafeInteger(n) && n >= 0;
  const validCounters = (a) => a && [a.reviewed, a.qualityTotal, a.majorMistakes].every(nonnegative) &&
    a.qualityTotal <= 100 * a.reviewed && a.majorMistakes <= a.reviewed;
  return evidence?.version === 1 && validCounters(evidence.legacy) &&
    evidence.hands && !Array.isArray(evidence.hands) && typeof evidence.hands === "object" &&
    Object.keys(evidence.hands).length <= 512 && Object.entries(evidence.hands).every(([key, hand]) =>
      /^\d+:\d+:\d+:\d+$/.test(key) && hand && nonnegative(hand.weight) && hand.dimensions &&
      typeof hand.dimensions === "object" && !Array.isArray(hand.dimensions) && Object.keys(hand.dimensions).length > 0 &&
      Object.entries(hand.dimensions).every(([name, value]) =>
        REVIEW_DIMENSIONS.includes(name) && value && [value.weight, value.lossTotal, value.majorWeight].every(nonnegative) &&
        value.weight > 0 && value.weight <= hand.weight && value.lossTotal <= 100 * value.weight && value.majorWeight <= value.weight));
}
